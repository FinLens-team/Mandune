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

export const TRUSTED_MEDIA_HOSTS = [
  "cnstock.com",
  "stcn.com",
  "cs.com.cn",
  "yicai.com",
  "caixin.com",
] as const;

export type BochaSourceTier = "official" | "trusted_media" | "other";

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

export type BochaSourceDocumentResult =
  | {
      status: "available";
      sourceTier: Exclude<BochaSourceTier, "other">;
      title?: string;
      excerpt: string;
    }
  | { status: "unavailable"; sourceTier: BochaSourceTier; reason: string };

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

function normalizedHost(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return undefined;
    return url.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

function hostMatches(host: string, allowed: readonly string[]): boolean {
  return allowed.some((value) => host === value || host.endsWith(`.${value}`));
}

export function sourceTierForUrl(value: string): BochaSourceTier {
  const host = normalizedHost(value);
  if (!host) return "other";
  if (hostMatches(host, PRIMARY_SOURCE_HOSTS)) return "official";
  if (hostMatches(host, TRUSTED_MEDIA_HOSTS)) return "trusted_media";
  return "other";
}

export function isPrimarySourceUrl(value: string): boolean {
  return sourceTierForUrl(value) === "official";
}

function extractDocument(html: string): { title?: string; excerpt: string } | undefined {
  const withoutNoise = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ");
  const titleMatch = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(withoutNoise);
  const text = withoutNoise
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return undefined;
  const title = titleMatch?.[1]?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return { ...(title ? { title: title.slice(0, 240) } : {}), excerpt: text.slice(0, 2_000) };
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

  async fetchSourceDocument(candidate: BochaCandidate, signal: AbortSignal): Promise<BochaSourceDocumentResult> {
    const sourceTier = sourceTierForUrl(candidate.url);
    if (sourceTier === "other") {
      return { status: "unavailable", sourceTier, reason: "source_not_allowlisted" };
    }
    try {
      const response = await this.fetchImpl(candidate.url, {
        method: "GET",
        redirect: "manual",
        signal,
        headers: { Accept: "text/html,text/plain;q=0.9" },
      });
      if (!response.ok) {
        return { status: "unavailable", sourceTier, reason: `http_${response.status}` };
      }
      const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
      if (contentType && !contentType.includes("text/html") && !contentType.includes("text/plain")) {
        return { status: "unavailable", sourceTier, reason: "unsupported_content_type" };
      }
      const declaredLength = Number(response.headers.get("content-length"));
      if (Number.isFinite(declaredLength) && declaredLength > 1_000_000) {
        return { status: "unavailable", sourceTier, reason: "document_too_large" };
      }
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength > 1_000_000) {
        return { status: "unavailable", sourceTier, reason: "document_too_large" };
      }
      const document = extractDocument(new TextDecoder().decode(bytes));
      return document
        ? { status: "available", sourceTier, ...document }
        : { status: "unavailable", sourceTier, reason: "document_empty" };
    } catch (error) {
      return {
        status: "unavailable",
        sourceTier,
        reason: signal.aborted ? "cancelled" : error instanceof Error ? error.name : "fetch_failed",
      };
    }
  }
}
