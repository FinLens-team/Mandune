import {
  completeOnboarding,
  runAnalysisAndOpenResult,
  verifyDrawerAndEmptySecondaryViews,
  verifyImmutableHistory,
} from "./journey.js";
import { expect, expectPublicPrivacySurface, test } from "./fixtures.js";

test("ordinary public URL completes S0-S10 and preserves immutable history", async ({ page }, testInfo) => {
  const seed = await completeOnboarding(page);
  await verifyDrawerAndEmptySecondaryViews(page, testInfo);
  const result = await runAnalysisAndOpenResult(page);
  await verifyImmutableHistory(page, result);
  await expectPublicPrivacySurface(page);

  expect(seed).toMatch(/^demo-/);
  expect(result.analysisId).toMatch(/^analysis_/);
});

test("returning workspace skips first-run screens without exposing locator data", async ({ page }) => {
  await completeOnboarding(page);
  await page.reload();

  await expect(page.getByRole("heading", { level: 1, name: /和兜兜一起/ })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "选择长笺主题" })).toHaveCount(0);
  await expect(page).toHaveURL(/\/$/);
  await expectPublicPrivacySurface(page);
});
