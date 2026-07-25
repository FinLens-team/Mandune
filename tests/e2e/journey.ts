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
  // S0 无跳过控件：正常路径约 2.3s 后圆形展开进入 S1，reduced-motion 约 0.4s 直接切换。

  await expect(page.getByRole("heading", { level: 1, name: "选择复盘主题" })).toBeVisible({ timeout: 10_000 });
  const lockedThemes = page.getByRole("button", { name: /主题预览 \d/ });
  await expect(lockedThemes).toHaveCount(3);
  for (let index = 0; index < 3; index += 1) {
    await expect(lockedThemes.nth(index)).toHaveAttribute("aria-disabled", "true");
    await expect(lockedThemes.nth(index)).toContainText("暂未开放");
  }
  // 奶龙主题默认选中（可取消），无需手动点选
  await expect(page.getByRole("button", { name: "选择我是龙主题" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "下一步" }).click();
  await checkpoint(page, "S1 theme selection");

  await expect(page.getByRole("heading", { level: 1, name: "从哪里开始" })).toBeVisible();
  await expect(page.getByRole("button", { name: /截图识别/ })).toHaveAttribute("aria-disabled", "true");
  await expect(page.getByRole("button", { name: /手工录入/ })).toHaveAttribute("aria-disabled", "true");
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("不会打开表单、相机或文件选择器");
  await page.getByRole("button", { name: "生成体验持仓" }).click();
  await checkpoint(page, "S2 source selection");

  await expect(page.getByRole("heading", { level: 1, name: "确认随机体验身份" })).toBeVisible();
  await expect(page.getByText("随机体验身份 · 示例数据")).toHaveCount(0);
  await expect(page.getByText(/随机体验身份 · 测试 fixture · 非实时行情/)).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 2, name: "四项体验约束" })).toBeVisible();
  const seed = (await page.locator(".onboarding-seed code").textContent())?.trim() ?? "";
  expect(seed).not.toBe("");
  await checkpoint(page, "S3 random experience summary");
  await page.getByRole("button", { name: "确认此体验身份" }).click();

  await expect(page.getByRole("heading", { level: 1, name: /和兜兜一起/ })).toBeVisible();
  await expect(page.getByText(/草稿已绑定当前私密工作区/)).toHaveCount(0);
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
  await expect(drawer.getByText("预计删除")).toBeVisible();
  await drawer.getByText("工作区详情").click();
  await expect(drawer.getByText("最后活动")).toBeVisible();
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
  await expect(page.getByText(/30 天无活动后自动删除/)).toBeVisible();
  await checkpoint(page, "S10 about");

  await page.getByRole("tab", { name: "历史记录" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "这里还没有复盘记录" })).toBeVisible();
  await checkpoint(page, "S10 empty history");
  await page.getByRole("button", { name: "返回主页发起复盘" }).click();
  await expect(page.getByRole("heading", { level: 1, name: /和兜兜一起/ })).toBeVisible();
}

export async function runAnalysisAndOpenResult(page: Page): Promise<Pick<JourneyEvidence, "analysisId" | "cutoff" | "snapshotId">> {
  await page.getByRole("button", { name: "点击兜兜，确认发起今日复盘" }).click();
  const dialog = page.getByRole("dialog", { name: "按当前输入发起今日复盘？" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("约 90 秒")).toBeVisible();
  await expect(dialog.getByText(/180 秒/)).toBeVisible();
  await checkpoint(page, "S7 analysis confirmation");

  const started = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return response.request().method() === "POST" && url.pathname === "/api/analyses";
  });
  await dialog.getByRole("button", { name: "开始复盘" }).click();
  const startBody = await (await started).json() as { analysis_id?: unknown };
  expect(typeof startBody.analysis_id).toBe("string");
  const analysisId = String(startBody.analysis_id);

  await expect(page.getByRole("heading", { level: 1, name: "复盘进行中" })).toBeVisible();
  await expect(page.locator(".analysis-progress__mascot")).toBeVisible();
  await expect(page.locator(".analysis-progress__log-line")).not.toHaveCount(4);
  await expect(page.locator("main.analysis-progress")).toHaveAttribute("data-reduce-motion", "true");
  await checkpoint(page, "S8 analysis progress");

  let openResult = page.getByRole("button", { name: "查看复盘报告" });
  await expect(openResult).toBeVisible({ timeout: 45_000 });
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "复盘进行中" })).toBeVisible();
  openResult = page.getByRole("button", { name: "查看复盘报告" });
  await expect(openResult).toBeVisible({ timeout: 45_000 });
  await openResult.click();

  const card = page.getByRole("region", { name: "每日复盘报告" });
  await expect(card).toBeVisible();
  await expect(
    card.getByText(/随机体验身份 · 示例数据|体验持仓 · 已编辑/).first(),
  ).toBeVisible();
  await expect(card.getByRole("heading", { level: 3, name: "核心观察" })).toBeVisible();
  await expect(card.getByRole("heading", { level: 3, name: "方向性建议" })).toBeVisible();
  await expect(card.getByText("AI 分析仅供信息整理与理解参考，不对投资决策或结果负责；请自行判断与操作。")).toBeVisible();
  await checkpoint(page, "S9 narrative front");

  const snapshotId = (await card.locator("dt", { hasText: "组合快照" }).locator("+ dd").first().textContent())?.trim() ?? "";
  const cutoff = (await card.locator("dt", { hasText: "证据截止" }).locator("+ dd").first().textContent())?.trim() ?? "";
  expect(snapshotId).not.toBe("");
  expect(cutoff).not.toBe("");

  await card.getByRole("button", { name: "查看证据" }).click();
  await expect(card.getByRole("heading", { level: 2, name: "逐项核对这份分析" })).toBeVisible();
  await expect(card.getByText(/fixture.*非实时/i).first()).toBeVisible();
  await expect(card.getByText("与正面同一版本")).toBeVisible();
  await expect(card.getByRole("heading", { level: 3, name: "确认输入与覆盖" })).toBeVisible();
  const evidenceFace = card.locator(".mandong-long-card__back");
  await expect(evidenceFace.getByText(snapshotId, { exact: true })).toBeVisible();
  await expect(evidenceFace.getByText(cutoff, { exact: true }).first()).toBeVisible();
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
  await expect(page.getByRole("heading", { level: 1, name: /复盘进行中|和兜兜一起/ })).toBeVisible();
  const resultButton = page.getByRole("button", { name: "查看复盘报告" });
  await expect(resultButton).toBeVisible({ timeout: 45_000 });
  await resultButton.click();
  await page.getByRole("button", { name: "查看全部历史" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "历史记录" })).toBeVisible();
  await expect(page.getByText("共 1 次复盘，按完成时间倒序排列。")).toBeVisible();
}
