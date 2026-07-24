import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { TaskEvent } from "../../src/contracts/index.js";
import type {
  AnalysisConnectionState,
  AnalysisProgressTerminal,
} from "../../src/features/analysis-progress/projection.js";

interface ProgressModule {
  AnalysisProgress: ComponentType<{
    analysisId: string;
    connection: AnalysisConnectionState;
    events: readonly TaskEvent[];
    onLeave?: () => void;
    onOpenResult?: () => void;
    onRetry?: () => void;
    reduceMotion?: boolean;
    terminal?: AnalysisProgressTerminal;
  }>;
}

const MODULE_PATH = ["..", "..", "src", "features", "analysis-progress", "index.js"].join("/");

async function loadProgress(): Promise<ProgressModule> {
  return (await import(MODULE_PATH)) as ProgressModule;
}

const retryEvent: TaskEvent = {
  analysis_id: "analysis-31",
  covered_count: 2,
  event_id: "analysis-31:event:7",
  message: "理性分析输出未通过边界校验，执行有限重试。",
  occurred_at: "2026-07-25T08:00:07.000Z",
  retry_count: 1,
  stage: "form_conclusions_and_advice",
  state: "retrying",
};

describe("S8 analysis progress view", () => {
  it("renders no-event waiting and the complete text-equivalent stage list", async () => {
    const { AnalysisProgress } = await loadProgress();
    const markup = renderToStaticMarkup(
      createElement(AnalysisProgress, {
        analysisId: "analysis-31",
        connection: "connected",
        events: [],
        onLeave: vi.fn(),
      }),
    );

    expect(markup).toContain("单个分析 agent");
    expect(markup).toContain("等待首条真实任务事件");
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain('role="status"');
    expect(markup).toContain("完整阶段列表");
    expect(markup.match(/尚无任务事件/g)).toHaveLength(8);
    expect(markup).toContain("冻结快照");
    expect(markup).toContain("保存结果");
    expect(markup).toContain("暂时离开");
    expect(markup).toContain("分析任务不会因此取消");
    expect(markup).not.toContain("跳过");
    expect(markup).not.toContain("进度");
  });

  it("shows retry, coverage, disconnect, and reduced-motion states without losing history", async () => {
    const { AnalysisProgress } = await loadProgress();
    const markup = renderToStaticMarkup(
      createElement(AnalysisProgress, {
        analysisId: "analysis-31",
        connection: "disconnected",
        events: [retryEvent],
        reduceMotion: true,
      }),
    );

    expect(markup).toContain('data-animation-active="false"');
    expect(markup).toContain('data-reduce-motion="true"');
    expect(markup).toContain("连接中断，状态已保留");
    expect(markup).toContain("已收到的阶段不会丢失");
    expect(markup).toContain("第 1 次有限重试");
    expect(markup).toContain("已覆盖 2 项持仓");
    expect(markup).toContain("理性分析输出未通过边界校验，执行有限重试。");
    expect(markup).toContain('data-state="retrying"');
  });

  it("offers S9 only for displayable terminal results and stops all loop animation", async () => {
    const { AnalysisProgress } = await loadProgress();
    const markup = renderToStaticMarkup(
      createElement(AnalysisProgress, {
        analysisId: "analysis-31",
        connection: "connected",
        events: [retryEvent],
        onOpenResult: vi.fn(),
        terminal: {
          analysis_id: "analysis-31",
          displayable: true,
          reason: "部分证据缺口限制了结论范围。",
          status: "limited",
          terminal_reason: "completed",
        },
      }),
    );

    expect(markup).toContain('data-animation-active="false"');
    expect(markup).toContain('data-status="limited"');
    expect(markup).toContain("复盘完成，结论受限");
    expect(markup).toContain("查看观象长笺");
    expect(markup).not.toContain("重试本次复盘");
  });

  it("keeps unavailable out of S9 and exposes a concrete retry path", async () => {
    const { AnalysisProgress } = await loadProgress();
    const markup = renderToStaticMarkup(
      createElement(AnalysisProgress, {
        analysisId: "analysis-31",
        connection: "connected",
        events: [retryEvent],
        onOpenResult: vi.fn(),
        onRetry: vi.fn(),
        terminal: {
          analysis_id: "analysis-31",
          displayable: false,
          reason: "当前证据不足，未生成观象长笺。",
          status: "unavailable",
          terminal_reason: "model_failure",
        },
      }),
    );

    expect(markup).toContain('data-status="unavailable"');
    expect(markup).toContain("分析不可用，可重试");
    expect(markup).toContain("当前证据不足，未生成观象长笺。");
    expect(markup).toContain("重试本次复盘");
    expect(markup).not.toContain("查看观象长笺");
  });

  it("keeps a successful status visible without opening S9 when narrative is not displayable", async () => {
    const { AnalysisProgress } = await loadProgress();
    const markup = renderToStaticMarkup(
      createElement(AnalysisProgress, {
        analysisId: "analysis-31",
        connection: "connected",
        events: [retryEvent],
        onOpenResult: vi.fn(),
        terminal: {
          analysis_id: "analysis-31",
          displayable: false,
          reason: "主题叙事尚未通过一致性校验。",
          status: "supported",
          terminal_reason: "completed",
        },
      }),
    );

    expect(markup).toContain('data-status="supported"');
    expect(markup).toContain("主题叙事尚未通过一致性校验。");
    expect(markup).not.toContain("查看观象长笺");
  });
});
