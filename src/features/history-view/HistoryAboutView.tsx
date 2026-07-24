import { useRef, useState, type KeyboardEvent } from "react";
import type { HistoryRecordV1 } from "../../history/index.js";
import type { WorkspacePublicStatus } from "../../workspace/index.js";
import { AboutView } from "../about/index.js";
import { HistoryView, type HistoryAvailability } from "./HistoryView.js";
import type { HistoryReader } from "./model.js";

export type HistoryAboutTab = "history" | "about";

const TAB_ORDER: HistoryAboutTab[] = ["history", "about"];

export function nextHistoryAboutTab(
  current: HistoryAboutTab,
  key: string,
): HistoryAboutTab {
  if (key === "Home") return TAB_ORDER[0]!;
  if (key === "End") return TAB_ORDER[TAB_ORDER.length - 1]!;
  const currentIndex = TAB_ORDER.indexOf(current);
  if (key === "ArrowRight" || key === "ArrowDown") {
    return TAB_ORDER[(currentIndex + 1) % TAB_ORDER.length]!;
  }
  if (key === "ArrowLeft" || key === "ArrowUp") {
    return TAB_ORDER[(currentIndex - 1 + TAB_ORDER.length) % TAB_ORDER.length]!;
  }
  return current;
}

export interface HistoryAboutViewProps {
  availability?: HistoryAvailability;
  initialTab?: HistoryAboutTab;
  onNavigateHome: () => void;
  onOpenRecord: (record: HistoryRecordV1) => void;
  onRequestDeleteWorkspace?: () => void;
  onTabChange?: (tab: HistoryAboutTab) => void;
  reader: HistoryReader;
  reduceMotion?: boolean;
  workspace: WorkspacePublicStatus | null;
  workspaceId: string;
}

export function HistoryAboutView({
  availability = "active",
  initialTab = "history",
  onNavigateHome,
  onOpenRecord,
  onRequestDeleteWorkspace,
  onTabChange,
  reader,
  reduceMotion = false,
  workspace,
  workspaceId,
}: HistoryAboutViewProps) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const tabRefs = useRef<Record<HistoryAboutTab, HTMLButtonElement | null>>({
    about: null,
    history: null,
  });

  function selectTab(tab: HistoryAboutTab, focus = false) {
    setActiveTab(tab);
    onTabChange?.(tab);
    if (focus) tabRefs.current[tab]?.focus();
  }

  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const nextTab = nextHistoryAboutTab(activeTab, event.key);
    if (nextTab === activeTab) return;
    event.preventDefault();
    selectTab(nextTab, true);
  }

  return (
    <main
      aria-labelledby="history-about-title"
      className="history-about"
      data-reduce-motion={reduceMotion || undefined}
    >
      <header className="history-about__header">
        <p className="history-eyebrow">满懂工作区</p>
        <h1 id="history-about-title">历史与关于</h1>
        <p>核对过去复盘的原始边界，或了解匿名工作区与产品责任范围。</p>
      </header>

      <div aria-label="历史与关于" className="history-tabs" role="tablist">
        <button
          aria-controls="history-tab-panel"
          aria-selected={activeTab === "history"}
          id="history-tab"
          onClick={() => selectTab("history")}
          onKeyDown={onTabKeyDown}
          ref={(node) => { tabRefs.current.history = node; }}
          role="tab"
          tabIndex={activeTab === "history" ? 0 : -1}
          type="button"
        >
          历史记录
        </button>
        <button
          aria-controls="about-tab-panel"
          aria-selected={activeTab === "about"}
          id="about-tab"
          onClick={() => selectTab("about")}
          onKeyDown={onTabKeyDown}
          ref={(node) => { tabRefs.current.about = node; }}
          role="tab"
          tabIndex={activeTab === "about" ? 0 : -1}
          type="button"
        >
          关于项目
        </button>
      </div>

      <section
        aria-labelledby={`${activeTab}-tab`}
        className="history-tab-panel"
        id={`${activeTab}-tab-panel`}
        role="tabpanel"
      >
        {activeTab === "history" ? (
          <HistoryView
            availability={availability}
            onNavigateHome={onNavigateHome}
            onOpenRecord={onOpenRecord}
            reader={reader}
            reduceMotion={reduceMotion}
            workspaceId={workspaceId}
          />
        ) : (
          <AboutView
            availability={availability}
            onNavigateHome={onNavigateHome}
            onRequestDeleteWorkspace={onRequestDeleteWorkspace}
            workspace={workspace}
          />
        )}
      </section>
    </main>
  );
}
