import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { HistoryReadResult, HistoryRecordV1 } from "../../src/history/index.js";
import type { WorkspacePublicStatus } from "../../src/workspace/index.js";
import type {
  HistoryListEntry,
  HistoryReader,
} from "../../src/features/history-view/model.js";
import { record, summary } from "./model.test.js";

interface HistoryViewModule {
  HistoryAboutView: ComponentType<{
    availability?: "active" | "deleted" | "expired";
    initialTab?: "history" | "about";
    onNavigateHome: () => void;
    onOpenRecord: (record: HistoryRecordV1) => void;
    onRequestDeleteWorkspace?: () => void;
    reader: HistoryReader;
    reduceMotion?: boolean;
    workspace: WorkspacePublicStatus | null;
    workspaceId: string;
  }>;
  HistoryDetail: ComponentType<{
    detail: HistoryReadResult;
    onBack: () => void;
    onNavigateHome: () => void;
    onOpenRecord: (record: HistoryRecordV1) => void;
  }>;
  HistoryList: ComponentType<{
    entries: HistoryListEntry[];
    onNavigateHome: () => void;
    onSelectRecord: (recordId: string) => void;
  }>;
  HistoryView: ComponentType<{
    availability?: "active" | "deleted" | "expired";
    onNavigateHome: () => void;
    onOpenRecord: (record: HistoryRecordV1) => void;
    reader: HistoryReader;
    workspaceId: string;
  }>;
  nextHistoryAboutTab(current: "history" | "about", key: string): "history" | "about";
}

interface AboutModule {
  AboutView: ComponentType<{
    availability?: "active" | "deleted" | "expired";
    onNavigateHome: () => void;
    onRequestDeleteWorkspace?: () => void;
    workspace: WorkspacePublicStatus | null;
  }>;
}

const HISTORY_MODULE_PATH = ["..", "..", "src", "features", "history-view", "index.js"].join("/");
const ABOUT_MODULE_PATH = ["..", "..", "src", "features", "about", "index.js"].join("/");

async function loadHistoryView(): Promise<HistoryViewModule> {
  return (await import(HISTORY_MODULE_PATH)) as HistoryViewModule;
}

async function loadAbout(): Promise<AboutModule> {
  return (await import(ABOUT_MODULE_PATH)) as AboutModule;
}

const noopReader: HistoryReader = {
  getDetail: vi.fn(async (): Promise<HistoryReadResult> => ({ status: "not_found", code: "not_found" })),
  list: vi.fn(async () => []),
};

describe("S10 history list and detail", () => {
  it("shows real snapshot, cutoff, result, example, and fixture boundaries", async () => {
    const { HistoryList } = await loadHistoryView();
    const markup = renderToStaticMarkup(createElement(HistoryList, {
      entries: [{ detail: { status: "found", record: record() }, summary }],
      onNavigateHome: vi.fn(),
      onSelectRecord: vi.fn(),
    }));

    expect(markup).toContain("历史记录");
    expect(markup).toContain("共 1 次复盘");
    expect(markup).toContain("有限分析");
    expect(markup).toContain("snapshot-history-1");
    expect(markup).toContain("证据截止");
    expect(markup).toContain("随机体验身份 · 示例数据");
    expect(markup).toContain("fixture 证据 · 非实时");
    expect(markup).toContain("查看本次记录");
    expect(markup).not.toContain("实时行情");
  });

  it("renders immutable detail and only offers the saved long card when complete", async () => {
    const { HistoryDetail } = await loadHistoryView();
    const markup = renderToStaticMarkup(createElement(HistoryDetail, {
      detail: { status: "found", record: record() },
      onBack: vi.fn(),
      onNavigateHome: vi.fn(),
      onOpenRecord: vi.fn(),
    }));

    expect(markup).toContain("本次复盘边界");
    expect(markup).toContain("虚构宽基 ETF");
    expect(markup).toContain("近期流动性需求");
    expect(markup).toContain("未知／尚未决定");
    expect(markup).toContain("不请求供应商，也不采用后来数据");
    expect(markup).toContain("打开本次观象长笺");

    const unavailable = record();
    unavailable.analysis.status = "unavailable";
    const unavailableMarkup = renderToStaticMarkup(createElement(HistoryDetail, {
      detail: { status: "found", record: unavailable },
      onBack: vi.fn(),
      onNavigateHome: vi.fn(),
      onOpenRecord: vi.fn(),
    }));
    expect(unavailableMarkup).toContain("本次分析未生成观象长笺");
    expect(unavailableMarkup).not.toContain("打开本次观象长笺");
  });

  it("keeps unsupported, unreadable, not-found, and storage failures explicit", async () => {
    const { HistoryDetail } = await loadHistoryView();
    const unsupported: HistoryReadResult = {
      status: "unsupported_version",
      summary: { ...summary, readability: "unsupported_version" },
      unsupported_versions: [{ component: "history_schema", version: "analysis-history.v0" }],
    };
    const unsupportedMarkup = renderToStaticMarkup(createElement(HistoryDetail, {
      detail: unsupported,
      onBack: vi.fn(),
      onNavigateHome: vi.fn(),
      onOpenRecord: vi.fn(),
    }));
    expect(unsupportedMarkup).toContain("旧记录当前无法读取");
    expect(unsupportedMarkup).toContain("不会用今天的契约或最新市场数据重新计算");
    expect(unsupportedMarkup).toContain("analysis-history.v0");

    const states: Array<[HistoryReadResult, string]> = [
      [{ status: "unreadable", summary, code: "invalid_record" }, "完整性校验"],
      [{ status: "unavailable", code: "storage_failure" }, "暂时无法读取"],
      [{ status: "not_found", code: "not_found" }, "已不存在"],
    ];
    for (const [detail, text] of states) {
      const markup = renderToStaticMarkup(createElement(HistoryDetail, {
        detail,
        onBack: vi.fn(),
        onNavigateHome: vi.fn(),
        onOpenRecord: vi.fn(),
      }));
      expect(markup).toContain(text);
      expect(markup).not.toContain("打开本次观象长笺");
    }
  });

  it("shows empty, deleted, and expired workspace recovery paths", async () => {
    const { HistoryList, HistoryView } = await loadHistoryView();
    const emptyMarkup = renderToStaticMarkup(createElement(HistoryList, {
      entries: [],
      onNavigateHome: vi.fn(),
      onSelectRecord: vi.fn(),
    }));
    expect(emptyMarkup).toContain("这里还没有复盘记录");
    expect(emptyMarkup).toContain("返回主页发起复盘");

    for (const availability of ["deleted", "expired"] as const) {
      const markup = renderToStaticMarkup(createElement(HistoryView, {
        availability,
        onNavigateHome: vi.fn(),
        onOpenRecord: vi.fn(),
        reader: noopReader,
        workspaceId: "workspace-history",
      }));
      expect(markup).toContain(availability === "deleted" ? "工作区已删除" : "工作区已到期");
      expect(markup).toContain("无法通过正常产品路径恢复");
    }
  });
});

describe("S10 about and navigation", () => {
  it("states privacy, retention, deletion, non-advice, and cache boundaries", async () => {
    const { AboutView } = await loadAbout();
    const markup = renderToStaticMarkup(createElement(AboutView, {
      onNavigateHome: vi.fn(),
      onRequestDeleteWorkspace: vi.fn(),
      workspace: {
        expires_at: "2026-08-24T08:00:00.000Z",
        last_active_at: "2026-07-25T08:00:00.000Z",
        ttl_days: 30,
        workspace_id: "workspace-history",
      },
    }));

    expect(markup).toContain("不是投资建议，也不替你交易");
    expect(markup).toContain("公开应用入口不会公开");
    expect(markup).toContain("不承诺跨设备找回");
    expect(markup).toContain("原始截图会在提取成功、失败或中止后删除");
    expect(markup).toContain("30 天");
    expect(markup).toContain("预计删除");
    expect(markup).toContain("主动删除当前工作区");
    expect(markup).toContain("缓存或 fixture 证据");
    expect(markup).toContain("不证明供应商当前可用");
    expect(markup).not.toContain("收益保证");
  });

  it("exposes two keyboard tabs and stable journey callbacks", async () => {
    const { HistoryAboutView, nextHistoryAboutTab } = await loadHistoryView();
    const markup = renderToStaticMarkup(createElement(HistoryAboutView, {
      initialTab: "about",
      onNavigateHome: vi.fn(),
      onOpenRecord: vi.fn(),
      onRequestDeleteWorkspace: vi.fn(),
      reader: noopReader,
      reduceMotion: true,
      workspace: null,
      workspaceId: "workspace-history",
    }));

    expect(markup).toContain('role="tablist"');
    expect(markup).toContain('aria-selected="true"');
    expect(markup).toContain('data-reduce-motion="true"');
    expect(markup).toContain("关于满懂");
    expect(markup).not.toContain("正在读取当前工作区历史");
    expect(nextHistoryAboutTab("history", "ArrowRight")).toBe("about");
    expect(nextHistoryAboutTab("history", "ArrowLeft")).toBe("about");
    expect(nextHistoryAboutTab("about", "Home")).toBe("history");
    expect(nextHistoryAboutTab("history", "End")).toBe("about");
  });
});
