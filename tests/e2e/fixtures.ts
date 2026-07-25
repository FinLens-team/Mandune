import {
  expect,
  test as base,
  type Page,
  type Request,
  type Response,
} from "@playwright/test";

interface RuntimeIssue {
  kind: "console" | "page" | "request" | "response" | "privacy";
  message: string;
}

const PRIVATE_PAYLOAD_PATTERN =
  /(?:authorization|bearer\s+[a-z0-9._-]{8,}|api[_-]?key|access[_-]?token|client[_-]?secret|model[_-]?(?:api[_-]?)?key|panda(?:ai)?[_-]?(?:token|key|password)|bocha[_-]?(?:token|key)|account[_-]?(?:name|number)|raw[_-]?screenshot|__Host-md_workspace)/i;

function safeUrl(raw: string): string {
  try {
    const url = new URL(raw);
    for (const key of [...url.searchParams.keys()]) url.searchParams.set(key, "[redacted]");
    url.username = "";
    url.password = "";
    return url.href;
  } catch {
    return "[invalid-url]";
  }
}

function safeMessage(message: string): string {
  return message
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/([?&][^=\s]+)=([^&\s]+)/g, "$1=[redacted]")
    .slice(0, 800);
}

function requestLabel(request: Request): string {
  return `${request.method()} ${safeUrl(request.url())}`;
}

function isNavigationCancelledWorkspaceProbe(request: Request): boolean {
  const url = new URL(request.url());
  return request.method() === "GET" &&
    url.pathname === "/api/workspaces/current" &&
    !url.search &&
    request.failure()?.errorText === "net::ERR_ABORTED";
}

function isFirstWorkspaceProbe401(response: Response, probeResponses: number): boolean {
  if (response.status() !== 401 || probeResponses !== 0) return false;
  const request = response.request();
  const url = new URL(request.url());
  return request.method() === "GET" && url.pathname === "/api/workspaces/current" && !url.search;
}

export const test = base.extend<{ runtimeIssues: RuntimeIssue[] }>({
  runtimeIssues: [async ({ page }, use, testInfo) => {
    const issues: RuntimeIssue[] = [];
    let workspaceProbeResponses = 0;

    if (testInfo.project.name === "mobile-375-reduced-motion") {
      await page.emulateMedia({ reducedMotion: "reduce" });
    }

    page.on("console", (message) => {
      const duplicatedNetworkError = /^Failed to load resource: the server responded with a status of \d+/.test(
        message.text(),
      );
      if (message.type() === "error" && !duplicatedNetworkError) {
        issues.push({ kind: "console", message: safeMessage(message.text()) });
      }
    });
    page.on("pageerror", (error) => {
      issues.push({ kind: "page", message: safeMessage(error.message) });
    });
    page.on("requestfailed", (request) => {
      if (isNavigationCancelledWorkspaceProbe(request)) return;
      issues.push({
        kind: "request",
        message: `${requestLabel(request)}: ${safeMessage(request.failure()?.errorText ?? "failed")}`,
      });
    });
    page.on("request", (request) => {
      const payload = request.postData();
      if (payload && PRIVATE_PAYLOAD_PATTERN.test(payload)) {
        issues.push({ kind: "privacy", message: `sensitive field in ${requestLabel(request)}` });
      }
    });
    page.on("response", (response) => {
      const request = response.request();
      const url = new URL(request.url());
      const workspaceProbe = request.method() === "GET" &&
        url.pathname === "/api/workspaces/current" &&
        !url.search;
      const allowed = isFirstWorkspaceProbe401(response, workspaceProbeResponses);
      if (workspaceProbe) workspaceProbeResponses += 1;
      if (response.status() >= 400 && !allowed) {
        issues.push({
          kind: "response",
          message: `${response.status()} ${requestLabel(request)}`,
        });
      }
    });

    await use(issues);

    if (issues.length > 0) {
      await testInfo.attach("runtime-issues.json", {
        body: Buffer.from(JSON.stringify(issues, null, 2)),
        contentType: "application/json",
      });
    }
    expect(issues, "public journey emitted console, page, network, HTTP, or privacy failures").toEqual([]);
  }, { auto: true }],
});

export { expect } from "@playwright/test";

export async function expectNoHorizontalOverflow(page: Page, label: string): Promise<void> {
  const dimensions = await page.evaluate(() => {
    const browser = globalThis as unknown as {
      document: { documentElement: { clientWidth: number; scrollWidth: number } };
    };
    return {
      clientWidth: browser.document.documentElement.clientWidth,
      scrollWidth: browser.document.documentElement.scrollWidth,
    };
  });
  expect(
    dimensions.scrollWidth,
    `${label} overflowed horizontally (${dimensions.scrollWidth}px > ${dimensions.clientWidth}px)`,
  ).toBeLessThanOrEqual(dimensions.clientWidth + 1);
}

export async function expectPublicPrivacySurface(page: Page): Promise<void> {
  const url = new URL(page.url());
  expect(url.username).toBe("");
  expect(url.password).toBe("");
  expect(url.search).toBe("");
  expect(url.hash).toBe("");

  const surface = await page.evaluate(() => {
    const browser = globalThis as unknown as {
      document: { body: { innerText: string } };
      localStorage: Record<string, string>;
      sessionStorage: Record<string, string>;
    };
    return {
      body: browser.document.body.innerText,
      local: Object.entries(browser.localStorage),
      session: Object.entries(browser.sessionStorage),
    };
  });
  expect(surface.body).not.toMatch(PRIVATE_PAYLOAD_PATTERN);
  expect(JSON.stringify(surface.local)).not.toMatch(PRIVATE_PAYLOAD_PATTERN);
  expect(JSON.stringify(surface.session)).not.toMatch(PRIVATE_PAYLOAD_PATTERN);

  const workspaceCookies = (await page.context().cookies()).filter(
    (cookie) => cookie.name === "__Host-md_workspace",
  );
  expect(workspaceCookies).toHaveLength(1);
  expect(workspaceCookies[0]).toMatchObject({
    httpOnly: true,
    path: "/",
    sameSite: "Lax",
    secure: true,
  });
}
