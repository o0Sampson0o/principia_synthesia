"use server";

import { db } from "@/db";
import { articles, books, comments, curriculumEntries, publishers } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { getSession, requireSession, type SessionPayload } from "@/lib/auth";
import { resolvePublisher, type ResolvedPublisher } from "@/lib/publisher";
import { canView } from "@/lib/access";
import { canEditContent } from "@/lib/roles";
import {
  GUEST_EDIT_WINDOW_MS,
  getClientIpHash,
  getGuestTokenHash,
  verifyTurnstile,
} from "@/lib/comments";
import { rateLimit } from "@/lib/rate-limit";
import {
  notify,
  resolveArticleAuthors,
  type CommentPostedPayload,
} from "@/lib/notifications";
import {
  commentSubjectSchema,
  createCommentSchema,
  deleteCommentSchema,
  editCommentSchema,
  guestCommentSchema,
  moderateCommentSchema,
  type CommentSubject,
} from "@/lib/validations";
import { revalidatePath } from "next/cache";

// ---------------------------------------------------------------------------
// Subject resolution
// ---------------------------------------------------------------------------

interface ResolvedSubject {
  pub: ResolvedPublisher;
  ownerType: "user" | "org";
  ownerId: number;
  /** Exactly one is set — mirrors the comments table CHECK. */
  articleId: number | null;
  bookId: number | null;
  subject: CommentSubject;
  title: string;
}

/**
 * Resolves a comment subject (bound args are client-tamperable, so everything
 * is re-derived and re-checked here) and confirms it is visible to the caller.
 */
async function resolveSubject(
  publisherSlug: string,
  rawSubject: CommentSubject,
  session: SessionPayload | null
): Promise<ResolvedSubject> {
  const subject = commentSubjectSchema.parse(rawSubject);

  const pub = await resolvePublisher(publisherSlug);
  if (!pub) throw new Error("Publisher not found");
  const ownerType = pub.kind;
  const ownerId = (pub.kind === "user" ? pub.userId : pub.orgId)!;

  let articleId: number | null = null;
  let bookId: number | null = null;
  let title = "";

  if (subject.kind === "article") {
    const [article] = await db
      .select({
        id: articles.id,
        title: articles.title,
        isInternal: articles.isInternal,
        parentBookId: articles.parentBookId,
      })
      .from(articles)
      .where(
        and(
          eq(articles.slug, subject.slug),
          eq(articles.ownerType, ownerType),
          eq(articles.ownerId, ownerId),
          isNull(articles.deletedAt)
        )
      )
      .limit(1);
    if (!article) throw new Error("Article not found");
    articleId = article.id;
    title = article.title;

    // Internal chapters have no standalone visibility — gate by their book.
    if (article.isInternal && article.parentBookId !== null) {
      const [parentBook] = await db
        .select({ slug: books.slug, ownerType: books.ownerType, ownerId: books.ownerId })
        .from(books)
        .where(and(eq(books.id, article.parentBookId), isNull(books.deletedAt)))
        .limit(1);
      if (!parentBook) throw new Error("Book not found");
      const bookVisible = await canView(
        {
          type: "book",
          ownerType: parentBook.ownerType as "user" | "org",
          ownerId: parentBook.ownerId,
          slug: parentBook.slug,
        },
        session
      );
      if (!bookVisible) throw new Error("Forbidden");
      return { pub, ownerType, ownerId, articleId, bookId: null, subject, title };
    }
  } else {
    const [book] = await db
      .select({ id: books.id, title: books.title })
      .from(books)
      .where(
        and(
          eq(books.slug, subject.slug),
          eq(books.ownerType, ownerType),
          eq(books.ownerId, ownerId),
          isNull(books.deletedAt)
        )
      )
      .limit(1);
    if (!book) throw new Error("Book not found");
    bookId = book.id;
    title = book.title;
  }

  const visible = await canView(
    { type: subject.kind, ownerType, ownerId, slug: subject.slug },
    session
  );
  if (!visible) throw new Error("Forbidden");

  return { pub, ownerType, ownerId, articleId, bookId, subject, title };
}

/**
 * Revalidates every page that renders this subject's thread: the article page
 * plus any chapter pages (an article can be a chapter of several books), or
 * the book landing page.
 */
async function revalidateSubjectPaths(resolved: ResolvedSubject): Promise<void> {
  const { pub, subject } = resolved;
  if (subject.kind === "book") {
    revalidatePath(`/${pub.slug}/books/${subject.slug}`);
    return;
  }

  revalidatePath(`/${pub.slug}/articles/${subject.slug}`);
  const chapterBooks = await db
    .select({ bookSlug: books.slug })
    .from(curriculumEntries)
    .innerJoin(books, and(eq(curriculumEntries.bookId, books.id), isNull(books.deletedAt)))
    .where(eq(curriculumEntries.articleId, resolved.articleId!));
  for (const { bookSlug } of chapterBooks) {
    revalidatePath(`/${pub.slug}/books/${bookSlug}/${subject.slug}`);
  }
}

/** Loads a live (non-deleted) comment and asserts it belongs to the subject. */
async function loadOwnComment(resolved: ResolvedSubject, commentId: number) {
  const [comment] = await db
    .select({
      id: comments.id,
      authorId: comments.authorId,
      guestTokenHash: comments.guestTokenHash,
      createdAt: comments.createdAt,
    })
    .from(comments)
    .where(
      and(
        eq(comments.id, commentId),
        resolved.articleId !== null
          ? eq(comments.articleId, resolved.articleId)
          : eq(comments.bookId, resolved.bookId!),
        isNull(comments.deletedAt)
      )
    )
    .limit(1);
  if (!comment) throw new Error("Comment not found");
  return comment;
}

/**
 * Guest ownership: the comment is a guest comment, the caller's cookie token
 * hashes to the stored hash, and the comment is still inside the edit window.
 */
async function isOwningGuest(comment: {
  authorId: number | null;
  guestTokenHash: string | null;
  createdAt: Date;
}): Promise<boolean> {
  if (comment.authorId !== null || !comment.guestTokenHash) return false;
  const cookieHash = await getGuestTokenHash({ mint: false });
  if (!cookieHash || cookieHash !== comment.guestTokenHash) return false;
  return Date.now() - comment.createdAt.getTime() <= GUEST_EDIT_WINDOW_MS;
}

// ---------------------------------------------------------------------------
// createComment
// ---------------------------------------------------------------------------

/**
 * Post a new comment (or reply) on an article/chapter or book.
 *
 * Logged-in users post as `approved`. Guests pass the spam gauntlet —
 * honeypot, per-IP rate limits, Cloudflare Turnstile — and land in the
 * moderation queue (`pending`) unless the publisher allows unmoderated guests.
 */
export async function createComment(
  publisherSlug: string,
  subject: CommentSubject,
  formData: FormData
): Promise<void> {
  const session = await getSession();
  const resolved = await resolveSubject(publisherSlug, subject, session);

  // Honeypot: real users never see (or fill) the "website" field. Drop the
  // submission silently so bots can't tell they were caught.
  if (!session && formData.get("website")) return;

  const raw = {
    parentId: formData.get("parentId") ?? undefined,
    body: formData.get("body"),
    guestName: formData.get("guestName"),
  };

  // If replying, the parent must be a live comment on the same subject.
  const parentId = raw.parentId ? Number(raw.parentId) : undefined;
  let parentAuthorId: number | null = null;
  if (parentId !== undefined) {
    const [parent] = await db
      .select({ id: comments.id, authorId: comments.authorId })
      .from(comments)
      .where(
        and(
          eq(comments.id, parentId),
          resolved.articleId !== null
            ? eq(comments.articleId, resolved.articleId)
            : eq(comments.bookId, resolved.bookId!),
          isNull(comments.deletedAt)
        )
      )
      .limit(1);
    if (!parent) throw new Error("Parent comment not found");
    parentAuthorId = parent.authorId;
  }

  let insertedId: number;
  let authorName: string;
  let pending = false;

  if (session) {
    const validated = createCommentSchema.parse(raw);
    const [inserted] = await db
      .insert(comments)
      .values({
        articleId: resolved.articleId,
        bookId: resolved.bookId,
        authorId: session.userId,
        parentId: validated.parentId ?? null,
        body: validated.body,
        status: "approved",
      })
      .returning({ id: comments.id });
    insertedId = inserted.id;
    authorName = session.userSlug;
  } else {
    const validated = guestCommentSchema.parse(raw);

    const ipHash = await getClientIpHash();
    if (
      !rateLimit(`comment:minute:${ipHash}`, 3, 60_000) ||
      !rateLimit(`comment:day:${ipHash}`, 20, 24 * 60 * 60_000)
    ) {
      throw new Error("Too many comments — please try again later");
    }

    const turnstileOk = await verifyTurnstile(
      formData.get("cf-turnstile-response") as string | null
    );
    if (!turnstileOk) throw new Error("Verification failed — please try again");

    const guestTokenHash = await getGuestTokenHash({ mint: true });
    pending = !resolved.pub.allowUnmoderatedGuests;

    const [inserted] = await db
      .insert(comments)
      .values({
        articleId: resolved.articleId,
        bookId: resolved.bookId,
        authorId: null,
        guestName: validated.guestName,
        guestTokenHash,
        ipHash,
        parentId: validated.parentId ?? null,
        body: validated.body,
        status: pending ? "pending" : "approved",
      })
      .returning({ id: comments.id });
    insertedId = inserted.id;
    authorName = validated.guestName;
  }

  // Notify the publisher's editors (and the parent comment's author on
  // replies), never the commenter themself. Failures must not lose the
  // comment — notification insert errors are swallowed.
  try {
    const recipients = new Set(
      await resolveArticleAuthors(resolved.ownerType, resolved.ownerId)
    );
    if (parentAuthorId !== null) recipients.add(parentAuthorId);
    if (session) recipients.delete(session.userId);

    const payload: CommentPostedPayload = {
      commentId: insertedId,
      publisherSlug: resolved.pub.slug,
      subjectKind: resolved.subject.kind,
      subjectSlug: resolved.subject.slug,
      subjectTitle: resolved.title,
      authorName,
      pending,
    };
    await Promise.all(
      [...recipients].map((userId) => notify(userId, "comment_posted", payload))
    );
  } catch {
    // best-effort
  }

  await revalidateSubjectPaths(resolved);
}

// ---------------------------------------------------------------------------
// editComment
// ---------------------------------------------------------------------------

/**
 * Edit the body of a comment. Allowed for the logged-in author, or for the
 * guest who posted it (cookie token match) within the edit window.
 */
export async function editComment(
  publisherSlug: string,
  subject: CommentSubject,
  formData: FormData
): Promise<void> {
  const session = await getSession();
  const resolved = await resolveSubject(publisherSlug, subject, session);

  const validated = editCommentSchema.parse({
    commentId: formData.get("commentId"),
    body: formData.get("body"),
  });

  const comment = await loadOwnComment(resolved, validated.commentId);

  const isAuthor = session !== null && comment.authorId === session.userId;
  if (!isAuthor && !(await isOwningGuest(comment))) throw new Error("Forbidden");

  await db
    .update(comments)
    .set({ body: validated.body, updatedAt: new Date() })
    .where(eq(comments.id, comment.id));

  await revalidateSubjectPaths(resolved);
}

// ---------------------------------------------------------------------------
// deleteComment
// ---------------------------------------------------------------------------

/**
 * Soft-delete a comment. Allowed for the logged-in author, the posting guest
 * (within the edit window), or a publisher editor.
 */
export async function deleteComment(
  publisherSlug: string,
  subject: CommentSubject,
  formData: FormData
): Promise<void> {
  const session = await getSession();
  const resolved = await resolveSubject(publisherSlug, subject, session);

  const validated = deleteCommentSchema.parse({ commentId: formData.get("commentId") });
  const comment = await loadOwnComment(resolved, validated.commentId);

  const isAuthor = session !== null && comment.authorId === session.userId;
  const isEditor =
    session !== null &&
    (await canEditContent(session, resolved.ownerType, resolved.ownerId));

  if (!isAuthor && !isEditor && !(await isOwningGuest(comment))) {
    throw new Error("Forbidden");
  }

  await db
    .update(comments)
    .set({ deletedAt: new Date() })
    .where(eq(comments.id, comment.id));

  await revalidateSubjectPaths(resolved);
}

// ---------------------------------------------------------------------------
// moderateComment
// ---------------------------------------------------------------------------

/**
 * Approve a pending comment or mark it as spam. Publisher editors only.
 */
export async function moderateComment(
  publisherSlug: string,
  subject: CommentSubject,
  formData: FormData
): Promise<void> {
  const session = await requireSession();
  const resolved = await resolveSubject(publisherSlug, subject, session);

  const validated = moderateCommentSchema.parse({
    commentId: formData.get("commentId"),
    status: formData.get("status"),
  });

  const isEditor = await canEditContent(session, resolved.ownerType, resolved.ownerId);
  if (!isEditor) throw new Error("Forbidden");

  const comment = await loadOwnComment(resolved, validated.commentId);

  await db
    .update(comments)
    .set({ status: validated.status, updatedAt: new Date() })
    .where(eq(comments.id, comment.id));

  await revalidateSubjectPaths(resolved);
  revalidatePath(`/${resolved.pub.slug}/comments`);
}

// ---------------------------------------------------------------------------
// setGuestModeration
// ---------------------------------------------------------------------------

/**
 * Toggle whether guest comments on this publisher skip the moderation queue.
 * Publisher editors only.
 */
export async function setGuestModeration(
  publisherSlug: string,
  formData: FormData
): Promise<void> {
  const session = await requireSession();

  const pub = await resolvePublisher(publisherSlug);
  if (!pub) throw new Error("Publisher not found");
  const ownerType = pub.kind;
  const ownerId = (pub.kind === "user" ? pub.userId : pub.orgId)!;

  const isEditor = await canEditContent(session, ownerType, ownerId);
  if (!isEditor) throw new Error("Forbidden");

  const allowUnmoderatedGuests = formData.get("allowUnmoderatedGuests") === "true";
  await db
    .update(publishers)
    .set({ allowUnmoderatedGuests })
    .where(eq(publishers.slug, publisherSlug));

  revalidatePath(`/${publisherSlug}/comments`);
}
