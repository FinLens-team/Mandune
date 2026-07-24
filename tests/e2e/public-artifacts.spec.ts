import { expect, test } from "@playwright/test";

const SAFE_HEALTH_FIELDS = ["service", "status", "uptime_seconds", "version"];
const SENSITIVE_PUBLIC_PATHS = [
  "/.env",
  "/.git/HEAD",
  "/package.json",
  "/pnpm-lock.yaml",
  "/migrations/001-initial.sql",
  "/src/server/index.ts",
];
const CLIENT_SECRET_PATTERN =
  /(?:BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY|Bearer\s+[A-Za-z0-9._-]{16,}|MODEL_API_KEY\s*[:=]|PANDAAI_[A-Z_]*(?:KEY|TOKEN|PASSWORD)\s*[:=]|BOCHA_[A-Z_]*(?:KEY|TOKEN)\s*[:=])/;

test("public health and static artifacts expose only release-safe data", async ({ request, baseURL }) => {
  expect(baseURL).toBeTruthy();
  const origin = new URL(baseURL!);
  expect(origin.protocol).toBe("https:");
  const expectedVersion = process.env.E2E_EXPECTED_VERSION;
  expect(expectedVersion, "E2E_EXPECTED_VERSION must bind the URL to the candidate release").toMatch(
    /^[A-Za-z0-9._-]{1,128}$/,
  );

  const health = await request.get("/health");
  expect(health.status()).toBe(200);
  expect(health.headers()["content-type"]).toContain("application/json");
  const healthBody = await health.json() as Record<string, unknown>;
  expect(Object.keys(healthBody).sort()).toEqual(SAFE_HEALTH_FIELDS);
  expect(healthBody).toMatchObject({ service: "mandong", status: "ok" });
  expect(healthBody.version).toBe(expectedVersion);
  expect(String(healthBody.version)).not.toMatch(CLIENT_SECRET_PATTERN);

  for (const path of SENSITIVE_PUBLIC_PATHS) {
    const response = await request.get(path, { failOnStatusCode: false });
    expect(response.status(), `${path} must not be public`).toBe(404);
  }

  const entry = await request.get("/");
  expect(entry.status()).toBe(200);
  const html = await entry.text();
  expect(html).not.toMatch(CLIENT_SECRET_PATTERN);
  expect(html).not.toMatch(/sourceMappingURL/i);

  const assetUrls = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)]
    .map((match) => match[1])
    .filter((value): value is string => Boolean(value));
  expect(assetUrls.length).toBeGreaterThan(0);
  for (const assetUrl of assetUrls) {
    const asset = await request.get(assetUrl);
    expect(asset.status(), assetUrl).toBe(200);
    const body = await asset.text();
    expect(body, assetUrl).not.toMatch(CLIENT_SECRET_PATTERN);
    expect(body, assetUrl).not.toMatch(/sourceMappingURL/i);

    const map = await request.get(`${assetUrl}.map`, { failOnStatusCode: false });
    expect(map.status(), `${assetUrl}.map must not be public`).toBe(404);
  }
});
