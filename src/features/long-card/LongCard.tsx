import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import {
  ArrowLeft,
  BookOpenCheck,
  ListChecks,
} from "lucide-react";
import {
  validatePortfolioSnapshot,
  type AnalysisResult,
  type EvidenceRecord,
  type MaterialReference,
  type PersonalConstraints,
  type PortfolioSnapshot,
  type ProvenanceKind,
} from "../../contracts/index.js";
import type { AnalysisFixture } from "../../fixtures/scenarios.js";
import {
  THEME_NARRATIVE_SCHEMA_VERSION,
  validateOwnedAnalysisResult,
  type ThemeModelOutput,
} from "../../analysis/index.js";
import {
  AnalysisStatus,
  Button,
  GeneratedMarkdown,
} from "../../client/ui/index.js";
import { themeForId } from "../../theme/index.js";
import { themeClientAssets, themeCssVariables } from "../../theme/client.js";
import "./LongCard.css";


export type LongCardFace = "narrative" | "evidence";

export interface LongCardRuntimeInput {
  analysis: AnalysisResult;
  exampleLabel?: string;
  isExample: boolean;
  narrative?: ThemeModelOutput;
  aiText?: string;
  aiThemeText?: string;
  snapshot: PortfolioSnapshot;
}

export interface EvidencePageReader {
  getAnalysisHoldingsPage(analysisId: string, options?: { cursor?: string; limit?: number }): Promise<{
    holdings: PortfolioSnapshot["lines"];
    next_cursor: string | null;
    total: number;
  }>;
  getAnalysisEvidencePage(analysisId: string, options?: { cursor?: string; limit?: number }): Promise<{
    evidence: EvidenceRecord[];
    next_cursor: string | null;
    total: number;
  }>;
}

export interface LongCardProps {
  input: LongCardRuntimeInput;
  evidenceReader?: EvidencePageReader;
  reducedMotion?: boolean;
}

export interface FaceScrollOffsets {
  evidence: number | null;
  narrative: number | null;
}


interface PendingScrollRestore {
  face: LongCardFace;
  offset: number;
}


export function longCardRuntimeFromFixture(fixture: AnalysisFixture): LongCardRuntimeInput {
  const { analysis } = fixture;
  const narrative: ThemeModelOutput | undefined = analysis.status === "unavailable"
    ? undefined
    : {
        schema_version: THEME_NARRATIVE_SCHEMA_VERSION,
        rational_analysis_id: analysis.analysis_id,
        theme_id: analysis.theme_id,
        headline: themeForId(analysis.theme_id).copy.resultTitle,
        body_paragraphs: analysis.conclusions.map((item) => item.statement),
        mascot_mood: "calm",
        guidance_summary: analysis.advice.map((item) => item.statement).join("；"),
        conclusion_ids: analysis.conclusions.map((item) => item.id),
        advice_ids: analysis.advice.map((item) => item.id),
      };

  return {
    analysis,
    exampleLabel: fixture.example_label,
    isExample: fixture.is_example,
    ...(narrative ? { narrative } : {}),
    snapshot: fixture.snapshot,
  };
}

export function longCardRuntimeIsDisplayable(input: LongCardRuntimeInput): boolean {
  const { analysis, narrative, aiText, snapshot } = input;
  const deferredSnapshot = snapshot.lines.length === 0 &&
    Number.isSafeInteger((snapshot as PortfolioSnapshot & { lines_total?: unknown }).lines_total);
  const deferredEvidence = analysis.evidence.length === 0 &&
    Number.isSafeInteger((analysis as AnalysisResult & { evidence_total?: unknown }).evidence_total);
  if (
    (!deferredSnapshot && !validatePortfolioSnapshot(snapshot).ok) ||
    (!deferredEvidence && !validateOwnedAnalysisResult(analysis).ok) ||
    analysis.status === "unavailable" ||
    analysis.snapshot_id !== snapshot.snapshot_id ||
    analysis.contracts_version !== snapshot.contracts_version ||
    analysis.theme_id !== snapshot.theme_id ||
    JSON.stringify(analysis.constraints) !== JSON.stringify(snapshot.constraints)
  ) {
    return false;
  }
  // Relaxed Demo mode: a free-text model narrative alone can front the card.
  if (aiText && aiText.trim()) return true;
  if (!narrative) return false;

  return narrative.schema_version === THEME_NARRATIVE_SCHEMA_VERSION &&
    narrative.rational_analysis_id === analysis.analysis_id &&
    narrative.theme_id === analysis.theme_id &&
    JSON.stringify(narrative.conclusion_ids) ===
      JSON.stringify(analysis.conclusions.map((item) => item.id)) &&
    JSON.stringify(narrative.advice_ids) ===
      JSON.stringify(analysis.advice.map((item) => item.id)) &&
    narrative.guidance_summary === analysis.advice.map((item) => item.statement).join("；");
}


export function preserveFaceScrollOffsets(
  offsets: FaceScrollOffsets,
  currentFace: LongCardFace,
  targetFace: LongCardFace,
  currentOffset: number,
): FaceScrollOffsets {
  return {
    ...offsets,
    [currentFace]: currentOffset,
    [targetFace]: offsets[targetFace] ?? 0,
  };
}

function formatConstraint(value: string): string {
  return value === "unknown" || value === "not_decided" ? "未知／尚未决定" : value;
}

function provenanceLabel(provenance: ProvenanceKind): string {
  const labels: Record<ProvenanceKind, string> = {
    observed: "观察",
    derived: "派生",
    generated: "生成表达",
  };
  return labels[provenance];
}

function referenceKindLabel(kind: MaterialReference["kind"]): string {
  const labels: Record<MaterialReference["kind"], string> = {
    confirmed_input: "确认输入",
    derived: "派生结果",
    evidence: "证据",
  };
  return labels[kind];
}

function evidenceStatusLabel(status: EvidenceRecord["status"]): string {
  const labels: Record<EvidenceRecord["status"], string> = {
    available: "可用",
    stale: "已过期",
    ambiguous: "含糊",
    unsupported: "不支持",
    conflicting: "有冲突",
    rate_limited: "限流",
    failed: "获取失败",
    unverified: "未核验",
  };
  return labels[status];
}

function ThemeMascot({ themeId }: { themeId: string }) {
  const theme = themeForId(themeId);
  const assets = themeClientAssets(themeId);
  return (
    <figure className="mandong-doudou">
      <img alt={theme.mascot.alt} height={assets.rest.height} src={assets.rest.src} width={assets.rest.width} />
      <figcaption>
        <strong>{theme.mascot.name}</strong>
        <span>{theme.mascot.caption}</span>
      </figcaption>
    </figure>
  );
}

function CoverageSummary({ input }: { input: LongCardRuntimeInput }) {
  const { coverage } = input.analysis;
  const pending = coverage.uncovered_line_ids.length + coverage.unsupported_line_ids.length;
  const holdingsTotal = (input.snapshot as PortfolioSnapshot & { lines_total?: number }).lines_total ?? input.snapshot.lines.length;
  return (
    <dl className="mandong-long-card__coverage" aria-label="本次分析覆盖">
      <div>
        <dt>确认持仓</dt>
        <dd>{holdingsTotal} 项</dd>
      </div>
      <div>
        <dt>已覆盖</dt>
        <dd>{coverage.covered_line_ids.length} 项</dd>
      </div>
      <div>
        <dt>未覆盖或不支持</dt>
        <dd>{pending} 项</dd>
      </div>
    </dl>
  );
}

interface FaceProps {
  active: boolean;
  faceId: string;
  headingId: string;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  input: LongCardRuntimeInput;
  evidenceReader?: EvidencePageReader;
}

interface NarrativeFaceProps extends FaceProps {
  narrative: ThemeModelOutput;
}

interface AiNarrativeFaceProps extends FaceProps {
  aiText: string;
}

export function NarrativeFront({
  active,
  faceId,
  headingId,
  headingRef,
  input,
  narrative,
}: NarrativeFaceProps) {
  const { analysis } = input;
  const theme = themeForId(analysis.theme_id);
  return (
    <article
      aria-hidden={!active}
      aria-labelledby={headingId}
      className="mandong-long-card__face mandong-long-card__front"
      id={faceId}
      inert={!active}
    >
      <header className="mandong-long-card__intro">
        <div className="mandong-long-card__masthead mandong-long-card__masthead--narrative">
          <div>
            <p className="mandong-long-card__theme">{theme.label}</p>
            <h2 id={headingId} ref={headingRef} tabIndex={-1}>{narrative.headline}</h2>
            <p>最新完整交易日 <time dateTime={analysis.latest_complete_trading_day}>{analysis.latest_complete_trading_day}</time></p>
          </div>
          <div className="mandong-long-card__guide" data-mascot-mood={narrative.mascot_mood}>
            <ThemeMascot themeId={analysis.theme_id} />
          </div>
        </div>
      </header>

      <section className="mandong-long-card__section" aria-labelledby={`${headingId}-observations`}>
        <h3 id={`${headingId}-observations`}>核心观察</h3>
        {narrative.body_paragraphs.length > 0 ? (
          <ol className="mandong-long-card__statements">
            {narrative.body_paragraphs.map((paragraph, index) => {
              const conclusion = analysis.conclusions[index];
              return (
                <li key={narrative.conclusion_ids[index] ?? `${index}-${paragraph}`}>
                  <span className="mandong-long-card__provenance">生成表达</span>
                  <strong>{paragraph}</strong>
                  {conclusion?.affected_by_unknowns ? <span>受未知项影响，结论范围已缩小。</span> : null}
                </li>
              );
            })}
          </ol>
        ) : <p>当前没有可展示的物质性结论。</p>}
      </section>

      <section className="mandong-long-card__section" aria-labelledby={`${headingId}-directions`}>
        <h3 id={`${headingId}-directions`}>方向性建议</h3>
        {narrative.advice_ids.length > 0 ? (
          <ul className="mandong-long-card__statements">
            <li>
              <strong>{narrative.guidance_summary}</strong>
              <span>方向性关注，不形成精确交易指令。</span>
            </li>
          </ul>
        ) : <p>当前证据只支持观察，不支持方向性建议。</p>}
      </section>

      <section className="mandong-long-card__section" aria-labelledby={`${headingId}-unknowns`}>
        <h3 id={`${headingId}-unknowns`}>未知与限制</h3>
        {analysis.unknowns.length + analysis.limitations.length > 0 ? (
          <ul className="mandong-long-card__plain-list">
            {analysis.unknowns.map((item) => <li key={item.id}>{item.impact}（{item.reason}）</li>)}
            {analysis.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}
          </ul>
        ) : <p>当前分析范围内未记录额外未知项。</p>}
      </section>

      <footer className="mandong-long-card__footer">
        <p>AI 分析仅供信息整理与理解参考，不对投资决策或结果负责；请自行判断与操作。</p>
      </footer>
    </article>
  );
}

/**
 * Relaxed Demo mode front: renders the model's free-text narrative over the
 * same deterministic shell (date, status, mascot, risk notes). It changes only
 * the expression, never the analysis, coverage, or risk judgement.
 */
export function AiNarrativeFront({
  active,
  faceId,
  headingId,
  headingRef,
  input,
  aiText,
}: AiNarrativeFaceProps) {
  const { analysis } = input;
  const theme = themeForId(analysis.theme_id);
  return (
    <article
      aria-hidden={!active}
      aria-labelledby={headingId}
      className="mandong-long-card__face mandong-long-card__front"
      id={faceId}
      inert={!active}
    >
      <header className="mandong-long-card__intro">
        <div className="mandong-long-card__masthead mandong-long-card__masthead--narrative">
          <div>
            <p className="mandong-long-card__theme">{theme.label}</p>
            <h2 id={headingId} ref={headingRef} tabIndex={-1}>{theme.copy.resultTitle}</h2>
            <p>最新完整交易日 <time dateTime={analysis.latest_complete_trading_day}>{analysis.latest_complete_trading_day}</time></p>
          </div>
          <div className="mandong-long-card__guide" data-mascot-mood="calm">
            <ThemeMascot themeId={analysis.theme_id} />
          </div>
        </div>
      </header>

      <section className="mandong-long-card__section" aria-labelledby={`${headingId}-observations`}>
        <h3 id={`${headingId}-observations`}>本次复盘</h3>
        {aiText.trim() ? (
          <GeneratedMarkdown>{aiText}</GeneratedMarkdown>
        ) : <p>模型未返回可展示的复盘文本。</p>}
      </section>

      <footer className="mandong-long-card__footer">
        <p>AI 分析仅供信息整理与理解参考，不对投资决策或结果负责；请自行判断与操作。</p>
      </footer>
    </article>
  );
}

function ReferenceList({ refs }: { refs: MaterialReference[] }) {
  return (
    <ul className="mandong-long-card__refs">
      {refs.map((ref) => (
        <li key={`${ref.kind}-${ref.ref_id}`}>
          <span>{referenceKindLabel(ref.kind)}</span>
          <code>{ref.ref_id}</code>
        </li>
      ))}
    </ul>
  );
}

export function Constraints({ constraints }: { constraints: PersonalConstraints }) {
  const rows = [
    ["投资期限", constraints.investment_horizon],
    ["近期流动性需求", constraints.near_term_liquidity],
    ["可承受回撤", constraints.tolerable_drawdown],
    ["投资目标", constraints.investment_objective],
  ] as const;
  return (
    <dl className="mandong-long-card__constraints">
      {rows.map(([label, value]) => (
        <div key={label}><dt>{label}</dt><dd>{formatConstraint(value)}</dd></div>
      ))}
    </dl>
  );
}

function EvidencePageList({ analysisId, fallbackEvidence, reader }: {
  analysisId: string;
  fallbackEvidence: readonly EvidenceRecord[];
  reader?: EvidencePageReader;
}) {
  const [cursor, setCursor] = useState<string | undefined>();
  const [previousCursors, setPreviousCursors] = useState<string[]>([]);
  const [page, setPage] = useState<{ evidence: EvidenceRecord[]; next_cursor: string | null; total: number } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    if (!reader) {
      setPage({ evidence: [...fallbackEvidence], next_cursor: null, total: fallbackEvidence.length });
      return () => { cancelled = true; };
    }
    void reader.getAnalysisEvidencePage(analysisId, { ...(cursor ? { cursor } : {}), limit: 20 })
      .then((next) => { if (!cancelled) setPage(next); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [analysisId, cursor, fallbackEvidence, reader]);

  if (failed) return <p>行情证据暂时无法读取，请稍后重试。</p>;
  if (!page) return <p>正在读取行情证据…</p>;
  return (
    <>
      <div className="mandong-long-card__materials-list">
        {page.evidence.map((evidence) => (
          <article className="mandong-long-card__evidence-list mandong-long-card__material-evidence" key={evidence.id}>
            <div><strong>{evidence.metric_or_event_type}</strong><span>{provenanceLabel(evidence.provenance)} · {evidenceStatusLabel(evidence.status)}</span></div>
            <dl>
              <div><dt>证据 ID</dt><dd>{evidence.id}</dd></div>
              <div><dt>来源</dt><dd>{evidence.source.name}</dd></div>
              <div><dt>定位</dt><dd>{evidence.source.locator}</dd></div>
              <div><dt>观察／发布时间</dt><dd>{evidence.observation_or_event_time}</dd></div>
              <div><dt>获取时间</dt><dd>{evidence.fetched_at}</dd></div>
            </dl>
            {evidence.limitations.length > 0 ? <ul className="mandong-long-card__plain-list">{evidence.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul> : null}
          </article>
        ))}
      </div>
      {reader && (previousCursors.length > 0 || page.next_cursor) ? (
        <nav aria-label="行情证据分页" className="mandong-long-card__pagination">
          <Button disabled={previousCursors.length === 0} onClick={() => {
            const previous = previousCursors.at(-1);
            setPreviousCursors((items) => items.slice(0, -1));
            setCursor(previous);
          }} variant="secondary">上一页</Button>
          <span>{page.total} 条证据</span>
          <Button disabled={!page.next_cursor} onClick={() => {
            if (!page.next_cursor) return;
            setPreviousCursors((items) => [...items, cursor ?? ""]);
            setCursor(page.next_cursor);
          }} variant="secondary">下一页</Button>
        </nav>
      ) : null}
    </>
  );
}

function HoldingPageList({ analysis, reader }: { analysis: AnalysisResult; reader?: EvidencePageReader }) {
  const [cursor, setCursor] = useState<string | undefined>();
  const [previous, setPrevious] = useState<string[]>([]);
  const [page, setPage] = useState<{ holdings: PortfolioSnapshot["lines"]; next_cursor: string | null; total: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!reader) { setPage(null); return () => { cancelled = true; }; }
    void reader.getAnalysisHoldingsPage(analysis.analysis_id, { ...(cursor ? { cursor } : {}), limit: 20 })
      .then((next) => { if (!cancelled) setPage(next); });
    return () => { cancelled = true; };
  }, [analysis.analysis_id, cursor, reader]);
  if (!page) return <p>正在读取本次分析用到的持仓…</p>;
  return <>
    <div className="mandong-long-card__materials-list">{page.holdings.map((line) => {
      const covered = analysis.coverage.covered_line_ids.includes(line.line_id);
      const unsupported = analysis.coverage.unsupported_line_ids.includes(line.line_id);
      return <article className="mandong-long-card__evidence-list mandong-long-card__material-holding" key={line.line_id}>
        <div><strong>{line.name}</strong><span>{line.asset_class.toUpperCase()} · {line.symbol}</span></div>
        <dl><div><dt>规模依据</dt><dd>{line.size_basis}</dd></div><div><dt>持仓确认日</dt><dd>{line.observation_date}</dd></div><div><dt>覆盖</dt><dd>{covered ? "已覆盖" : unsupported ? "不支持" : "未覆盖"}</dd></div></dl>
      </article>;
    })}</div>
    {(previous.length > 0 || page.next_cursor) ? <nav aria-label="持仓分页" className="mandong-long-card__pagination">
      <Button disabled={previous.length === 0} onClick={() => { const value = previous.at(-1); setPrevious((items) => items.slice(0, -1)); setCursor(value); }} variant="secondary">上一页</Button>
      <span>{page.total} 项持仓</span>
      <Button disabled={!page.next_cursor} onClick={() => { if (!page.next_cursor) return; setPrevious((items) => [...items, cursor ?? ""]); setCursor(page.next_cursor); }} variant="secondary">下一页</Button>
    </nav> : null}
  </>;
}

export function RationalEvidenceBack({ active, faceId, headingId, headingRef, input, evidenceReader }: FaceProps) {
  const { analysis, snapshot } = input;
  // Relaxed Demo mode: the back face is the formal rational analysis report
  // (the model's report text plus the inputs it was given). The placeholder
  // conclusion/advice shells and derivation bookkeeping stay hidden.
  const relaxed = Boolean(input.aiText && !input.narrative);
  const [showAnalysisMaterials, setShowAnalysisMaterials] = useState(false);
  return (
    <article
      aria-hidden={!active}
      aria-labelledby={headingId}
      className="mandong-long-card__face mandong-long-card__back"
      id={faceId}
      inert={!active}
    >
      <header className="mandong-long-card__intro">
        <div className="mandong-long-card__date-row">
          <p>{relaxed ? "理性分析背面" : "理性证据背面"}</p>
        </div>
        <div className="mandong-long-card__masthead mandong-long-card__masthead--evidence">
          <div>
            <h2 id={headingId} ref={headingRef} tabIndex={-1}>{relaxed ? "今日理性分析报告" : "逐项核对这份分析"}</h2>
          </div>
          <BookOpenCheck aria-hidden="true" size={40} strokeWidth={1.5} />
        </div>
        {!relaxed ? (
          <dl className="mandong-long-card__identity">
            <div><dt>组合快照</dt><dd>{snapshot.snapshot_id}</dd></div>
            <div><dt>分析版本</dt><dd>{analysis.analysis_id}</dd></div>
            <div><dt>契约版本</dt><dd>{analysis.contracts_version}</dd></div>
            <div><dt>证据截止</dt><dd>{analysis.evidence_cutoff_at}</dd></div>
          </dl>
        ) : null}
      </header>

      {relaxed ? (
        <section className="mandong-long-card__section" aria-labelledby={`${headingId}-report`}>
          <h3 id={`${headingId}-report`}>报告正文</h3>
          {input.aiText?.trim() ? (
            <GeneratedMarkdown>{input.aiText}</GeneratedMarkdown>
          ) : <p>模型未返回可展示的分析报告。</p>}
        </section>
      ) : null}

      <section className="mandong-long-card__materials-toggle" aria-label="本次分析依据">
        <Button
          aria-expanded={showAnalysisMaterials}
          onClick={() => setShowAnalysisMaterials((visible) => !visible)}
          variant="secondary"
        >
          {showAnalysisMaterials ? "收起本次分析依据" : "查看本次分析依据"}
        </Button>
      </section>

      {showAnalysisMaterials ? (
        <div className="mandong-long-card__materials-content">
          <section className="mandong-long-card__section" aria-labelledby={`${headingId}-inputs`}>
            <h3 id={`${headingId}-inputs`}>{relaxed ? "本次分析用到的持仓" : "确认输入与覆盖"}</h3>
            <CoverageSummary input={input} />
            <HoldingPageList analysis={analysis} reader={evidenceReader} />
          </section>

          <section className="mandong-long-card__section" aria-labelledby={`${headingId}-constraints`}>
            <h3 id={`${headingId}-constraints`}>四项个人约束</h3>
            <Constraints constraints={analysis.constraints} />
          </section>
        </div>
      ) : null}

      {!relaxed ? (
        <section className="mandong-long-card__section" aria-labelledby={`${headingId}-conclusions`}>
          <h3 id={`${headingId}-conclusions`}>结论与引用</h3>
        <ol className="mandong-long-card__evidence-list">
          {analysis.conclusions.map((conclusion) => (
            <li key={conclusion.id}>
              <div><strong>{conclusion.statement}</strong><span>{provenanceLabel(conclusion.provenance)}</span></div>
              <ReferenceList refs={conclusion.refs} />
              {conclusion.limited_by?.length ? <p>受限于 {conclusion.limited_by.join("、")}</p> : null}
            </li>
          ))}
        </ol>
      </section>
      ) : null}

      {!relaxed ? (
        <section className="mandong-long-card__section" aria-labelledby={`${headingId}-advice`}>
          <h3 id={`${headingId}-advice`}>建议与触发依据</h3>
        {analysis.advice.length > 0 ? (
          <ul className="mandong-long-card__evidence-list">
            {analysis.advice.map((advice) => (
              <li key={advice.id}>
                <div><strong>{advice.statement}</strong><span>{advice.urgency === "attention" ? "需要留意" : "常规关注"}</span></div>
                <ReferenceList refs={advice.trigger_refs} />
              </li>
            ))}
          </ul>
        ) : <p>当前没有证据支持方向性建议。</p>}
      </section>
      ) : null}

      {showAnalysisMaterials ? (
        <section className="mandong-long-card__section" aria-labelledby={`${headingId}-evidence`}>
          <h3 id={`${headingId}-evidence`}>{relaxed ? "本次分析用到的行情证据" : "观察证据与核验状态"}</h3>
          <EvidencePageList
            analysisId={analysis.analysis_id}
            fallbackEvidence={analysis.evidence}
            reader={evidenceReader}
          />
        </section>
      ) : null}

      {!relaxed ? (
        <section className="mandong-long-card__section" aria-labelledby={`${headingId}-derived`}>
          <h3 id={`${headingId}-derived`}>可复算派生关系</h3>
        {analysis.derived.length > 0 ? (
          <ul className="mandong-long-card__evidence-list">
            {analysis.derived.map((derived) => (
              <li key={derived.id}>
                <div><strong>{derived.label}：{derived.value}</strong><span>{provenanceLabel(derived.provenance)}</span></div>
                <p>{derived.formula_or_rule}</p>
                {derived.input_refs.length > 0 ? <p>输入 {derived.input_refs.join("、")}</p> : null}
                {derived.evidence_refs.length > 0 ? <p>证据 {derived.evidence_refs.join("、")}</p> : null}
              </li>
            ))}
          </ul>
        ) : <p>当前结果未形成可复算派生项。</p>}
      </section>
      ) : null}

      {!relaxed ? (
        <section className="mandong-long-card__section" aria-labelledby={`${headingId}-gaps`}>
          <h3 id={`${headingId}-gaps`}>缺口、假设与限制</h3>
        <ul className="mandong-long-card__plain-list">
          {analysis.unknowns.map((unknown) => <li key={unknown.id}>{unknown.subject}：{unknown.impact}（{unknown.reason}）</li>)}
          {analysis.coverage.missing_metrics.map((metric) => <li key={metric}>缺失指标：{metric}</li>)}
          {analysis.assumptions.map((assumption) => <li key={assumption}>假设：{assumption}</li>)}
          {analysis.limitations.map((limitation) => <li key={limitation}>限制：{limitation}</li>)}
          {analysis.unknowns.length + analysis.coverage.missing_metrics.length + analysis.assumptions.length + analysis.limitations.length === 0 ? <li>当前分析范围内未记录额外缺口。</li> : null}
        </ul>
      </section>
      ) : null}

      <footer className="mandong-long-card__footer">
        <p>AI 分析仅供信息整理与理解参考，不对投资决策或结果负责；请自行判断与操作。</p>
      </footer>
    </article>
  );
}

function Unavailable({ input }: { input: LongCardRuntimeInput }) {
  const { analysis } = input;
  return (
    <section className="mandong-long-card mandong-long-card--unavailable" aria-labelledby="analysis-unavailable-heading">
      <AnalysisStatus status="unavailable" />
      <h2 id="analysis-unavailable-heading">当前证据不足以生成复盘报告</h2>
      <p>{analysis.limitations.join(" ")}</p>
      <h3>可以怎样恢复</h3>
      <ul className="mandong-long-card__plain-list">
        {analysis.recovery_actions?.map((action) => <li key={action}>{action}</li>)}
      </ul>
    </section>
  );
}

function IncompleteLongCard() {
  return (
    <section
      className="mandong-long-card mandong-long-card--unavailable"
      aria-labelledby="analysis-incomplete-heading"
      role="status"
    >
      <h2 id="analysis-incomplete-heading">复盘报告暂不可展示</h2>
      <p>分析结果或主题叙事缺失、版本不匹配，未通过同一快照与同一结论校验。</p>
      <h3>可以怎样恢复</h3>
      <ul className="mandong-long-card__plain-list">
        <li>返回分析状态，等待完整且已校验的结果。</li>
        <li>若任务已经结束，可重新发起本次复盘。</li>
      </ul>
    </section>
  );
}

export function LongCard({ input, evidenceReader, reducedMotion = false }: LongCardProps) {
  const [face, setFace] = useState<LongCardFace>("narrative");
  const [transitionDirection, setTransitionDirection] = useState<"forward" | "backward" | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const narrativeHeadingRef = useRef<HTMLHeadingElement>(null);
  const evidenceHeadingRef = useRef<HTMLHeadingElement>(null);
  const scrollOffsetsRef = useRef<FaceScrollOffsets>({ evidence: null, narrative: null });
  const pendingScrollRestoreRef = useRef<PendingScrollRestore | null>(null);
  const id = useId();
  const { analysis, narrative, aiText, aiThemeText } = input;
  const narrativeHeadingId = `${id}-narrative-heading`;
  const evidenceHeadingId = `${id}-evidence-heading`;
  const narrativeFaceId = `${id}-narrative-face`;
  const evidenceFaceId = `${id}-evidence-face`;

  const longContent = Math.max(aiText?.length ?? 0, aiThemeText?.length ?? 0) > 4_000;

  useLayoutEffect(() => {
    const pending = pendingScrollRestoreRef.current;
    const stage = stageRef.current;
    if (pending === null || stage === null || pending.face !== face) return;

    const heading = face === "evidence" ? evidenceHeadingRef.current : narrativeHeadingRef.current;
    heading?.focus({ preventScroll: true });
    const stageTop = window.scrollY + stage.getBoundingClientRect().top;
    window.scrollTo({ top: stageTop + pending.offset });
    pendingScrollRestoreRef.current = null;
  }, [face]);

  if (analysis.status === "unavailable") {
    return <Unavailable input={input} />;
  }

  if (!longCardRuntimeIsDisplayable(input)) {
    return <IncompleteLongCard />;
  }

  function switchFace(targetFace: LongCardFace) {
    if (targetFace === face) return;
    const stage = stageRef.current;
    const stageTop = stage === null ? window.scrollY : window.scrollY + stage.getBoundingClientRect().top;
    const currentOffset = Math.max(0, window.scrollY - stageTop);
    const nextOffsets = preserveFaceScrollOffsets(scrollOffsetsRef.current, face, targetFace, currentOffset);
    scrollOffsetsRef.current = nextOffsets;
    pendingScrollRestoreRef.current = {
      face: targetFace,
      offset: nextOffsets[targetFace] ?? currentOffset,
    };
    setTransitionDirection(reducedMotion ? null : targetFace === "evidence" ? "forward" : "backward");
    setFace(targetFace);
  }


  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      switchFace("evidence");
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      switchFace("narrative");
    }
  }

  const showEvidence = face === "evidence";
  // Relaxed Demo mode: the back is the formal rational report, the front is the
  // theme rendition of the same report.
  const relaxedMode = Boolean(aiText && !narrative);
  const theme = themeForId(analysis.theme_id);
  const faceLabel = showEvidence ? (relaxedMode ? "理性分析" : "理性证据") : theme.label;
  const stageStyle = {} as CSSProperties;
  return (
    <section
      className={`mandong-long-card mandong-long-card--${analysis.status}`}
      data-theme={theme.id}
      data-long-content={longContent || undefined}
      data-reduced-motion={reducedMotion || undefined}
      aria-label="每日复盘报告"
      style={themeCssVariables(theme.id)}
    >
      <div className="mandong-long-card__toolbar">
        <span className="mandong-long-card__face-state">{showEvidence ? "分析详情" : "报告摘要"}</span>
        <Button onClick={() => switchFace(showEvidence ? "narrative" : "evidence")} variant="secondary">
          {showEvidence ? <ArrowLeft aria-hidden="true" size={18} /> : <ListChecks aria-hidden="true" size={18} />}
          {showEvidence ? "返回报告" : "查看分析详情"}
        </Button>
      </div>
      <div
        aria-label="每日复盘报告内容，按左右方向键切换报告与分析详情。"
        className="mandong-long-card__stage"
        onKeyDown={handleKeyDown}
        ref={stageRef}
        style={stageStyle}
        tabIndex={0}
      >
        <div
          className="mandong-long-card__motion"
          data-face={face}
          data-transition={transitionDirection ?? undefined}
          data-transitioning={transitionDirection !== null || undefined}
          onTransitionEnd={(event) => {
            if (event.target === event.currentTarget && event.propertyName === "transform") {
              setTransitionDirection(null);
            }
          }}
        >
          {narrative ? (
            <NarrativeFront active={!showEvidence} faceId={narrativeFaceId} headingId={narrativeHeadingId} headingRef={narrativeHeadingRef} input={input} narrative={narrative} />
          ) : (
            <AiNarrativeFront active={!showEvidence} faceId={narrativeFaceId} headingId={narrativeHeadingId} headingRef={narrativeHeadingRef} input={input} aiText={aiThemeText ?? aiText ?? ""} />
          )}
          {showEvidence ? <RationalEvidenceBack active evidenceReader={evidenceReader} faceId={evidenceFaceId} headingId={evidenceHeadingId} headingRef={evidenceHeadingRef} input={input} /> : null}
        </div>
      </div>
      <span aria-live="polite" className="mandong-long-card__keyboard-status">当前：{faceLabel}</span>

    </section>
  );
}

export function ThemePreview() {
  const theme = themeForId("eastern_observation");
  const assets = themeClientAssets(theme.id);
  return (
    <section className="mandong-theme-preview" aria-labelledby="theme-preview-heading">
      <div className="mandong-theme-preview__heading">
        <div>
          <p>复盘主题</p>
          <h2 id="theme-preview-heading">{theme.label}</h2>
        </div>
        <p>主题只改变表达，不改变证据、风险与建议。</p>
      </div>
      <div className="mandong-theme-preview__options" aria-label="主题展示">
        <div className="mandong-theme-preview__option mandong-theme-preview__option--current">
          <img alt={theme.mascot.alt} decoding="async" height="128" loading="lazy" src={assets.rest.src} width="128" />
          <div><strong>{theme.label}</strong><span>{theme.mascot.name} · 当前主题</span></div>
        </div>
      </div>
    </section>
  );
}
