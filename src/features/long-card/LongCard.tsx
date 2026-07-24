import { useState, type PointerEvent } from "react";
import type { AnalysisFixture } from "../../fixtures/scenarios.js";
import { LOCKED_THEME_PREVIEWS, OBSERVATION_THEME } from "../../theme/observation.js";

const FLIP_THRESHOLD_PX = 64;

interface PointerStart {
  x: number;
  y: number;
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

function statusLabel(status: AnalysisFixture["analysis"]["status"]): string {
  const labels = {
    supported: "证据支持",
    limited: "有限分析",
    observation_only: "仅观察",
    unavailable: "分析不可用",
  } as const;
  return labels[status];
}

function Doudou() {
  return (
    <div className="doudou" aria-label="兜兜，满懂的观察向导" role="img">
      <span className="doudou-ear doudou-ear-left" aria-hidden="true" />
      <span className="doudou-ear doudou-ear-right" aria-hidden="true" />
      <span className="doudou-face" aria-hidden="true">
        <span className="doudou-eye doudou-eye-left" />
        <span className="doudou-eye doudou-eye-right" />
        <span className="doudou-nose" />
      </span>
      <span className="doudou-coat" aria-hidden="true" />
    </div>
  );
}

function CoverageSummary({ fixture }: { fixture: AnalysisFixture }) {
  const { coverage } = fixture.analysis;
  return (
    <dl className="long-card-coverage">
      <div>
        <dt>确认持仓</dt>
        <dd>{fixture.snapshot.lines.length} 项</dd>
      </div>
      <div>
        <dt>已覆盖</dt>
        <dd>{coverage.covered_line_ids.length} 项</dd>
      </div>
      <div>
        <dt>待确认</dt>
        <dd>{coverage.uncovered_line_ids.length + coverage.unsupported_line_ids.length} 项</dd>
      </div>
    </dl>
  );
}

function Front({ fixture }: { fixture: AnalysisFixture }) {
  const { analysis, snapshot } = fixture;
  return (
    <div className="long-card-face long-card-front">
      <header className="long-card-masthead">
        <div>
          <p className="long-card-kicker">{OBSERVATION_THEME.label}</p>
          <h2>观象长笺</h2>
          <p className="long-card-date">截至 {analysis.latest_complete_trading_day} 的完整交易日</p>
        </div>
        <Doudou />
      </header>

      <CoverageSummary fixture={fixture} />

      <section className="long-card-section" aria-labelledby="main-observation">
        <p className="long-card-section-label">主要观察</p>
        <h3 id="main-observation">{analysis.conclusions[0]?.statement ?? "当前没有可展示的物质性结论。"}</h3>
        <p>{OBSERVATION_THEME.narration}</p>
      </section>

      <section className="long-card-section" aria-labelledby="directions">
        <p className="long-card-section-label">关注方向</p>
        <h3 id="directions">{analysis.advice[0]?.statement ?? "继续核对可用证据与未知项。"}</h3>
      </section>

      <section className="long-card-section long-card-unknowns" aria-labelledby="unknowns">
        <p className="long-card-section-label">未知与限制</p>
        <h3 id="unknowns">{analysis.unknowns.length > 0 ? "这些缺口限制了结论范围" : "当前范围内未记录额外未知项"}</h3>
        <ul>
          {(analysis.unknowns.length > 0 ? analysis.unknowns : analysis.limitations.map((impact, index) => ({ id: `${index}`, impact }))).map((item) => (
            <li key={item.id}>{item.impact}</li>
          ))}
        </ul>
      </section>

      <footer className="long-card-footer">
        <span>快照 {snapshot.snapshot_id}</span>
        <span>证据截止 {analysis.evidence_cutoff_at}</span>
      </footer>
    </div>
  );
}

function Back({ fixture }: { fixture: AnalysisFixture }) {
  const { analysis, snapshot } = fixture;
  return (
    <div className="long-card-face long-card-back">
      <header className="long-card-masthead evidence-masthead">
        <div>
          <p className="long-card-kicker">理性证据</p>
          <h2>同一份分析，逐项核对</h2>
        </div>
        <p className="evidence-version">{analysis.contracts_version}</p>
      </header>

      <section className="evidence-section" aria-labelledby="evidence-inputs">
        <h3 id="evidence-inputs">确认输入</h3>
        <ul className="evidence-list">
          {snapshot.lines.map((line) => (
            <li key={line.line_id}>
              <strong>{line.name}</strong>
              <span>{line.symbol} · {line.observation_date}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="evidence-section" aria-labelledby="evidence-observations">
        <h3 id="evidence-observations">观察证据</h3>
        <ul className="evidence-list">
          {analysis.evidence.map((evidence) => (
            <li key={evidence.id}>
              <strong>{evidence.metric_or_event_type} · {evidence.status}</strong>
              <span>{evidence.source.name} · 观察 {evidence.observation_or_event_time} · 获取 {evidence.fetched_at}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="evidence-section" aria-labelledby="evidence-references">
        <h3 id="evidence-references">结论依据</h3>
        <ul className="evidence-list">
          {analysis.conclusions.map((conclusion) => (
            <li key={conclusion.id}>
              <strong>{conclusion.statement}</strong>
              <span>{conclusion.refs.map((ref) => `${ref.kind}:${ref.ref_id}`).join(" · ")}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="evidence-section" aria-labelledby="evidence-constraints">
        <h3 id="evidence-constraints">个人约束</h3>
        <dl className="constraints-list">
          <div><dt>期限</dt><dd>{analysis.constraints.investment_horizon}</dd></div>
          <div><dt>流动性</dt><dd>{analysis.constraints.near_term_liquidity}</dd></div>
          <div><dt>回撤</dt><dd>{analysis.constraints.tolerable_drawdown}</dd></div>
          <div><dt>目标</dt><dd>{analysis.constraints.investment_objective}</dd></div>
        </dl>
      </section>

      <footer className="long-card-risk">
        {analysis.risk_notes.map((note) => <p key={note.id}>{note.statement}</p>)}
      </footer>
    </div>
  );
}

function Unavailable({ fixture }: { fixture: AnalysisFixture }) {
  const { analysis } = fixture;
  return (
    <section className="analysis-unavailable" aria-labelledby="analysis-unavailable-heading">
      <p className="long-card-kicker">分析不可用</p>
      <h2 id="analysis-unavailable-heading">当前证据不足以生成观象长笺</h2>
      <p>{analysis.limitations.join(" ")}</p>
      <ul>
        {analysis.recovery_actions?.map((action) => <li key={action}>{action}</li>)}
      </ul>
    </section>
  );
}

export function LongCard({ fixture }: { fixture: AnalysisFixture }) {
  const [showEvidence, setShowEvidence] = useState(false);
  const [pointerStart, setPointerStart] = useState<PointerStart | null>(null);
  const { analysis } = fixture;

  if (analysis.status === "unavailable") {
    return <Unavailable fixture={fixture} />;
  }

  function handlePointerDown(event: PointerEvent<HTMLElement>) {
    setPointerStart({ x: event.clientX, y: event.clientY });
  }

  function handlePointerUp(event: PointerEvent<HTMLElement>) {
    if (pointerStart === null) return;
    const target = longCardFlipTarget(pointerStart, { x: event.clientX, y: event.clientY });
    setPointerStart(null);
    if (target !== null) {
      setShowEvidence(target);
    }
  }

  const faceLabel = showEvidence ? "理性证据" : "东方观象";
  return (
    <section className={`long-card long-card-status-${analysis.status}`} aria-label={`观象长笺，${statusLabel(analysis.status)}`}>
      <div className="long-card-toolbar">
        <span className="analysis-status">{statusLabel(analysis.status)}</span>
        <span aria-live="polite" className="face-state">当前：{faceLabel}</span>
      </div>
      <div
        className={`long-card-stage ${showEvidence ? "is-back" : "is-front"}`}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => setPointerStart(null)}
      >
        {showEvidence ? <Back fixture={fixture} /> : <Front fixture={fixture} />}
      </div>
      <div className="long-card-actions">
        <button className="btn primary" type="button" onClick={() => setShowEvidence((current) => !current)}>
          {showEvidence ? "返回观象" : "查看证据"}
        </button>
        <p>横向拖动可翻面；也可使用此按钮切换。</p>
      </div>
    </section>
  );
}

export function ThemePreview() {
  return (
    <section className="theme-preview" aria-labelledby="theme-preview-heading">
      <div>
        <p className="long-card-kicker">主题</p>
        <h2 id="theme-preview-heading">{OBSERVATION_THEME.label}</h2>
      </div>
      <div className="theme-options" aria-label="主题选择">
        <button className="theme-current" type="button" aria-pressed="true">{OBSERVATION_THEME.label}</button>
        {LOCKED_THEME_PREVIEWS.map((label) => (
          <span className="theme-locked" key={label}>{label} · 未开放</span>
        ))}
      </div>
    </section>
  );
}
