import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";
import {
  ArrowLeft,
  BookOpenCheck,
  Rotate3D,
  ScrollText,
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
  Badge,
  Button,
  DemoBadge,
  GeneratedMarkdown,
  LockBadge,
  type DemoBadgeSource,
} from "../../client/ui/index.js";
import { LOCKED_THEME_PREVIEWS, OBSERVATION_THEME } from "../../theme/observation.js";
import doudouObserver from "../../client/assets/doudou/doudou-observer.png";
import previewOne from "../../client/assets/theme-previews/theme-preview-1.png";
import previewTwo from "../../client/assets/theme-previews/theme-preview-2.png";
import previewThree from "../../client/assets/theme-previews/theme-preview-3.png";
import "./LongCard.css";

const FLIP_THRESHOLD_PX = 64;
const INTENT_THRESHOLD_PX = 10;
const HORIZONTAL_INTENT_RATIO = 1.2;
const MAX_DRAG_ROTATION_DEG = 112;

export type LongCardFace = "narrative" | "evidence";

export interface LongCardRuntimeInput {
  analysis: AnalysisResult;
  exampleLabel?: string;
  experienceSource?: DemoBadgeSource;
  isExample: boolean;
  narrative?: ThemeModelOutput;
  aiText?: string;
  aiThemeText?: string;
  snapshot: PortfolioSnapshot;
}

export interface LongCardProps {
  input: LongCardRuntimeInput;
  reducedMotion?: boolean;
}

export interface FaceScrollOffsets {
  evidence: number | null;
  narrative: number | null;
}

interface PointerStart {
  id?: number;
  x: number;
  y: number;
}

interface PendingScrollRestore {
  face: LongCardFace;
  offset: number;
}

type GestureIntent = "horizontal" | "vertical" | null;

const PREVIEW_ASSETS = [previewOne, previewTwo, previewThree] as const;

export function longCardRuntimeFromFixture(fixture: AnalysisFixture): LongCardRuntimeInput {
  const { analysis } = fixture;
  const narrative: ThemeModelOutput | undefined = analysis.status === "unavailable"
    ? undefined
    : {
        schema_version: THEME_NARRATIVE_SCHEMA_VERSION,
        rational_analysis_id: analysis.analysis_id,
        theme_id: analysis.theme_id,
        headline: "今日观象",
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
  if (
    !validatePortfolioSnapshot(snapshot).ok ||
    !validateOwnedAnalysisResult(analysis).ok ||
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

function ExampleBadge({ input }: { input: LongCardRuntimeInput }) {
  if (!input.isExample) return null;
  if (input.experienceSource) return <DemoBadge source={input.experienceSource} />;
  if (input.exampleLabel && input.exampleLabel !== "示例数据") {
    return <Badge tone="demo">{input.exampleLabel}</Badge>;
  }
  return <DemoBadge />;
}

/** Returns the target face only for an unambiguously horizontal swipe. */
export function longCardFlipTarget(start: PointerStart, end: PointerStart): boolean | null {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;

  if (Math.abs(deltaX) < FLIP_THRESHOLD_PX || Math.abs(deltaX) <= Math.abs(deltaY)) {
    return null;
  }

  return deltaX < 0;
}

export function longCardGestureIntent(
  start: PointerStart,
  end: PointerStart,
): GestureIntent {
  const deltaX = Math.abs(end.x - start.x);
  const deltaY = Math.abs(end.y - start.y);
  if (Math.max(deltaX, deltaY) < INTENT_THRESHOLD_PX) return null;
  return deltaX > deltaY * HORIZONTAL_INTENT_RATIO ? "horizontal" : "vertical";
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
    [targetFace]: offsets[targetFace] ?? currentOffset,
  };
}

export function longCardDragRotation(
  face: LongCardFace,
  deltaX: number,
  stageWidth: number,
): number {
  const baseRotation = face === "evidence" ? -180 : 0;
  const width = Math.max(stageWidth, 1);
  const dragRotation = Math.max(
    -MAX_DRAG_ROTATION_DEG,
    Math.min(MAX_DRAG_ROTATION_DEG, (deltaX / width) * 180),
  );
  return baseRotation + dragRotation;
}

function formatConstraint(value: string): string {
  return value === "unknown" || value === "not_decided" ? "未知／尚未决定" : value;
}

function formatEvidenceValue(value: EvidenceRecord["value"]): string {
  if (value === null) return "未知（原始值为空）";
  if (value === undefined) return "未提供";
  return String(value);
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

function Doudou() {
  return (
    <figure className="mandong-doudou">
      <img alt="" height="192" src={doudouObserver} width="192" />
      <figcaption>
        <strong>{OBSERVATION_THEME.mascot.name}</strong>
        <span>陪你观察，也承认未知</span>
      </figcaption>
    </figure>
  );
}

function CoverageSummary({ input }: { input: LongCardRuntimeInput }) {
  const { coverage } = input.analysis;
  const pending = coverage.uncovered_line_ids.length + coverage.unsupported_line_ids.length;
  return (
    <dl className="mandong-long-card__coverage" aria-label="本次分析覆盖">
      <div>
        <dt>确认持仓</dt>
        <dd>{input.snapshot.lines.length} 项</dd>
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

function FrontBoundarySummary({ input }: { input: LongCardRuntimeInput }) {
  const { analysis, snapshot } = input;
  const pending = analysis.coverage.uncovered_line_ids.length +
    analysis.coverage.unsupported_line_ids.length;
  return (
    <dl className="mandong-long-card__coverage mandong-long-card__coverage--front" aria-label="本次分析边界">
      <div>
        <dt>组合快照</dt>
        <dd>{snapshot.snapshot_id}</dd>
      </div>
      <div>
        <dt>分析覆盖</dt>
        <dd>{analysis.coverage.covered_line_ids.length} / {snapshot.lines.length} 项</dd>
      </div>
      <div>
        <dt>待核对</dt>
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
  return (
    <article
      aria-hidden={!active}
      aria-labelledby={headingId}
      className="mandong-long-card__face mandong-long-card__front"
      data-active={active || undefined}
      id={faceId}
      inert={!active}
    >
      <header className="mandong-long-card__intro">
        <div className="mandong-long-card__date-row">
          <p>
            复盘完成 <time dateTime={analysis.analysis_completed_at}>{analysis.analysis_completed_at}</time>
          </p>
          <ExampleBadge input={input} />
        </div>
        <div className="mandong-long-card__masthead">
          <div>
            <p className="mandong-long-card__theme">{OBSERVATION_THEME.label}</p>
            <h2 id={headingId} ref={headingRef} tabIndex={-1}>{narrative.headline}</h2>
            <p>最新完整交易日 <time dateTime={analysis.latest_complete_trading_day}>{analysis.latest_complete_trading_day}</time></p>
          </div>
          <Doudou />
        </div>
        <AnalysisStatus status={analysis.status} />
        <FrontBoundarySummary input={input} />
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
  return (
    <article
      aria-hidden={!active}
      aria-labelledby={headingId}
      className="mandong-long-card__face mandong-long-card__front"
      data-active={active || undefined}
      id={faceId}
      inert={!active}
    >
      <header className="mandong-long-card__intro">
        <div className="mandong-long-card__date-row">
          <p>
            复盘完成 <time dateTime={analysis.analysis_completed_at}>{analysis.analysis_completed_at}</time>
          </p>
          <ExampleBadge input={input} />
        </div>
        <div className="mandong-long-card__masthead">
          <div>
            <p className="mandong-long-card__theme">{OBSERVATION_THEME.label}</p>
            <h2 id={headingId} ref={headingRef} tabIndex={-1}>今日观象</h2>
            <p>最新完整交易日 <time dateTime={analysis.latest_complete_trading_day}>{analysis.latest_complete_trading_day}</time></p>
          </div>
        </div>
        <AnalysisStatus status={analysis.status} />
        <div className="mandong-long-card__guide" data-mascot-mood="calm">
          <Doudou />
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

function Constraints({ constraints }: { constraints: PersonalConstraints }) {
  return (
    <dl className="mandong-long-card__constraints">
      <div><dt>投资期限</dt><dd>{formatConstraint(constraints.investment_horizon)}</dd></div>
      <div><dt>近期流动性需求</dt><dd>{formatConstraint(constraints.near_term_liquidity)}</dd></div>
      <div><dt>可承受回撤</dt><dd>{formatConstraint(constraints.tolerable_drawdown)}</dd></div>
      <div><dt>投资目标</dt><dd>{formatConstraint(constraints.investment_objective)}</dd></div>
    </dl>
  );
}

export function RationalEvidenceBack({ active, faceId, headingId, headingRef, input }: FaceProps) {
  const { analysis, snapshot } = input;
  // Relaxed Demo mode: the back face is the formal rational analysis report
  // (the model's report text plus the inputs it was given). The placeholder
  // conclusion/advice shells and derivation bookkeeping stay hidden.
  const relaxed = Boolean(input.aiText && !input.narrative);
  return (
    <article
      aria-hidden={!active}
      aria-labelledby={headingId}
      className="mandong-long-card__face mandong-long-card__back"
      data-active={active || undefined}
      id={faceId}
      inert={!active}
    >
      <header className="mandong-long-card__intro">
        <div className="mandong-long-card__date-row">
          <p>{relaxed ? "理性分析背面" : "理性证据背面"}</p>
          <ExampleBadge input={input} />
        </div>
        <div className="mandong-long-card__masthead mandong-long-card__masthead--evidence">
          <div>
            <h2 id={headingId} ref={headingRef} tabIndex={-1}>{relaxed ? "今日理性分析报告" : "逐项核对这份分析"}</h2>
          </div>
          <BookOpenCheck aria-hidden="true" size={40} strokeWidth={1.5} />
        </div>
        <AnalysisStatus status={analysis.status} />
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

      <section className="mandong-long-card__section" aria-labelledby={`${headingId}-inputs`}>
        <h3 id={`${headingId}-inputs`}>{relaxed ? "本次分析用到的持仓" : "确认输入与覆盖"}</h3>
        <CoverageSummary input={input} />
        <ul className="mandong-long-card__evidence-list">
          {snapshot.lines.map((line) => {
            const covered = analysis.coverage.covered_line_ids.includes(line.line_id);
            const unsupported = analysis.coverage.unsupported_line_ids.includes(line.line_id);
            return (
              <li key={line.line_id}>
                <div><strong>{line.name}</strong><span>{line.asset_class.toUpperCase()} · {line.symbol}</span></div>
                <dl>
                  <div><dt>规模依据</dt><dd>{line.size_basis}</dd></div>
                  <div><dt>观察日期</dt><dd>{formatConstraint(line.observation_date)}</dd></div>
                  <div><dt>覆盖</dt><dd>{covered ? "已覆盖" : unsupported ? "不支持" : "未覆盖"}</dd></div>
                </dl>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mandong-long-card__section" aria-labelledby={`${headingId}-constraints`}>
        <h3 id={`${headingId}-constraints`}>四项个人约束</h3>
        <Constraints constraints={analysis.constraints} />
      </section>

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

      <section className="mandong-long-card__section" aria-labelledby={`${headingId}-evidence`}>
        <h3 id={`${headingId}-evidence`}>{relaxed ? "本次分析用到的行情证据" : "观察证据与核验状态"}</h3>
        <ul className="mandong-long-card__evidence-list">
          {analysis.evidence.map((evidence) => (
            <li key={evidence.id}>
              <div>
                <strong>{evidence.metric_or_event_type}</strong>
                <span>{provenanceLabel(evidence.provenance)} · {evidenceStatusLabel(evidence.status)}</span>
              </div>
              <dl>
                <div><dt>证据 ID</dt><dd>{evidence.id}</dd></div>
                <div><dt>证据值</dt><dd>{formatEvidenceValue(evidence.value)}</dd></div>
                <div><dt>单位</dt><dd>{evidence.unit ?? "未提供"}</dd></div>
                <div><dt>来源</dt><dd>{evidence.source.name}</dd></div>
                <div><dt>定位</dt><dd>{evidence.source.locator}</dd></div>
                <div><dt>观察／发布时间</dt><dd>{evidence.observation_or_event_time}</dd></div>
                <div><dt>获取时间</dt><dd>{evidence.fetched_at}</dd></div>
                {evidence.normalization_note ? <div><dt>规范化说明</dt><dd>{evidence.normalization_note}</dd></div> : null}
              </dl>
              {evidence.conflict_with?.length ? <p>冲突证据 {evidence.conflict_with.join("、")}</p> : null}
              {evidence.limitations.length > 0 ? (
                <ul className="mandong-long-card__plain-list">
                  {evidence.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      {!relaxed ? (
        <section className="mandong-long-card__section" aria-labelledby={`${headingId}-derived`}>
          <h3 id={`${headingId}-derived`}>可复算派生关系</h3>
        {analysis.derived.length > 0 ? (
          <ul className="mandong-long-card__evidence-list">
            {analysis.derived.map((derived) => (
              <li key={derived.id}>
                <div>
                  <strong>{derived.label}：{derived.value === null ? "未知（原始值为空）" : String(derived.value)}{derived.unit ? ` ${derived.unit}` : ""}</strong>
                  <span>{provenanceLabel(derived.provenance)}</span>
                </div>
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
      <ExampleBadge input={input} />
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

function IncompleteLongCard({ input }: { input: LongCardRuntimeInput }) {
  return (
    <section
      className="mandong-long-card mandong-long-card--unavailable"
      aria-labelledby="analysis-incomplete-heading"
      role="status"
    >
      <ExampleBadge input={input} />
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

export function LongCard({ input, reducedMotion = false }: LongCardProps) {
  const [face, setFace] = useState<LongCardFace>("narrative");
  const [gestureIntent, setGestureIntent] = useState<GestureIntent>(null);
  const [dragDeltaX, setDragDeltaX] = useState(0);
  const [transitioning, setTransitioning] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const stageWidthRef = useRef(375);
  const pointerStartRef = useRef<PointerStart | null>(null);
  const gestureIntentRef = useRef<GestureIntent>(null);
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
    return <IncompleteLongCard input={input} />;
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
    setTransitioning(true);
    setFace(targetFace);
  }

  function handlePointerDown(event: PointerEvent<HTMLElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (pointerStartRef.current !== null) return;
    pointerStartRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
    stageWidthRef.current = Math.max(event.currentTarget.getBoundingClientRect().width, 1);
    gestureIntentRef.current = null;
    setGestureIntent(null);
    setDragDeltaX(0);
  }

  function handlePointerMove(event: PointerEvent<HTMLElement>) {
    const pointerStart = pointerStartRef.current;
    if (pointerStart === null || pointerStart.id !== event.pointerId) return;
    const nextIntent = gestureIntentRef.current ?? longCardGestureIntent(pointerStart, { x: event.clientX, y: event.clientY });
    if (nextIntent !== gestureIntentRef.current) {
      gestureIntentRef.current = nextIntent;
      setGestureIntent(nextIntent);
    }
    if (nextIntent !== "horizontal") return;
    event.preventDefault();
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    setDragDeltaX(event.clientX - pointerStart.x);
  }

  function handlePointerUp(event: PointerEvent<HTMLElement>) {
    const pointerStart = pointerStartRef.current;
    if (pointerStart === null || pointerStart.id !== event.pointerId) return;
    const target = longCardFlipTarget(pointerStart, { x: event.clientX, y: event.clientY });
    const wasHorizontal = gestureIntentRef.current === "horizontal";
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    pointerStartRef.current = null;
    gestureIntentRef.current = null;
    setGestureIntent(null);
    setDragDeltaX(0);
    if (wasHorizontal) setTransitioning(true);
    if (wasHorizontal && target !== null) {
      switchFace(target ? "evidence" : "narrative");
    }
  }

  function cancelPointer(event: PointerEvent<HTMLElement>) {
    if (pointerStartRef.current?.id !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    pointerStartRef.current = null;
    gestureIntentRef.current = null;
    setGestureIntent(null);
    setDragDeltaX(0);
    setTransitioning(true);
  }

  const showEvidence = face === "evidence";
  // Relaxed Demo mode: the back is the formal rational report, the front is the
  // theme rendition of the same report.
  const relaxedMode = Boolean(aiText && !narrative);
  const faceLabel = showEvidence ? (relaxedMode ? "理性分析" : "理性证据") : "东方观象";
  const rotation = reducedMotion
    ? face === "evidence" ? -180 : 0
    : longCardDragRotation(face, dragDeltaX, stageWidthRef.current);
  const motionStyle = { transform: `rotateY(${rotation}deg)` } as CSSProperties;
  return (
    <section
      className={`mandong-long-card mandong-long-card--${analysis.status}`}
      data-reduced-motion={reducedMotion || undefined}
      aria-label="每日复盘报告"
    >
      <div className="mandong-long-card__toolbar">
        <span aria-live="polite" className="mandong-long-card__face-state">当前：{faceLabel}</span>
        <Button
          aria-controls={`${narrativeFaceId} ${evidenceFaceId}`}
          aria-pressed={showEvidence}
          onClick={() => switchFace(showEvidence ? "narrative" : "evidence")}
          variant="secondary"
        >
          {showEvidence ? <ArrowLeft aria-hidden="true" size={18} /> : <ScrollText aria-hidden="true" size={18} />}
          <span>{showEvidence ? "返回观象" : relaxedMode ? "查看理性分析" : "查看证据"}</span>
        </Button>
      </div>
      <div
        className="mandong-long-card__stage"
        data-dragging={gestureIntent === "horizontal" || undefined}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={cancelPointer}
        ref={stageRef}
      >
        <div
          className="mandong-long-card__motion"
          data-transitioning={transitioning || undefined}
          onTransitionEnd={(event) => {
            if (event.propertyName === "transform" || event.propertyName === "opacity") {
              setTransitioning(false);
            }
          }}
          style={motionStyle}
        >
          {narrative ? (
            <NarrativeFront
              active={!showEvidence}
              faceId={narrativeFaceId}
              headingId={narrativeHeadingId}
              headingRef={narrativeHeadingRef}
              input={input}
              narrative={narrative}
            />
          ) : (
            <AiNarrativeFront
              active={!showEvidence}
              aiText={aiThemeText ?? aiText ?? ""}
              faceId={narrativeFaceId}
              headingId={narrativeHeadingId}
              headingRef={narrativeHeadingRef}
              input={input}
            />
          )}
          <RationalEvidenceBack
            active={showEvidence}
            faceId={evidenceFaceId}
            headingId={evidenceHeadingId}
            headingRef={evidenceHeadingRef}
            input={input}
          />
        </div>
      </div>
      <p className="mandong-long-card__gesture-hint"><Rotate3D aria-hidden="true" size={16} />横向拖动也可翻面，纵向滚动始终用于阅读。</p>
    </section>
  );
}

export function ThemePreview() {
  return (
    <section className="mandong-theme-preview" aria-labelledby="theme-preview-heading">
      <div className="mandong-theme-preview__heading">
        <div>
          <p>复盘主题</p>
          <h2 id="theme-preview-heading">{OBSERVATION_THEME.label}</h2>
        </div>
        <p>主题只改变表达，不改变证据、风险与建议。</p>
      </div>
      <div className="mandong-theme-preview__options" aria-label="主题展示">
        <div className="mandong-theme-preview__option mandong-theme-preview__option--current">
          <img alt={OBSERVATION_THEME.mascot.alt} height="128" src={doudouObserver} width="128" />
          <div><strong>{OBSERVATION_THEME.label}</strong><span>兜兜 · 当前主题</span></div>
        </div>
        {LOCKED_THEME_PREVIEWS.map((preview, index) => (
          <div className="mandong-theme-preview__option" key={preview.id}>
            <img alt={`${preview.label}的中性占位角色`} height="128" src={PREVIEW_ASSETS[index]} width="128" />
            <div><strong>{preview.label}</strong><span>{preview.description}</span></div>
            <LockBadge />
          </div>
        ))}
      </div>
    </section>
  );
}
