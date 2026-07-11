import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { resolvePublisher } from "@/lib/publisher";
import { canEditContent } from "@/lib/roles";
import { rateLimit } from "@/lib/rate-limit";
import type { SessionPayload } from "@/lib/auth";

/** Requests per minute allowed per token-authenticated user on /api/v1. */
const RATE_LIMIT_PER_MINUTE = 240;

export interface AuthorizedPublisherRequest {
  session: SessionPayload;
  ownerType: "user" | "org";
  ownerId: number;
  publisherSlug: string;
}

/**
 * Shared guard for every /api/v1/publishers/[publisher]/** route:
 * Bearer auth (401) → rate limit (429) → publisher resolution (404) →
 * edit rights (403). Edit rights are required even for GETs — /api/v1 is an
 * authoring API, which deliberately sidesteps the public visibility rules.
 */
export async function authorizePublisherRequest(
  request: Request,
  publisherSlug: string
): Promise<AuthorizedPublisherRequest | NextResponse> {
  const auth = await requireApiSession(request);
  if (auth instanceof NextResponse) return auth;

  if (!rateLimit(`api-v1:${auth.userId}`, RATE_LIMIT_PER_MINUTE, 60_000)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const pub = await resolvePublisher(publisherSlug);
  if (!pub) {
    return NextResponse.json({ error: "publisher_not_found" }, { status: 404 });
  }

  const ownerType = pub.kind === "user" ? ("user" as const) : ("org" as const);
  const ownerId = (pub.kind === "user" ? pub.userId : pub.orgId)!;

  if (!(await canEditContent(auth, ownerType, ownerId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  return { session: auth, ownerType, ownerId, publisherSlug };
}

/**
 * Reads the If-Match precondition header (the base contentHash the client
 * pulled). Returns the unquoted hash, or null when the header is absent.
 */
export function getIfMatchHash(request: Request): string | null {
  const raw = request.headers.get("if-match");
  if (!raw) return null;
  return raw.trim().replace(/^"|"$/g, "");
}

/** 428 response for write routes called without the required If-Match header. */
export function preconditionRequired(): NextResponse {
  return NextResponse.json(
    {
      error: "precondition_required",
      message: "Provide the base contentHash in an If-Match header.",
    },
    { status: 428 }
  );
}
