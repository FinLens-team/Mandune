import type { Page, TestInfo } from "@playwright/test";
import { expect, expectNoHorizontalOverflow } from "./fixtures.js";

export interface JourneyEvidence {
  analysisId: string;
  cutoff: string;
  seed: string;
  snapshotId: string;
}

async function checkpoint(page: Page, label: string): Promise<void> {
  await expectNoHorizontalOverflow(page, label);
}

export async function completeOnboarding(page: Page): Promise<string> {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "满懂" })).toBeVisible();
  await checkpoint(page, "S0 splash");
  await page.getByRole("button", { name: "跳过" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "选择长笺主题" })).toBeVisible();
  const lockedThemes = page.getByRole("button", { name: /主题预览 \d/ });
  await expect(lockedThemes).toHaveCount(3);
  for (let index = 0; index < 3; index += 1) {
    await expect(lockedThemes.nth(index)).toHaveAttribute("aria-disabled", "true");
    await expect(lockedThemes.nth(index)).toContainText("暂未开放");
  }
  await page.getByRole("radio", { name: /东方观象/ }).check();
  await page.getByRole("button", { name: "下一步" }).click();
  await checkpoint(page, "S1 theme selection");

  await expect(page.getByRole("heading", { level: 1, name: "从哪里开始" })).toBeVisible();
  await expect(page.getByRole("button", { name: /截图识别导入/ })).toBeDisabled();
  await expect(page.getByRole("button", { name: /手工录入持仓/ })).toBeDisabled();
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("不会打开表单、相机或文件选择器");
  await page.getByRole("button", { name: "生成随机体验身份" }).click();
  await checkpoint(page, "S2 source selection");

  await expect(page.getByRole("heading", { level: 1, name: "确认随机体验身份" })).toBeVisible();
  await expect(page.getByText("随机体验身份 · 示例数据").first()).toBeVisible();
  await expect(page.getByText(/测试 fixture · 非实时行情/).first()).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "四项体验约束" })).toBeVisible();
  const seed = (await page.locator(".onboarding-seed code").textContent())?.trim() ?? "";
  expect(seed).not.toBe("");
  await checkpoint(page, "S3 random experience summary");
  await page.getByRole("button", { name: "确认此体验身份" }).click();

  await expect(page.getByRole("heading", { level: 1, name: /和兜兜一起/ })).toBeVisible();
  await expect(page.getByText(/草稿已绑定当前私密工作区/)).toBeVisible();
  await checkpoint(page, "S4 workspace home");
  return seed;
}

export async function verifyDrawerAndEmptySecondaryViews(
  page: Page,
  testInfo: TestInfo,
): Promise<void> {
  await page.getByRole("button", { name: "打开工作区导航" }).click();
  const drawer = page.getByRole("dialog", { name: "工作区导航" });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText("最后活动")).toBeVisible();
  await expect(drawer.getByText("预计删除")).toBeVisible();
  await expect(drawer.getByText(/30 天无活动后自动删除/)).toBeVisible();
  const reducedMotion = drawer.getByRole("checkbox", { name: "减少动态效果" });
  if (testInfo.project.name === "mobile-375-reduced-motion") {
    await expect(reducedMotion).toBeChecked();
  }
  await reducedMotion.check();
  await expect(reducedMotion).toBeChecked();
  await checkpoint(page, "S5 workspace drawer");
  await drawer.getByRole("button", { name: "关于项目" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "历史与关于" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "关于满懂" })).toBeVisible();
  await expect(page.getByText(/不是投资建议，也不替你交易/)).toBeVisible();
  await expect(page.getByText(/30 天保留与主动删除/)).toBeVisible();
  await checkpoint(page, "S10 about");

  await page.getByRole("tab", { name: "历史记录" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "这里还没有复盘记录" })).toBeVisible();
  await checkpoint(page, "S10 empty history");
  await page.getByRole("button", { name: "返回主页发起复盘" }).click();
  await expect(page.getByRole("heading", { level: 1, name: /和兜兜一起/ })).toBeVisible();
}

export async function runAnalysisAndOpenResult(page: Page): Promise<Pick<JourneyEvidence, "analysisId" | "cutoff" | "snapshotId">> {
  const started = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return response.request().method() === "POST" && url.pathname === "/api/analyses";
  });
  await page.getByRole("button", { name: "点击兜兜，发起今日复盘" }).click();
  const startBody = await (await started).json() as { analysis_id?: unknown };
  expect(typeof startBody.analysis_id).toBe("string");
  const analysisId = String(startBody.analysis_id);

  // 进度页已隐藏：无确认框，复盘完成后直接打开观象长笺。
  const card = page.getByRole("region", { name: "观象长笺结果" });
  await expect(card).toBeVisible({ timeout: 45_000 });
  await expect(page.getByRole("button", { name: "刷新复盘" })).toBeVisible();
  await expect(card.getByText(/fixture.*非实时/i).first()).toBeVisible();
  await expect(card.getByRole("heading", { level: 3, name: "核心观察" })).toBeVisible();
  await expect(card.getByRole("heading", { level: 3, name: "方向性建议" })).toBeVisible();
  await expect(card.getByRole("heading", { level: 3, name: "风险与判断边界" })).toBeVisible();
  await checkpoint(page, "S9 narrative front");

  await card.getByRole("button", { name: "查看证据" }).click();
  await expect(card.getByRole("heading", { level: 2, name: "逐项核对这份分析" })).toBeVisible();
  await expect(card.getByText("与正面同一版本")).toBeVisible();
  await expect(card.getByRole("heading", { level: 3, name: "确认输入与覆盖" })).toBeVisible();
  const snapshotId = (await card.locator("dt", { hasText: "组合快照" }).locator("+ dd").first().textContent())?.trim() ?? "";
  const cutoff = (await card.locator("dt", { hasText: "证据截止" }).locator("+ dd").first().textContent())?.trim() ?? "";
  expect(snapshotId).not.toBe("");
  expect(cutoff).not.toBe("");
  await checkpoint(page, "S9 rational evidence back");
  await card.getByRole("button", { name: "返回观象" }).click();

  return { analysisId, cutoff, snapshotId };
}

export async function verifyImmutableHistory(
  page: Page,
  evidence: Pick<JourneyEvidence, "analysisId" | "cutoff" | "snapshotId">,
): Promise<void> {
  await page.getByRole("button", { name: "查看全部历史" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "历史记录" })).toBeVisible();
  await expect(page.getByText("共 1 次复盘，按完成时间倒序排列。")).toBeVisible();
  await page.getByRole("button", { name: /查看本次记录/ }).click();
  await expect(page.getByRole("heading", { level: 2, name: "本次复盘边界" })).toBeVisible();
  await expect(page.getByText(evidence.snapshotId, { exact: true })).toBeVisible();
  await expect(page.locator(`time[datetime="${evidence.cutoff}"]`)).toBeVisible();
  await expect(page.getByText(/不请求供应商，也不采用后来数据/)).toBeVisible();
  await checkpoint(page, "S10 immutable history detail");

  await page.reload();
  // 刷新后同一任务的可展示终态直接打开观象长笺，不再停留在进度页。
  await expect(page.getByRole("region", { name: "观象长笺结果" })).toBeVisible({ timeout: 45_000 });
  await page.getByRole("button", { name: "查看全部历史" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "历史记录" })).toBeVisible();
  await expect(page.getByText("共 1 次复盘，按完成时间倒序排列。")).toBeVisible();
}
