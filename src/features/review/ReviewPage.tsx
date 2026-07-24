import { useMemo, useState } from "react";
import type {
  AssetClass,
  PortfolioDraft,
  PortfolioSnapshot,
} from "../../contracts/index.js";
import { ConstraintsForm } from "../constraints/ConstraintsForm";
import {
  EXAMPLE_SOURCE_LABEL,
  addLine,
  createEmptyDraft,
  createExampleDraft,
  createManualLine,
  createSnapshotFromDraft,
  listUnresolvedLines,
  listUsableLines,
  removeLine,
  updateConstraints,
  updateLine,
} from "../../portfolio/index.js";

type SourceMode = "example" | "manual";

export function ReviewPage() {
  const [draft, setDraft] = useState<PortfolioDraft | null>(null);
  const [sourceMode, setSourceMode] = useState<SourceMode | null>(null);
  const [snapshot, setSnapshot] = useState<PortfolioSnapshot | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [manual, setManual] = useState({
    asset_class: "etf" as AssetClass,
    name: "",
    symbol: "",
    market: "",
    size_basis: "",
    observation_date: "",
  });

  const usable = useMemo(
    () => (draft ? listUsableLines(draft) : []),
    [draft],
  );
  const unresolved = useMemo(
    () => (draft ? listUnresolvedLines(draft) : []),
    [draft],
  );

  function startExample() {
    setSourceMode("example");
    setSnapshot(null);
    setMessage(null);
    setDraft(createExampleDraft());
  }

  function startManual() {
    setSourceMode("manual");
    setSnapshot(null);
    setMessage(null);
    setDraft(
      createEmptyDraft({
        source_label: "手工录入",
        entry_method: "manual",
      }),
    );
  }

  function confirmLines(lineIds?: string[]) {
    if (!draft) return;
    const result = createSnapshotFromDraft(draft, { line_ids: lineIds });
    if (!result.ok) {
      setMessage(result.message);
      return;
    }
    setSnapshot(result.snapshot);
    const skippedNote =
      result.skipped_line_ids.length > 0
        ? `；${result.skipped_line_ids.length} 条未决行未写入快照`
        : "";
    setMessage(
      `已创建不可变快照 ${result.snapshot.snapshot_id}（${result.snapshot.lines.length} 条确认行）${skippedNote}。`,
    );
  }

  if (!draft || !sourceMode) {
    return (
      <section className="panel" aria-labelledby="source-heading">
        <div className="panel-head">
          <h2 id="source-heading">选择持仓来源</h2>
          <p className="panel-note">示例与手工进入同一单页复核；截图导入由后续票据接入。</p>
        </div>
        <div className="action-row">
          <button type="button" className="btn primary" onClick={startExample}>
            使用示例组合
          </button>
          <button type="button" className="btn" onClick={startManual}>
            手工录入
          </button>
          <button type="button" className="btn" disabled title="后续票据实现">
            截图导入（未开放）
          </button>
        </div>
      </section>
    );
  }

  return (
    <div className="review-stack">
      {draft.source_label === EXAMPLE_SOURCE_LABEL || sourceMode === "example" ? (
        <p className="example-banner" role="status">
          当前为{EXAMPLE_SOURCE_LABEL}，不是真实私人持仓，也不是实时行情。
        </p>
      ) : null}

      <section className="panel" aria-labelledby="review-heading">
        <div className="panel-head">
          <h2 id="review-heading">单页持仓复核</h2>
          <p className="panel-note">
            可用 {usable.length} 条 · 未决 {unresolved.length} 条。批量确认不会写入未决行。
          </p>
        </div>

        {sourceMode === "manual" ? (
          <form
            className="manual-form"
            onSubmit={(event) => {
              event.preventDefault();
              const line = createManualLine({
                asset_class: manual.asset_class,
                name: manual.name,
                symbol: manual.symbol || "unknown",
                market: manual.market || undefined,
                size_basis: manual.size_basis || "unknown",
                observation_date: manual.observation_date || "unknown",
              });
              setDraft((current) => (current ? addLine(current, line) : current));
              setManual({
                asset_class: manual.asset_class,
                name: "",
                symbol: "",
                market: "",
                size_basis: "",
                observation_date: "",
              });
              setSnapshot(null);
            }}
          >
            <div className="manual-grid">
              <label className="field">
                <span className="field-label">资产类型</span>
                <select
                  value={manual.asset_class}
                  onChange={(event) =>
                    setManual((value) => ({
                      ...value,
                      asset_class: event.target.value as AssetClass,
                    }))
                  }
                >
                  <option value="fund">基金</option>
                  <option value="etf">ETF</option>
                  <option value="a_share">A 股</option>
                </select>
              </label>
              <label className="field">
                <span className="field-label">名称</span>
                <input
                  value={manual.name}
                  onChange={(event) =>
                    setManual((value) => ({ ...value, name: event.target.value }))
                  }
                  required
                />
              </label>
              <label className="field">
                <span className="field-label">代码</span>
                <input
                  value={manual.symbol}
                  onChange={(event) =>
                    setManual((value) => ({ ...value, symbol: event.target.value }))
                  }
                  placeholder="未知可留空"
                />
              </label>
              <label className="field">
                <span className="field-label">持仓规模依据</span>
                <input
                  value={manual.size_basis}
                  onChange={(event) =>
                    setManual((value) => ({
                      ...value,
                      size_basis: event.target.value,
                    }))
                  }
                  placeholder="未知可留空"
                />
              </label>
            </div>
            <button type="submit" className="btn primary">
              添加持仓行
            </button>
          </form>
        ) : null}

        <div className="line-list" role="list">
          {draft.lines.length === 0 ? (
            <p className="empty-state">还没有持仓行。请添加或切换示例组合。</p>
          ) : (
            draft.lines.map((line) => (
              <article
                key={line.line_id}
                className={line.is_usable ? "line-card" : "line-card unresolved"}
                role="listitem"
              >
                <div className="line-top">
                  <div>
                    <h3>{line.name}</h3>
                    <p className="line-meta">
                      {line.asset_class} · {String(line.symbol)} ·{" "}
                      {line.is_usable ? "可用" : "未决未知项"}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn danger"
                    onClick={() => {
                      setDraft((current) =>
                        current ? removeLine(current, line.line_id) : current,
                      );
                      setSnapshot(null);
                    }}
                  >
                    删除
                  </button>
                </div>
                <div className="manual-grid">
                  <label className="field">
                    <span className="field-label">代码</span>
                    <input
                      value={String(line.symbol)}
                      onChange={(event) => {
                        const symbol = event.target.value.trim() || "unknown";
                        setDraft((current) =>
                          current
                            ? updateLine(current, line.line_id, { symbol })
                            : current,
                        );
                        setSnapshot(null);
                      }}
                    />
                  </label>
                  <label className="field">
                    <span className="field-label">规模依据</span>
                    <input
                      value={String(line.size_basis)}
                      onChange={(event) => {
                        const size_basis = event.target.value.trim() || "unknown";
                        setDraft((current) =>
                          current
                            ? updateLine(current, line.line_id, { size_basis })
                            : current,
                        );
                        setSnapshot(null);
                      }}
                    />
                  </label>
                </div>
                {!line.is_usable ? (
                  <p className="unresolved-note">
                    未决字段：{line.unresolved_fields.join("、") || "身份或规模依据不明"}
                  </p>
                ) : (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => confirmLines([line.line_id])}
                  >
                    仅确认本行
                  </button>
                )}
              </article>
            ))
          )}
        </div>

        <div className="action-row">
          <button
            type="button"
            className="btn primary"
            disabled={usable.length === 0}
            onClick={() => confirmLines(usable.map((line) => line.line_id))}
          >
            批量确认可用行
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setDraft(null);
              setSourceMode(null);
              setSnapshot(null);
              setMessage(null);
            }}
          >
            重选来源
          </button>
        </div>
      </section>

      <ConstraintsForm
        value={draft.constraints}
        onChange={(constraints) => {
          setDraft((current) =>
            current ? updateConstraints(current, constraints) : current,
          );
          setSnapshot(null);
        }}
      />

      {message ? (
        <p className="status-message" role="status">
          {message}
        </p>
      ) : null}

      {snapshot ? (
        <section className="panel" aria-labelledby="snapshot-heading">
          <div className="panel-head">
            <h2 id="snapshot-heading">不可变组合快照</h2>
            <p className="panel-note">
              {snapshot.snapshot_id} · 创建于 {snapshot.created_at}
            </p>
          </div>
          <ul className="snapshot-list">
            {snapshot.lines.map((line) => (
              <li key={line.line_id}>
                {line.name}（{line.symbol}）· {line.size_basis}
              </li>
            ))}
          </ul>
          <p className="panel-note">
            约束：期限 {String(snapshot.constraints.investment_horizon)}；流动性{" "}
            {String(snapshot.constraints.near_term_liquidity)}；回撤{" "}
            {String(snapshot.constraints.tolerable_drawdown)}；目标{" "}
            {String(snapshot.constraints.investment_objective)}
          </p>
        </section>
      ) : null}
    </div>
  );
}
