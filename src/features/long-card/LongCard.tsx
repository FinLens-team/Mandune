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
  ShieldAlert,
} from "lucide-react";
import type {
  EvidenceRecord,
  MaterialReference,
  PersonalConstraints,
  ProvenanceKind,
} from "../../contracts/index.js";
import type { AnalysisFixture } from "../../fixtures/scenarios.js";
import {
  AnalysisStatus,
  Button,
  DemoBadge,
  LockBadge,
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
const MAX_DRAG_OFFSET_PX = 52;

export type LongCardFace = "narrative" | "evidence";

export interface LongCardProps {
  fixture: AnalysisFixture;
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

function formatConstraint(value: string): string {
  return value === "unknown" ? "未知／尚未决定" : value;
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
      <img alt={OBSERVATION_THEME.mascot.alt} height="192" src={doudouObserver} width="192" />
      <figcaption>
        <strong>{OBSERVATION_THEME.mascot.name}</strong>
        <span>陪你观察，也承认未知</span>
      </figcaption>
    </figure>
  );
}

function CoverageSummary({ fixture }: { fixture: AnalysisFixture }) {
  const { coverage } = fixture.analysis;
  const pending = coverage.uncovered_line_ids.length + coverage.unsupported_line_ids.length;
  return (
    <dl className="mandong-long-card__coverage" aria-label="本次分析覆盖">
      <div>
        <dt>确认持仓</dt>
        <dd>{fixture.snapshot.lines.length} 项</dd>
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
  faceId: string;
  fixture: AnalysisFixture;
  headingId: string;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}

export function NarrativeFront({ faceId, fixture, headingId, headingRef }: FaceProps) {
  const { analysis, snapshot } = fixture;
  return (
    <article className="mandong-long-card__face mandong-long-card__front" aria-labelledby={headingId} id={faceId}>
      <header className="mandong-long-card__intro">
        <div className="mandong-long-card__date-row">
          <p>
            复盘完成 <time dateTime={analysis.analysis_completed_at}>{analysis.analysis_completed_at}</time>
          </p>
          <DemoBadge />
        </div>
        <div className="mandong-long-card__masthead">
          <div>
            <p className="mandong-long-card__theme">{OBSERVATION_THEME.label}</p>
            <h2 id={headingId} ref={headingRef} tabIndex={-1}>观象长笺</h2>
            <p>最新完整交易日 <time dateTime={analysis.latest_complete_trading_day}>{analysis.latest_complete_trading_day}</time></p>
          </div>
        </div>
        <AnalysisStatus status={analysis.status} />
        <dl className="mandong-long-card__identity">
          <div><dt>组合快照</dt><dd>{snapshot.snapshot_id}</dd></div>
          <div><dt>分析版本</dt><dd>{analysis.analysis_id}</dd></div>
          <div><dt>证据截止</dt><dd>{analysis.evidence_cutoff_at}</dd></div>
        </dl>
        <CoverageSummary fixture={fixture} />
        <div className="mandong-long-card__guide"><Doudou /></div>
      </header>

      <section className="mandong-long-card__section" aria-labelledby={`${headingId}-observations`}>
        <h3 id={`${headingId}-observations`}>核心观察</h3>
        <p className="mandong-long-card__narration">{OBSERVATION_THEME.narration}</p>
        {analysis.conclusions.length > 0 ? (
          <ol className="mandong-long-card__statements">
            {analysis.conclusions.map((conclusion) => (
              <li key={conclusion.id}>
                <span className="mandong-long-card__provenance">{provenanceLabel(conclusion.provenance)}</span>
                <strong>{conclusion.statement}</strong>
                {conclusion.affected_by_unknowns ? <span>受未知项影响，结论范围已缩小。</span> : null}
              </li>
            ))}
          </ol>
        ) : <p>当前没有可展示的物质性结论。</p>}
      </section>

      <section className="mandong-long-card__section" aria-labelledby={`${headingId}-directions`}>
        <h3 id={`${headingId}-directions`}>方向性建议</h3>
        {analysis.advice.length > 0 ? (
          <ul className="mandong-long-card__statements">
            {analysis.advice.map((advice) => (
              <li key={advice.id}>
                <strong>{advice.statement}</strong>
                <span>{advice.urgency === "attention" ? "需要留意" : "常规关注"}，不形成精确交易指令。</span>
              </li>
            ))}
          </ul>
        ) : <p>当前证据只支持观察，不支持方向性建议。</p>}
      </section>

      <section className="mandong-long-card__risk" aria-labelledby={`${headingId}-risk`}>
        <ShieldAlert aria-hidden="true" size={22} />
        <div>
          <h3 id={`${headingId}-risk`}>风险与判断边界</h3>
          {analysis.risk_notes.map((note) => <p key={note.id}>{note.statement}</p>)}
        </div>
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
        <p>用户保留最终判断与操作权。满懂不连接券商，也不代客操作。</p>
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

export function RationalEvidenceBack({ faceId, fixture, headingId, headingRef }: FaceProps) {
  const { analysis, snapshot } = fixture;
  return (
    <article className="mandong-long-card__face mandong-long-card__back" aria-labelledby={headingId} id={faceId}>
      <header className="mandong-long-card__intro">
        <div className="mandong-long-card__date-row">
          <p>理性证据背面</p>
          <DemoBadge />
        </div>
        <div className="mandong-long-card__masthead mandong-long-card__masthead--evidence">
          <div>
            <p className="mandong-long-card__theme">与正面同一版本</p>
            <h2 id={headingId} ref={headingRef} tabIndex={-1}>逐项核对这份分析</h2>
          </div>
          <BookOpenCheck aria-hidden="true" size={40} strokeWidth={1.5} />
        </div>
        <AnalysisStatus status={analysis.status} />
        <dl className="mandong-long-card__identity">
          <div><dt>组合快照</dt><dd>{snapshot.snapshot_id}</dd></div>
          <div><dt>分析版本</dt><dd>{analysis.analysis_id}</dd></div>
          <div><dt>契约版本</dt><dd>{analysis.contracts_version}</dd></div>
          <div><dt>证据截止</dt><dd>{analysis.evidence_cutoff_at}</dd></div>
        </dl>
      </header>

      <section className="mandong-long-card__section" aria-labelledby={`${headingId}-inputs`}>
        <h3 id={`${headingId}-inputs`}>确认输入与覆盖</h3>
        <CoverageSummary fixture={fixture} />
        <ul className="mandong-long-card__evidence-list">
          {snapshot.lines.map((line) => {
            const covered = analysis.coverage.covered_line_ids.includes(line.line_id);
            const unsupported = analysis.coverage.unsupported_line_ids.includes(line.line_id);
            return (
              <li key={line.line_id}>
                <div><strong>{line.name}</strong><span>{line.asset_class.toUpperCase()} · {line.symbol}</span></div>
                <dl>
                  <div><dt>规模依据</dt><dd>{line.size_basis}</dd></div>
                  <div><dt>观察日期</dt><dd>{line.observation_date}</dd></div>
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

      <section className="mandong-long-card__section" aria-labelledby={`${headingId}-evidence`}>
        <h3 id={`${headingId}-evidence`}>观察证据与核验状态</h3>
        <ul className="mandong-long-card__evidence-list">
          {analysis.evidence.map((evidence) => (
            <li key={evidence.id}>
              <div>
                <strong>{evidence.metric_or_event_type}</strong>
                <span>{provenanceLabel(evidence.provenance)} · {evidenceStatusLabel(evidence.status)}</span>
              </div>
              <dl>
                <div><dt>证据 ID</dt><dd>{evidence.id}</dd></div>
                <div><dt>来源</dt><dd>{evidence.source.name}</dd></div>
                <div><dt>定位</dt><dd>{evidence.source.locator}</dd></div>
                <div><dt>观察／发布时间</dt><dd>{evidence.observation_or_event_time}</dd></div>
                <div><dt>获取时间</dt><dd>{evidence.fetched_at}</dd></div>
              </dl>
              {evidence.limitations.length > 0 ? (
                <ul className="mandong-long-card__plain-list">
                  {evidence.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="mandong-long-card__section" aria-labelledby={`${headingId}-derived`}>
        <h3 id={`${headingId}-derived`}>可复算派生关系</h3>
        {analysis.derived.length > 0 ? (
          <ul className="mandong-long-card__evidence-list">
            {analysis.derived.map((derived) => (
              <li key={derived.id}>
                <div><strong>{derived.label}：{derived.value}</strong><span>{provenanceLabel(derived.provenance)}</span></div>
                <p>{derived.formula_or_rule}</p>
                <p>输入 {derived.input_refs.join("、")}；证据 {derived.evidence_refs.join("、")}</p>
              </li>
            ))}
          </ul>
        ) : <p>当前结果未形成可复算派生项。</p>}
      </section>

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

      <footer className="mandong-long-card__risk mandong-long-card__risk--footer">
        <ShieldAlert aria-hidden="true" size={22} />
        <div>
          <h3>风险提示</h3>
          {analysis.risk_notes.map((note) => <p key={note.id}>{note.statement}</p>)}
        </div>
      </footer>
    </article>
  );
}

function Unavailable({ fixture }: { fixture: AnalysisFixture }) {
  const { analysis } = fixture;
  return (
    <section className="mandong-long-card mandong-long-card--unavailable" aria-labelledby="analysis-unavailable-heading">
      <DemoBadge />
      <AnalysisStatus status="unavailable" />
      <h2 id="analysis-unavailable-heading">当前证据不足以生成观象长笺</h2>
      <p>{analysis.limitations.join(" ")}</p>
      <h3>可以怎样恢复</h3>
      <ul className="mandong-long-card__plain-list">
        {analysis.recovery_actions?.map((action) => <li key={action}>{action}</li>)}
      </ul>
    </section>
  );
}

export function LongCard({ fixture, reducedMotion = false }: LongCardProps) {
  const [face, setFace] = useState<LongCardFace>("narrative");
  const [pointerStart, setPointerStart] = useState<PointerStart | null>(null);
  const [gestureIntent, setGestureIntent] = useState<GestureIntent>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [transitionDirection, setTransitionDirection] = useState<"forward" | "backward" | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const narrativeHeadingRef = useRef<HTMLHeadingElement>(null);
  const evidenceHeadingRef = useRef<HTMLHeadingElement>(null);
  const scrollOffsetsRef = useRef<FaceScrollOffsets>({ evidence: null, narrative: null });
  const pendingScrollRestoreRef = useRef<PendingScrollRestore | null>(null);
  const id = useId();
  const { analysis } = fixture;
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
    return <Unavailable fixture={fixture} />;
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
    setTransitionDirection(targetFace === "evidence" ? "forward" : "backward");
    setFace(targetFace);
  }

  function handlePointerDown(event: PointerEvent<HTMLElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    setPointerStart({ id: event.pointerId, x: event.clientX, y: event.clientY });
    setGestureIntent(null);
    setDragOffset(0);
  }

  function handlePointerMove(event: PointerEvent<HTMLElement>) {
    if (pointerStart === null || pointerStart.id !== event.pointerId) return;
    const nextIntent = gestureIntent ?? longCardGestureIntent(pointerStart, { x: event.clientX, y: event.clientY });
    if (nextIntent !== gestureIntent) setGestureIntent(nextIntent);
    if (nextIntent !== "horizontal") return;
    event.preventDefault();
    const delta = event.clientX - pointerStart.x;
    setDragOffset(Math.max(-MAX_DRAG_OFFSET_PX, Math.min(MAX_DRAG_OFFSET_PX, delta * 0.45)));
  }

  function handlePointerUp(event: PointerEvent<HTMLElement>) {
    if (pointerStart === null) return;
    const target = longCardFlipTarget(pointerStart, { x: event.clientX, y: event.clientY });
    setPointerStart(null);
    setGestureIntent(null);
    setDragOffset(0);
    if (target !== null) {
      switchFace(target ? "evidence" : "narrative");
    }
  }

  function cancelPointer() {
    setPointerStart(null);
    setGestureIntent(null);
    setDragOffset(0);
  }

  const showEvidence = face === "evidence";
  const faceLabel = showEvidence ? "理性证据" : "东方观象";
  const stageStyle = { "--long-card-drag-x": `${dragOffset}px` } as CSSProperties;
  return (
    <section
      className={`mandong-long-card mandong-long-card--${analysis.status}`}
      data-reduced-motion={reducedMotion || undefined}
      aria-label="观象长笺结果"
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
          <span>{showEvidence ? "返回观象" : "查看证据"}</span>
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
        style={stageStyle}
      >
        <div
          className="mandong-long-card__motion"
          data-transition={transitionDirection ?? undefined}
          onAnimationEnd={() => setTransitionDirection(null)}
        >
          {showEvidence ? (
            <RationalEvidenceBack faceId={evidenceFaceId} fixture={fixture} headingId={evidenceHeadingId} headingRef={evidenceHeadingRef} />
          ) : (
            <NarrativeFront faceId={narrativeFaceId} fixture={fixture} headingId={narrativeHeadingId} headingRef={narrativeHeadingRef} />
          )}
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
          <p>长笺主题</p>
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
