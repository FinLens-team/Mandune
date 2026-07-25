import {
  completeOnboarding,
  runAnalysisAndOpenResult,
  verifyDrawerAndEmptySecondaryViews,
  verifyImmutableHistory,
} from "./journey.js";
import { expect, expectPublicPrivacySurface, test } from "./fixtures.js";

const KNOWN_CONSTRAINTS = {
  investment_horizon: "3-5年",
  near_term_liquidity: "一般",
  tolerable_drawdown: "中等",
  investment_objective: "稳健增长",
} as const;

async function openPortfolioEditor(page: Parameters<typeof completeOnboarding>[0]): Promise<void> {
  await page.getByRole("button", { name: "打开工作区导航" }).click();
  await page
    .getByRole("dialog", { name: "工作区导航" })
    .getByRole("button", { name: "仓位／身份" })
    .click();
}

async function setConstraints(
  page: Parameters<typeof completeOnboarding>[0],
  values: Record<keyof typeof KNOWN_CONSTRAINTS, string>,
): Promise<void> {
  await openPortfolioEditor(page);
  const constraintsTab = page.getByRole("tab", { name: "四项约束" });
  if (await constraintsTab.isVisible()) await constraintsTab.click();
  for (const [name, value] of Object.entries(values)) {
    await page.locator(`select[name="${name}"]`).selectOption(value);
  }
  await page.getByRole("button", { name: "保存后续复盘输入" }).click();
  await expect(page.getByRole("heading", { level: 1, name: /和兜兜一起/ })).toBeVisible();
}

async function enableReducedMotion(page: Parameters<typeof completeOnboarding>[0]): Promise<void> {
  await page.getByRole("button", { name: "打开工作区导航" }).click();
  const drawer = page.getByRole("dialog", { name: "工作区导航" });
  await drawer.getByRole("checkbox", { name: "减少动态效果" }).check();
  await drawer.getByRole("button", { name: "关闭导航菜单" }).click();
}

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

test("ordinary UI reaches a supported result when all constraints are known", async ({ page }) => {
  await completeOnboarding(page);
  await setConstraints(page, KNOWN_CONSTRAINTS);
  await enableReducedMotion(page);
  await runAnalysisAndOpenResult(page);

  const card = page.getByRole("region", { name: "观象长笺结果" });
  await expect(card.getByText("证据支持", { exact: true })).toBeVisible();
  await expectPublicPrivacySurface(page);
});

test("ordinary UI reaches a limited result when one constraint stays unknown", async ({ page }) => {
  await completeOnboarding(page);
  await setConstraints(page, { ...KNOWN_CONSTRAINTS, investment_horizon: "unknown" });
  await enableReducedMotion(page);
  await runAnalysisAndOpenResult(page);

  const card = page.getByRole("region", { name: "观象长笺结果" });
  await expect(card.getByText("有限分析", { exact: true })).toBeVisible();
  await expectPublicPrivacySurface(page);
});

test("ordinary UI fails closed when an edited holding has no same-asset fixture", async ({ page }) => {
  await completeOnboarding(page);
  await openPortfolioEditor(page);
  await page.locator(".portfolio-line").first().getByLabel("代码").fill("999999.UNKNOWN");
  await page.getByRole("button", { name: "保存后续复盘输入" }).click();
  await enableReducedMotion(page);

  await page.getByRole("button", { name: "点击兜兜，发起今日复盘" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "本次复盘未能生成观象长笺" }),
  ).toBeVisible({ timeout: 45_000 });
  await expect(page.getByRole("region", { name: "观象长笺结果" })).toHaveCount(0);
  await expectPublicPrivacySurface(page);
});
