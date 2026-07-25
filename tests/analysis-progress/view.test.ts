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
    streamText?: string;
    terminal?: AnalysisProgressTerminal;
  }>;
}

const MODULE_PATH = ["..", "..", "src", "features", "analysis-progress", "index.js"].join("/");

async function loadProgress(): Promise<ProgressModule> {
  return (await import(MODULE_PATH)) as ProgressModule;
}

function stageEvent(index: number, message: string): TaskEvent {
  return {
    analysis_id: "analysis-31",
    event_id: `analysis-31:event:${index}`,
    message,
    occurred_at: `2026-07-25T08:00:0${index}.000Z`,
    stage: "form_conclusions_and_advice",
    state: "running",
  };
}

describe("S8 analysis progress view (simple version)", () => {
  it("renders the centered mascot and a waiting placeholder before any event", async () => {
    const { AnalysisProgress } = await loadProgress();
    const markup = renderToStaticMarkup(
      createElement(AnalysisProgress, {
        analysisId: "analysis-31",
        connection: "connected",
        events: [],
        onLeave: vi.fn(),
      }),
    );

    expect(markup).toContain("nailong-rest.webp");
    expect(markup).toContain('class="analysis-progress__mascot"');
    expect(markup).toContain('alt=""');
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain("等待首条真实任务事件");
    expect(markup).toContain("暂时离开");
    expect(markup).not.toContain("<video");
  });

  it("shows up to 8 generation messages, newest at the bottom", async () => {
    const { AnalysisProgress } = await loadProgress();
    const markup = renderToStaticMarkup(
      createElement(AnalysisProgress, {
        analysisId: "analysis-31",
        connection: "connected",
        events: [
          stageEvent(1, "第一条工作信息"),
          stageEvent(2, "第二条工作信息"),
          stageEvent(3, "第三条工作信息"),
          stageEvent(4, "第四条工作信息"),
        ],
      }),
    );

    expect(markup).toContain("第一条工作信息");
    expect(markup).toContain("第二条工作信息");
    expect(markup).toContain("第三条工作信息");
    expect(markup).toContain("第四条工作信息");
    expect(markup.indexOf("第三条工作信息")).toBeGreaterThan(markup.indexOf("第二条工作信息"));
    expect(markup.indexOf("第四条工作信息")).toBeGreaterThan(markup.indexOf("第三条工作信息"));
    expect(markup.match(/analysis-progress__log-line/g)).toHaveLength(4);
  });

  it("keeps API connection, thinking, and upstream headings in generation history", async () => {
    const { AnalysisProgress } = await loadProgress();
    const markup = renderToStaticMarkup(
      createElement(AnalysisProgress, {
        analysisId: "analysis-31",
        connection: "connected",
        events: [
          stageEvent(1, "连通API尝试中"),
          stageEvent(2, "API连通成功"),
          stageEvent(3, "正在思考..."),
        ],
        streamText: "# 市场概览\n# 风险边界\n",
      }),
    );

    expect(markup).toContain("连通API尝试中");
    expect(markup).toContain("API连通成功");
    expect(markup).toContain("正在思考...");
    expect(markup).toContain("正在生成 市场概览");
    expect(markup).toContain("正在生成 风险边界");
    expect(markup.indexOf("API连通成功")).toBeGreaterThan(markup.indexOf("连通API尝试中"));
    expect(markup.indexOf("正在思考...")).toBeGreaterThan(markup.indexOf("API连通成功"));
    expect(markup.indexOf("正在生成 市场概览")).toBeGreaterThan(markup.indexOf("正在思考..."));
    expect(markup.indexOf("正在生成 风险边界")).toBeGreaterThan(markup.indexOf("正在生成 市场概览"));
    expect(markup.match(/analysis-progress__log-line/g)).toHaveLength(5);
  });

  it("offers the result button only for displayable terminal results", async () => {
    const { AnalysisProgress } = await loadProgress();
    const markup = renderToStaticMarkup(
      createElement(AnalysisProgress, {
        analysisId: "analysis-31",
        connection: "connected",
        events: [stageEvent(1, "第一条工作信息")],
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

    expect(markup).toContain("查看复盘报告");
    expect(markup).not.toContain("重试本次复盘");
    expect(markup).not.toContain("暂时离开");
  });

  it("keeps unavailable out of S9 and exposes a concrete retry path", async () => {
    const { AnalysisProgress } = await loadProgress();
    const markup = renderToStaticMarkup(
      createElement(AnalysisProgress, {
        analysisId: "analysis-31",
        connection: "connected",
        events: [stageEvent(1, "第一条工作信息")],
        onOpenResult: vi.fn(),
        onRetry: vi.fn(),
        terminal: {
          analysis_id: "analysis-31",
          displayable: false,
          reason: "当前证据不足，未生成复盘报告。",
          status: "unavailable",
          terminal_reason: "model_failure",
        },
      }),
    );

    expect(markup).toContain("重试本次复盘");
    expect(markup).not.toContain("查看复盘报告");
  });

  it("does not open S9 when a successful result has no displayable narrative", async () => {
    const { AnalysisProgress } = await loadProgress();
    const markup = renderToStaticMarkup(
      createElement(AnalysisProgress, {
        analysisId: "analysis-31",
        connection: "connected",
        events: [stageEvent(1, "第一条工作信息")],
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

    expect(markup).not.toContain("查看复盘报告");
  });
});
