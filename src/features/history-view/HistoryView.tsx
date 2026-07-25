import {
  ArrowLeft,
  ChevronRight,
  Clock3,
  Database,
  FileWarning,
  RefreshCw,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { UnknownFieldState } from "../../contracts/index.js";
import type {
  HistoryReadResult,
  HistoryRecordV1,
  HistorySummary,
} from "../../history/index.js";
import { AnalysisStatus, Badge, Button } from "../../client/ui/index.js";
import {
  formatHistoryDateTime,
  historyRecordBoundary,
  loadHistoryEntries,
  type HistoryEntriesResult,
  type HistoryListEntry,
  type HistoryReader,
} from "./model.js";
import "./styles.css";

export type HistoryAvailability = "active" | "deleted" | "expired";

export interface HistoryViewProps {
  availability?: HistoryAvailability;
  onNavigateHome: () => void;
  onOpenRecord: (record: HistoryRecordV1) => void;
  reader: HistoryReader;
  reduceMotion?: boolean;
  workspaceId: string;
}

interface HistoryListProps {
  entries: HistoryListEntry[];
  onNavigateHome: () => void;
  onSelectRecord: (recordId: string) => void;
}

interface HistoryDetailProps {
  detail: HistoryReadResult;
  onBack: () => void;
  onNavigateHome: () => void;
  onOpenRecord: (record: HistoryRecordV1) => void;
}

const ASSET_CLASS_LABELS = {
  a_share: "A 股",
  etf: "ETF",
  fund: "基金",
} as const;

const CONSTRAINT_LABELS = {
  investment_horizon: "投资期限",
  investment_objective: "投资目标",
  near_term_liquidity: "近期流动性需求",
  tolerable_drawdown: "可承受回撤",
} as const;

function constraintValue(value: string | UnknownFieldState): string {
  return value === "unknown" || value === "not_decided" ? "未知／尚未决定" : value;
}

function EvidenceBoundaryBadge({ record }: { record: HistoryRecordV1 }) {
  const boundary = historyRecordBoundary(record);
  if (boundary.evidence === "cache") {
    return <Badge tone="neutral">缓存证据 · 非实时</Badge>;
  }
  if (boundary.evidence === "fixture") {
    return <Badge tone="neutral">fixture 证据 · 非实时</Badge>;
  }
  return <Badge tone="observed">已保存证据 · 不重新获取</Badge>;
}

function SummaryMetadata({ summary }: { summary: HistorySummary }) {
  return (
    <dl className="history-metadata history-metadata--summary">
      <div>
        <dt>组合快照</dt>
        <dd><code>{summary.snapshot_id}</code></dd>
      </div>
      <div>
        <dt>证据截止</dt>
        <dd><time dateTime={summary.evidence_cutoff_at}>{formatHistoryDateTime(summary.evidence_cutoff_at)}</time></dd>
      </div>
      <div>
        <dt>完成时间</dt>
        <dd><time dateTime={summary.analysis_completed_at}>{formatHistoryDateTime(summary.analysis_completed_at)}</time></dd>
      </div>
    </dl>
  );
}

function EntryBoundary({ entry }: { entry: HistoryListEntry }) {
  if (entry.detail.status === "found") {
    const boundary = historyRecordBoundary(entry.detail.record);
    return (
      <div className="history-entry__badges">
        {!boundary.isExample ? <Badge tone="neutral">用户确认快照</Badge> : null}
        <EvidenceBoundaryBadge record={entry.detail.record} />
      </div>
    );
  }

  if (entry.detail.status === "unsupported_version") {
    return <Badge tone="risk">旧版本不可读 · 不会重算</Badge>;
  }
  if (entry.detail.status === "unreadable") {
    return <Badge tone="risk">记录完整性校验失败</Badge>;
  }
  if (entry.detail.status === "unavailable") {
    return <Badge tone="risk">记录暂时无法读取</Badge>;
  }
  return <Badge tone="neutral">记录已不存在</Badge>;
}

export function HistoryList({ entries, onNavigateHome, onSelectRecord }: HistoryListProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  if (entries.length === 0) {
    return (
      <section className="history-state" aria-labelledby="history-empty-heading">
        <Database aria-hidden="true" size={28} />
        <h2 id="history-empty-heading" ref={headingRef} tabIndex={-1}>这里还没有复盘记录</h2>
        <p>完成一次复盘后，它会按时间保存在当前匿名私密工作区，并绑定当时的快照和证据截止时点。</p>
        <Button onClick={onNavigateHome} variant="primary">返回主页发起复盘</Button>
      </section>
    );
  }

  return (
    <section aria-labelledby="history-list-heading">
      <div className="history-section-heading">
        <div>
          <p className="history-eyebrow">不可变复盘</p>
          <h2 id="history-list-heading" ref={headingRef} tabIndex={-1}>历史记录</h2>
        </div>
        <p>共 {entries.length} 次复盘，按完成时间倒序排列。</p>
      </div>
      <ol className="history-list">
        {entries.map((entry) => (
          <li key={entry.summary.record_id}>
            <article className="history-entry">
              <div className="history-entry__heading">
                <div>
                  <p className="history-entry__date">
                    <Clock3 aria-hidden="true" size={18} />
                    <time dateTime={entry.summary.analysis_completed_at}>
                      {formatHistoryDateTime(entry.summary.analysis_completed_at)}
                    </time>
                  </p>
                  <h3>每日持仓复盘</h3>
                </div>
                <AnalysisStatus status={entry.summary.result_status} />
              </div>
              <EntryBoundary entry={entry} />
              <SummaryMetadata summary={entry.summary} />
              <Button
                className="history-entry__action"
                onClick={() => onSelectRecord(entry.summary.record_id)}
                variant="secondary"
              >
                查看本次记录
                <ChevronRight aria-hidden="true" size={20} />
              </Button>
            </article>
          </li>
        ))}
      </ol>
    </section>
  );
}

function DetailState({
  children,
  heading,
  onBack,
  onNavigateHome,
  retryHome = false,
}: {
  children: React.ReactNode;
  heading: string;
  onBack: () => void;
  onNavigateHome: () => void;
  retryHome?: boolean;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <section className="history-state" aria-labelledby="history-detail-state-heading">
      <FileWarning aria-hidden="true" size={28} />
      <h2 id="history-detail-state-heading" ref={headingRef} tabIndex={-1}>{heading}</h2>
      {children}
      <div className="history-actions">
        <Button onClick={onBack} variant="secondary">
          <ArrowLeft aria-hidden="true" size={20} />
          返回历史列表
        </Button>
        {retryHome ? <Button onClick={onNavigateHome} variant="primary">返回主页</Button> : null}
      </div>
    </section>
  );
}

function UnsupportedDetail({
  detail,
  onBack,
  onNavigateHome,
}: {
  detail: Extract<HistoryReadResult, { status: "unsupported_version" }>;
  onBack: () => void;
  onNavigateHome: () => void;
}) {
  return (
    <DetailState heading="这条旧记录当前无法读取" onBack={onBack} onNavigateHome={onNavigateHome}>
      <p>我们保留了它的快照、状态和证据截止摘要，但不会用今天的契约或最新市场数据重新计算旧分析。</p>
      <SummaryMetadata summary={detail.summary} />
      <dl className="history-version-list">
        {detail.unsupported_versions.map((item) => (
          <div key={item.component}>
            <dt>{item.component}</dt>
            <dd><code>{item.version}</code></dd>
          </div>
        ))}
      </dl>
    </DetailState>
  );
}

function FoundDetail({
  onBack,
  onOpenRecord,
  record,
}: {
  onBack: () => void;
  onOpenRecord: (record: HistoryRecordV1) => void;
  record: HistoryRecordV1;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const boundary = historyRecordBoundary(record);
  const canOpenLongCard = record.analysis.status !== "unavailable" &&
    (Boolean(record.narrative) || Boolean(record.ai_text?.trim()));

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <article className="history-detail" aria-labelledby="history-detail-heading">
      <Button className="history-detail__back" onClick={onBack} variant="secondary">
        <ArrowLeft aria-hidden="true" size={20} />
        返回历史列表
      </Button>
      <header className="history-detail__header">
        <div>
          <p className="history-eyebrow">不可变历史记录</p>
          <h2 id="history-detail-heading" ref={headingRef} tabIndex={-1}>本次复盘边界</h2>
        </div>
        <div className="history-entry__badges">
          {!boundary.isExample ? <Badge tone="neutral">用户确认快照</Badge> : null}
          <EvidenceBoundaryBadge record={record} />
        </div>
      </header>

      <AnalysisStatus status={record.analysis.status} />

      <section className="history-detail__section" aria-labelledby="history-snapshot-heading">
        <h3 id="history-snapshot-heading">组合快照</h3>
        <dl className="history-metadata">
          <div><dt>快照标识</dt><dd><code>{record.snapshot.snapshot_id}</code></dd></div>
          <div><dt>快照创建</dt><dd><time dateTime={record.snapshot.created_at}>{formatHistoryDateTime(record.snapshot.created_at)}</time></dd></div>
          <div><dt>证据截止</dt><dd><time dateTime={record.analysis.evidence_cutoff_at}>{formatHistoryDateTime(record.analysis.evidence_cutoff_at)}</time></dd></div>
          <div><dt>最新完整交易日</dt><dd><time dateTime={record.analysis.latest_complete_trading_day}>{record.analysis.latest_complete_trading_day}</time></dd></div>
        </dl>
        <ul className="history-holdings">
          {record.snapshot.lines.map((line) => (
            <li key={line.line_id}>
              <strong>{line.name}</strong>
              <span>{ASSET_CLASS_LABELS[line.asset_class]} · {line.symbol}</span>
              <span>观察日期：{typeof line.observation_date === "string" ? line.observation_date : "未知"}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="history-detail__section" aria-labelledby="history-constraints-heading">
        <h3 id="history-constraints-heading">本次四项约束</h3>
        <dl className="history-constraints">
          {Object.entries(CONSTRAINT_LABELS).map(([key, label]) => (
            <div key={key}>
              <dt>{label}</dt>
              <dd>{constraintValue(record.snapshot.constraints[key as keyof typeof CONSTRAINT_LABELS])}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="history-detail__section" aria-labelledby="history-record-version-heading">
        <h3 id="history-record-version-heading">记录版本</h3>
        <p>该详情只读取分析完成时保存的输入、证据和结果，不请求供应商，也不采用后来数据。</p>
        <dl className="history-version-list">
          <div><dt>历史 schema</dt><dd><code>{record.schema_version}</code></dd></div>
          <div><dt>理性分析</dt><dd><code>{record.rational_analysis_version}</code></dd></div>
          <div><dt>主题叙事</dt><dd><code>{record.theme_narrative_version ?? "未生成"}</code></dd></div>
        </dl>
      </section>

      {record.analysis.status === "unavailable" ? (
        <section className="history-detail__notice" role="status">
          <h3>本次分析未生成复盘报告</h3>
          <p>历史保留当时的不可用结果，不补写复盘报告。</p>
          {record.analysis.recovery_actions?.length ? (
            <ul>{record.analysis.recovery_actions.map((action) => <li key={action}>{action}</li>)}</ul>
          ) : null}
        </section>
      ) : null}

      <div className="history-actions">
        {canOpenLongCard ? (
          <Button onClick={() => onOpenRecord(record)} variant="primary">打开本次复盘报告</Button>
        ) : (
          <p className="history-detail__no-card">
            {record.analysis.status === "unavailable" ? "分析不可用，没有可展示的复盘报告。" : "本次未保存可重放的模型文本或主题叙事。"}
          </p>
        )}
      </div>
    </article>
  );
}

export function HistoryDetail({ detail, onBack, onNavigateHome, onOpenRecord }: HistoryDetailProps) {
  if (detail.status === "found") {
    return <FoundDetail onBack={onBack} onOpenRecord={onOpenRecord} record={detail.record} />;
  }
  if (detail.status === "unsupported_version") {
    return <UnsupportedDetail detail={detail} onBack={onBack} onNavigateHome={onNavigateHome} />;
  }
  if (detail.status === "unreadable") {
    return (
      <DetailState heading="这条记录未通过完整性校验" onBack={onBack} onNavigateHome={onNavigateHome}>
        <p>为避免展示被破坏或不完整的历史，满懂不会读取部分内容，也不会按当前数据重算。</p>
        <SummaryMetadata summary={detail.summary} />
      </DetailState>
    );
  }
  if (detail.status === "unavailable") {
    return (
      <DetailState heading="历史记录暂时无法读取" onBack={onBack} onNavigateHome={onNavigateHome}>
        <p>存储读取失败。已保存记录不会被替换为静态示例或重新生成的内容，请稍后从历史列表重试。</p>
      </DetailState>
    );
  }
  return (
    <DetailState heading="这条记录已不存在" onBack={onBack} onNavigateHome={onNavigateHome} retryHome>
      <p>它可能已随工作区主动删除或在 30 天无活动后到期清理，无法通过正常产品路径恢复。</p>
    </DetailState>
  );
}

function WorkspaceUnavailable({
  availability,
  onNavigateHome,
}: {
  availability: Exclude<HistoryAvailability, "active">;
  onNavigateHome: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <section className="history-state history-state--workspace" aria-labelledby="history-workspace-state-heading">
      <FileWarning aria-hidden="true" size={28} />
      <h2 id="history-workspace-state-heading" ref={headingRef} tabIndex={-1}>
        {availability === "expired" ? "工作区已到期" : "工作区已删除"}
      </h2>
      <p>
        {availability === "expired"
          ? "30 天无活动保留期已经结束，持仓、约束、复盘与历史已自动删除。"
          : "主动删除已清除该工作区的持仓、约束、复盘与历史。"}
        这些内容无法通过正常产品路径恢复。
      </p>
      <Button onClick={onNavigateHome} variant="primary">返回主页</Button>
    </section>
  );
}

export function HistoryView({
  availability = "active",
  onNavigateHome,
  onOpenRecord,
  reader,
  reduceMotion = false,
  workspaceId,
}: HistoryViewProps) {
  const [loadRevision, setLoadRevision] = useState(0);
  const [result, setResult] = useState<HistoryEntriesResult | null>(null);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);

  useEffect(() => {
    if (availability !== "active") return;
    let active = true;
    setResult(null);
    setSelectedRecordId(null);
    void loadHistoryEntries(reader, workspaceId).then((nextResult) => {
      if (active) setResult(nextResult);
    });
    return () => {
      active = false;
    };
  }, [availability, loadRevision, reader, workspaceId]);

  if (availability !== "active") {
    return <WorkspaceUnavailable availability={availability} onNavigateHome={onNavigateHome} />;
  }

  if (!result) {
    return (
      <section className="history-state" aria-live="polite" role="status">
        <Database aria-hidden="true" size={28} />
        <h2>正在读取当前工作区历史</h2>
        <p>只读取已提交的不可变记录，不会重新调用数据供应商。</p>
      </section>
    );
  }

  if (result.status === "unavailable") {
    return (
      <section className="history-state" aria-labelledby="history-load-failed-heading">
        <FileWarning aria-hidden="true" size={28} />
        <h2 id="history-load-failed-heading">历史暂时无法读取</h2>
        <p>当前工作区的历史存储读取失败。页面不会用伪造静态记录代替它。</p>
        <Button onClick={() => setLoadRevision((revision) => revision + 1)} variant="secondary">
          <RefreshCw aria-hidden="true" size={20} />
          重新读取
        </Button>
      </section>
    );
  }

  const selectedEntry = selectedRecordId
    ? result.entries.find((entry) => entry.summary.record_id === selectedRecordId)
    : undefined;

  return (
    <div className="history-view" data-reduce-motion={reduceMotion || undefined}>
      {selectedEntry ? (
        <HistoryDetail
          detail={selectedEntry.detail}
          onBack={() => setSelectedRecordId(null)}
          onNavigateHome={onNavigateHome}
          onOpenRecord={onOpenRecord}
        />
      ) : (
        <HistoryList
          entries={result.entries}
          onNavigateHome={onNavigateHome}
          onSelectRecord={setSelectedRecordId}
        />
      )}
    </div>
  );
}
