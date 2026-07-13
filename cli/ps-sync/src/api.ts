/** Typed fetch client for the /api/v1 sync API. */

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string
  ) {
    super(message ?? `API error ${status} (${code})`);
    this.name = "ApiError";
  }
}

/** 412: the article changed remotely since the recorded base. */
export class ConflictError extends ApiError {
  constructor(
    public remoteContentHash: string,
    public remoteUpdatedAt: string | null
  ) {
    super(412, "conflict", "Remote content changed since last pull");
    this.name = "ConflictError";
  }
}

export interface RemoteArticleSummary {
  id: number;
  slug: string;
  title: string;
  summary: string | null;
  status: string;
  isInternal: boolean;
  parentBookId: number | null;
  updatedAt: string | null;
  contentHash: string;
}

export interface RemoteArticle extends Omit<RemoteArticleSummary, "status"> {
  metadata: unknown;
  content: string;
}

export interface RemoteBookSummary {
  id: number;
  slug: string;
  title: string;
  summary: string | null;
  updatedAt: string | null;
}

export interface RemoteBook {
  slug: string;
  title: string;
  summary: string | null;
  structureHash: string;
  chapters: Array<{
    position: number;
    partTitle: string | null;
    articleId: number;
    articleSlug: string;
    title: string;
    isInternal: boolean;
  }>;
}

export interface MeResponse {
  userId: number;
  email: string;
  publisherSlug: string;
  publishers: Array<{ slug: string; kind: "user" | "org" }>;
}

export class ApiClient {
  constructor(
    private server: string,
    private token: string
  ) {
    this.server = server.replace(/\/+$/, "");
  }

  /** The server origin after following any permanent redirects (apex → www). */
  get baseUrl(): string {
    return this.server;
  }

  private async request<T>(
    method: string,
    path: string,
    opts: { body?: unknown; ifMatch?: string; expectNoContent?: boolean } = {}
  ): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
    };
    if (opts.body !== undefined) headers["Content-Type"] = "application/json";
    if (opts.ifMatch) headers["If-Match"] = `"${opts.ifMatch}"`;

    // Follow redirects by hand: Node's fetch strips the Authorization header
    // on cross-origin redirects (e.g. apex domain 308 → www), which would turn
    // every authenticated call into a silent 401.
    let url = `${this.server}${path}`;
    let res: Response;
    for (let hop = 0; ; hop++) {
      try {
        res = await fetch(url, {
          method,
          headers,
          body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
          redirect: "manual",
        });
      } catch (err) {
        throw new ApiError(0, "network_error", `Cannot reach ${url}: ${String(err)}`);
      }
      if (![301, 302, 307, 308].includes(res.status)) break;
      const location = res.headers.get("location");
      if (!location || hop >= 3) {
        throw new ApiError(res.status, "redirect_loop", `Too many redirects at ${url}`);
      }
      const next = new URL(location, url);
      // Permanent redirect of the origin: remember it so the caller can
      // persist the canonical server URL and later calls skip the hop.
      if ([301, 308].includes(res.status) && next.origin !== new URL(url).origin) {
        this.server = next.origin;
      }
      url = next.toString();
    }

    if (res.status === 204) return undefined as T;

    let json: Record<string, unknown> | null = null;
    try {
      json = (await res.json()) as Record<string, unknown>;
    } catch {
      // non-JSON error body
    }

    if (!res.ok) {
      if (res.status === 412 && json) {
        throw new ConflictError(
          String(json.remoteContentHash ?? json.remoteStructureHash ?? ""),
          (json.remoteUpdatedAt as string | null) ?? null
        );
      }
      const code = (json?.error as string) ?? `http_${res.status}`;
      const detail =
        res.status === 401
          ? "Token rejected — is it valid, unexpired, and not revoked?"
          : res.status === 403
            ? "Token's user has no edit rights on this publisher (is the email verified?)"
            : undefined;
      throw new ApiError(res.status, code, detail);
    }

    return json as T;
  }

  me(): Promise<MeResponse> {
    return this.request("GET", "/api/v1/me");
  }

  listArticles(publisher: string): Promise<{ articles: RemoteArticleSummary[] }> {
    return this.request("GET", `/api/v1/publishers/${publisher}/articles`);
  }

  getArticle(publisher: string, slug: string): Promise<RemoteArticle> {
    return this.request("GET", `/api/v1/publishers/${publisher}/articles/${slug}`);
  }

  createArticle(
    publisher: string,
    body: { slug: string; title: string; summary?: string; content: string }
  ): Promise<{ id: number; slug: string; contentHash: string; updatedAt: string }> {
    return this.request("POST", `/api/v1/publishers/${publisher}/articles`, { body });
  }

  updateArticle(
    publisher: string,
    slug: string,
    body: { title?: string; summary?: string; content: string; editNote?: string },
    baseHash: string
  ): Promise<{ contentHash: string; updatedAt: string }> {
    return this.request("PUT", `/api/v1/publishers/${publisher}/articles/${slug}`, {
      body,
      ifMatch: baseHash,
    });
  }

  deleteArticle(publisher: string, slug: string, baseHash: string): Promise<void> {
    return this.request("DELETE", `/api/v1/publishers/${publisher}/articles/${slug}`, {
      ifMatch: baseHash,
      expectNoContent: true,
    });
  }

  listBooks(publisher: string): Promise<{ books: RemoteBookSummary[] }> {
    return this.request("GET", `/api/v1/publishers/${publisher}/books`);
  }

  getBook(publisher: string, slug: string): Promise<RemoteBook> {
    return this.request("GET", `/api/v1/publishers/${publisher}/books/${slug}`);
  }

  updateBookStructure(
    publisher: string,
    slug: string,
    chapters: { articleSlug: string; partTitle: string | null }[],
    baseHash: string
  ): Promise<{ structureHash: string; updatedAt: string }> {
    return this.request("PUT", `/api/v1/publishers/${publisher}/books/${slug}`, {
      body: { chapters },
      ifMatch: baseHash,
    });
  }
}
