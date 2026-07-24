export const BOCHA_SEARCH_ENDPOINT = "https://api.bocha.cn/v1/web-search";
export const MAX_BOCHA_RESULT_COUNT = 50;

export const PRIMARY_SOURCE_HOSTS = [
  "sse.com.cn",
  "szse.cn",
  "csrc.gov.cn",
  "amac.org.cn",
  "csindex.com.cn",
  "huatai-pb.com",
  "efunds.com.cn",
] as const;

export interface BochaCandidate {
  id: string;
  title: string;
  url: string;
  siteName?: string;
  publishedAt?: string;
}

export type BochaSearchResult =
  | { status: "available"; candidates: BochaCandidate[] }
  | { status: "empty"; candidates: [] }
  | { status: "rate_limited" | "failed" | "malformed"; candidates: []; reason: string };

export interface BochaSearchRequest {
  query: string;
  count: number;
  signal: AbortSignal;
  freshness?: "noLimit";
}

type FetchLike = typeof fetch;

interface BochaResponsePage {
  name?: unknown;
  url?: unknown;
  siteName?: unknown;
  datePublished?: unknown;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function responseCandidates(body: unknown): BochaCandidate[] | undefined {
  if (typeof body !== "object" || body === null) {
    return undefined;
  }
  const root = body as { code?: unknown; data?: { webPages?: { value?: unknown } } };
  if (root.code !== 200 && root.code !== "200") {
    return undefined;
  }
  const values = root.data?.webPages?.value;
  if (!Array.isArray(values)) {
    return undefined;
  }

  return values.flatMap((item, index) => {
    const page = item as BochaResponsePage;
    if (!nonEmptyString(page?.name) || !nonEmptyString(page.url)) {
      return [];
    }
    return [
      {
        id: `${index + 1}`,
        title: page.name,
        url: page.url,
        ...(nonEmptyString(page.siteName) ? { siteName: page.siteName } : {}),
        ...(nonEmptyString(page.datePublished) ? { publishedAt: page.datePublished } : {}),
      },
    ];
  });
}

function businessCode(body: unknown): string | number | undefined {
  if (typeof body !== "object" || body === null) {
    return undefined;
  }
  const value = (body as { code?: unknown }).code;
  return typeof value === "string" || typeof value === "number" ? value : undefined;
}

export function isPrimarySourceUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") {
      return false;
    }
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    return PRIMARY_SOURCE_HOSTS.some(
      (allowed) => host === allowed || host.endsWith(`.${allowed}`),
    );
  } catch {
    return false;
  }
}

export class BochaWebSearchClient {
  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  async search(request: BochaSearchRequest): Promise<BochaSearchResult> {
    if (!request.query.trim()) {
      return { status: "failed", candidates: [], reason: "query_empty" };
    }
    if (!Number.isInteger(request.count) || request.count < 1 || request.count > MAX_BOCHA_RESULT_COUNT) {
      return { status: "failed", candidates: [], reason: "count_out_of_range" };
    }
    if (!this.apiKey) {
      return { status: "failed", candidates: [], reason: "credentials_unavailable" };
    }

    try {
      const response = await this.fetchImpl(BOCHA_SEARCH_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: request.query,
          freshness: request.freshness ?? "noLimit",
          summary: true,
          count: request.count,
        }),
        signal: request.signal,
      });
      if (response.status === 429) {
        return { status: "rate_limited", candidates: [], reason: "http_429" };
      }
      if (!response.ok) {
        return { status: "failed", candidates: [], reason: `http_${response.status}` };
      }
      const body: unknown = await response.json();
      const code = businessCode(body);
      if (code === 401 || code === 403 || code === "401" || code === "403") {
        return { status: "failed", candidates: [], reason: "auth_failed" };
      }
      if (code === 429 || code === "429") {
        return { status: "rate_limited", candidates: [], reason: "business_429" };
      }
      const candidates = responseCandidates(body);
      if (!candidates) {
        return { status: "malformed", candidates: [], reason: "unexpected_response_shape" };
      }
      return candidates.length > 0
        ? { status: "available", candidates }
        : { status: "empty", candidates: [] };
    } catch (error) {
      return {
        status: "failed",
        candidates: [],
        reason: request.signal.aborted ? "cancelled" : error instanceof Error ? error.name : "request_failed",
      };
    }
  }

  async locatePrimarySource(candidate: BochaCandidate, signal: AbortSignal): Promise<"located" | "unavailable"> {
    if (!isPrimarySourceUrl(candidate.url)) {
      return "unavailable";
    }
    try {
      const response = await this.fetchImpl(candidate.url, {
        method: "GET",
        redirect: "manual",
        signal,
      });
      return response.ok ? "located" : "unavailable";
    } catch {
      return "unavailable";
    }
  }
}
