import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { PortfolioDraft, PortfolioSnapshot } from "../../src/contracts/index.js";
import { createExampleDraft, updateConstraints, updateLine } from "../../src/portfolio/index.js";
import type { WorkspacePublicStatus } from "../../src/workspace/index.js";
import type { snapshotCurrentDraft } from "../../src/features/review/model.js";

interface WorkspaceShellModule {
  AnalysisConfirmDialog: ComponentType<{
    open: boolean;
    snapshot: PortfolioSnapshot | null;
    latestCompleteTradingDay?: string;
    reduceMotion: boolean;
    returnFocus: null;
    onCancel: () => void;
    onConfirm: (snapshot: PortfolioSnapshot) => void;
  }>;
  WorkspaceDrawer: ComponentType<{
    open: boolean;
    currentView: "home" | "portfolio";
    workspace: WorkspacePublicStatus | null;
    reduceMotion: boolean;
    returnFocus: null;
    onClose: () => void;
    onNavigate: (view: "home" | "portfolio") => void;
    onNavigateHistory: () => void;
    onNavigateAtlas?: () => void;
    onNavigateAbout: () => void;
    onReduceMotionChange: (enabled: boolean) => void;
  }>;
  WorkspaceShell: ComponentType<{
    activeAnalysis?: { analysisId: string };
    draft?: PortfolioDraft;
    experienceSource?: "random" | "edited";
    initialDraft?: PortfolioDraft;
    onDraftChange?: (draft: PortfolioDraft) => void;
    onReducedMotionChange?: (enabled: boolean) => void;
    onResumeAnalysis?: (analysisId: string) => void;
    reducedMotion?: boolean;
    workspace: WorkspacePublicStatus | null;
    onStartAnalysis: (snapshot: PortfolioSnapshot) => void;
    onNavigateHistory: () => void;
    onNavigateAbout: () => void;
    reviewCoachmarkVisible?: boolean;
  }>;
  countUnknownConstraints: (snapshot: PortfolioSnapshot) => number;
  prepareAnalysisSnapshot: (draft: PortfolioDraft) => ReturnType<typeof snapshotCurrentDraft>;
  resolveOverlayKeyAction: (input: {
    key: string;
    shiftKey: boolean;
    currentIndex: number;
    focusableCount: number;
  }) => "close" | number | null;
  resolveReturnFocus: <T>(explicit: T | null, fallback: T | null) => T | null;
}

const WORKSPACE_MODULE_PATH = ["..", "..", "src", "features", "workspace-shell", "index.js"].join("/");

async function loadWorkspaceShell(): Promise<WorkspaceShellModule> {
  return (await import(WORKSPACE_MODULE_PATH)) as WorkspaceShellModule;
}

const workspace = {
  workspace_id: "ws_public_status",
  last_active_at: "2026-07-25T08:00:00.000Z",
  expires_at: "2026-08-24T08:00:00.000Z",
  ttl_days: 30 as const,
};

describe("S4-S7 workspace shell", () => {
  it("renders licensed Doudou as the sole new-analysis trigger with first-use guidance", async () => {
    const { WorkspaceShell } = await loadWorkspaceShell();
    const markup = renderToStaticMarkup(
      createElement(WorkspaceShell, {
        initialDraft: createExampleDraft(),
        workspace,
        onStartAnalysis: vi.fn(),
        onNavigateHistory: vi.fn(),
        onNavigateAbout: vi.fn(),
      }),
    );

    expect(markup).toContain("随机体验身份 · 示例数据");
    expect(markup).toContain("熊猫兜兜，东方观象主题的观察向导");
    expect(markup).toContain("doudou-observer.png");
    expect(markup).toContain("点击兜兜，确认发起今日复盘");
    expect(markup).toContain("点击兜兜，先确认本次复盘");
    expect(markup).not.toMatch(/>发起今日复盘</);
    expect(markup).not.toContain("查看持仓与约束");
    expect(markup).not.toContain("实时行情");
    expect(markup).not.toContain("已保存输入快照");
    expect(markup).not.toContain("登录");
  });

  it("accepts canonical edited-source and coachmark state from journey integration", async () => {
    const { WorkspaceShell } = await loadWorkspaceShell();
    const markup = renderToStaticMarkup(
      createElement(WorkspaceShell, {
        draft: createExampleDraft(),
        experienceSource: "edited",
        reviewCoachmarkVisible: false,
        workspace,
        onStartAnalysis: vi.fn(),
        onNavigateHistory: vi.fn(),
        onNavigateAbout: vi.fn(),
      }),
    );

    expect(markup).toContain("体验持仓 · 已编辑");
    expect(markup).not.toContain("点击兜兜，先确认本次复盘");
  });

  it("accepts controlled journey state and exposes the active-analysis resume seam", async () => {
    const { WorkspaceShell } = await loadWorkspaceShell();
    const markup = renderToStaticMarkup(
      createElement(WorkspaceShell, {
        activeAnalysis: { analysisId: "analysis-active" },
        draft: createExampleDraft(),
        onDraftChange: vi.fn(),
        onReducedMotionChange: vi.fn(),
        reducedMotion: true,
        workspace,
        onStartAnalysis: vi.fn(),
        onNavigateHistory: vi.fn(),
        onNavigateAbout: vi.fn(),
      }),
    );

    expect(markup).toContain('data-reduce-motion="true"');
    expect(markup).toContain("已有复盘仍在进行，可返回同一任务继续查看。");
  });

  it("renders an account-free drawer with workspace retention and accessible controls", async () => {
    const { WorkspaceDrawer } = await loadWorkspaceShell();
    const markup = renderToStaticMarkup(
      createElement(WorkspaceDrawer, {
        open: true,
        currentView: "home",
        workspace,
        reduceMotion: false,
        returnFocus: null,
        onClose: vi.fn(),
        onNavigate: vi.fn(),
        onNavigateHistory: vi.fn(),
        onNavigateAtlas: vi.fn(),
        onNavigateAbout: vi.fn(),
        onReduceMotionChange: vi.fn(),
      }),
    );

    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('aria-modal="true"');
    expect(markup).toContain('data-initial-focus="true"');
    expect(markup).toContain('data-state="opening"');
    expect(markup).toContain("主页");
    expect(markup).toContain("仓位／身份");
    expect(markup).toContain("历史记录");
    expect(markup).toContain("满懂图鉴");
    expect(markup).toContain("关于项目");
    expect(markup).toContain("最后活动");
    expect(markup).toContain("预计删除");
    expect(markup).toContain("30 天无活动后自动删除");
    expect(markup).toContain("工作区详情");
    expect(markup).toContain("到期前可主动删除");
    expect(markup).toContain("不能通过正常产品路径恢复");
    expect(markup).toContain("只保留在当前设备");
    expect(markup).toContain("减少动态效果");
    expect(markup).not.toContain("手机号");
    expect(markup).not.toContain("登录");
  });

  it("cycles focus, closes on Escape, and uses the same trap rule for drawer and confirmation", async () => {
    const { resolveOverlayKeyAction, resolveReturnFocus } = await loadWorkspaceShell();
    expect(
      resolveOverlayKeyAction({
        key: "Tab",
        shiftKey: false,
        currentIndex: 2,
        focusableCount: 3,
      }),
    ).toBe(0);
    expect(
      resolveOverlayKeyAction({
        key: "Tab",
        shiftKey: true,
        currentIndex: 0,
        focusableCount: 3,
      }),
    ).toBe(2);
    expect(
      resolveOverlayKeyAction({
        key: "Escape",
        shiftKey: false,
        currentIndex: 1,
        focusableCount: 3,
      }),
    ).toBe("close");
    expect(
      resolveOverlayKeyAction({
        key: "Enter",
        shiftKey: false,
        currentIndex: 1,
        focusableCount: 3,
      }),
    ).toBeNull();

    const trigger = { id: "analysis-trigger" };
    const fallback = { id: "previous-active" };
    expect(resolveReturnFocus(trigger, fallback)).toBe(trigger);
    expect(resolveReturnFocus(null, fallback)).toBe(fallback);
  });

  it("freezes a new current-input snapshot while allowing all four constraints to stay unknown", async () => {
    const { countUnknownConstraints, prepareAnalysisSnapshot } = await loadWorkspaceShell();
    const draft = updateConstraints(createExampleDraft(), {
      investment_horizon: "unknown",
      near_term_liquidity: "unknown",
      tolerable_drawdown: "unknown",
      investment_objective: "unknown",
    });
    const first = prepareAnalysisSnapshot(draft);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    expect(Object.isFrozen(first.snapshot)).toBe(true);
    expect(first.snapshot.lines).toHaveLength(2);
    expect(first.skippedCount).toBe(1);
    expect(countUnknownConstraints(first.snapshot)).toBe(4);

    const edited = updateLine(draft, draft.lines[0]!.line_id, { name: "修改后的体验持仓" });
    const second = prepareAnalysisSnapshot(edited);
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    expect(second.snapshot.snapshot_id).not.toBe(first.snapshot.snapshot_id);
    expect(first.snapshot.lines[0]?.name).not.toBe("修改后的体验持仓");
    expect(second.snapshot.lines[0]?.name).toBe("修改后的体验持仓");
  });
  it("puts default focus on start and states the evidence and timeout boundaries", async () => {
    const { AnalysisConfirmDialog, prepareAnalysisSnapshot } = await loadWorkspaceShell();
    const prepared = prepareAnalysisSnapshot(createExampleDraft());
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;

    const markup = renderToStaticMarkup(
      createElement(AnalysisConfirmDialog, {
        open: true,
        snapshot: prepared.snapshot,
        latestCompleteTradingDay: "2026-07-24",
        reduceMotion: false,
        returnFocus: null,
        onCancel: vi.fn(),
        onConfirm: vi.fn(),
      }),
    );

    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('aria-modal="true"');
    expect(markup).toContain("2026-07-24");
    expect(markup).toContain("约 90 秒");
    expect(markup).toContain("180 秒");
    expect(markup).toContain("4 项未知，相关判断将受限");
    expect(markup).toContain("投资期限");
    expect(markup).toContain("近期流动性需求");
    expect(markup).toContain("可承受回撤");
    expect(markup).toContain("投资目标");
    expect(markup).toContain("未知／尚未决定");
    expect(markup).toMatch(/data-initial-focus="true"[^>]*><span[^>]*>开始复盘/);
    expect(markup).toContain("取消");
  });
});
