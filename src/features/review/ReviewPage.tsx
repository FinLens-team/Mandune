import { useMemo, useState, type CSSProperties } from "react";
import { Database, Dices, Plus, SlidersHorizontal, Trash2 } from "lucide-react";
import type {
  AssetClass,
  DraftLine,
  PortfolioDraft,
  PortfolioSnapshot,
  UnknownFieldState,
} from "../../contracts/index.js";
import { createExampleDraft, listUnresolvedLines, listUsableLines } from "../../portfolio/index.js";
import { Button, IconButton } from "../../client/ui/index.js";
import { ConstraintsForm } from "../constraints/ConstraintsForm.js";
import { InstrumentField } from "./InstrumentField.js";
import {
  appendHolding,
  appendRandomHoldings,
  deleteHolding,
  editConstraints,
  editHolding,
  snapshotCurrentDraft,
} from "./model.js";
import "./styles.css";

type EditorTab = "holdings" | "constraints";

export interface PortfolioEditorProps {
  draft: PortfolioDraft;
  onChange: (draft: PortfolioDraft) => void;
  onSave?: (snapshot: PortfolioSnapshot) => void;
  onCancel?: () => void;
}

const EMPTY_HOLDING = {
  asset_class: "etf" as AssetClass,
  name: "",
  symbol: "",
  market: "",
  size_basis: "",
  observation_date: "",
};

/** Contract field names are internal; the page speaks the form's language. */
const UNRESOLVED_FIELD_LABELS: Record<string, string> = {
  name: "名称",
  symbol: "代码",
  size_basis: "持仓规模依据",
  observation_date: "观察日期",
};

function unresolvedFieldLabels(fields: readonly string[]): string {
  return fields.map((field) => UNRESOLVED_FIELD_LABELS[field] ?? field).join("、");
}

/** Typed unknown states render as an empty input, never as literal "unknown". */
function unknownToBlank(value: string | UnknownFieldState): string {
  return value === "unknown" || value === "not_decided" ? "" : value;
}

interface HoldingLineFieldsProps {
  line: DraftLine;
  onPatch: (
    patch: Partial<Pick<DraftLine, "asset_class" | "name" | "symbol" | "size_basis" | "observation_date">>,
  ) => void;
}

/**
 * Inputs keep the raw text locally while the draft only ever stores
 * contract-valid values (blank → unknown, malformed dates → unknown).
 */
function HoldingLineFields({ line, onPatch }: HoldingLineFieldsProps) {
  const [fields, setFields] = useState(() => ({
    name: line.name,
    symbol: unknownToBlank(String(line.symbol)),
    size_basis: unknownToBlank(String(line.size_basis)),
    observation_date: unknownToBlank(String(line.observation_date)),
  }));

  function edit(field: "name" | "symbol" | "size_basis" | "observation_date", value: string) {
    setFields((current) => ({ ...current, [field]: value }));
    onPatch({ [field]: value });
  }

  const dateText = fields.observation_date.trim();
  const dateIncomplete = dateText.length > 0 && !/^\d{4}-\d{2}-\d{2}$/.test(dateText);

  return (
    <div className="portfolio-line__fields">
      <label className="field">
        <span className="field-label">资产类型</span>
        <select
          value={line.asset_class}
          onChange={(event) => onPatch({ asset_class: event.target.value as AssetClass })}
        >
          <option value="fund">基金</option>
          <option value="etf">ETF</option>
          <option value="a_share">A 股</option>
        </select>
      </label>
      <label className="field">
        <span className="field-label">名称</span>
        <input
          value={fields.name}
          onChange={(event) => edit("name", event.target.value)}
        />
      </label>
      <label className="field">
        <span className="field-label">代码</span>
        <input
          placeholder="未知可留空"
          value={fields.symbol}
          onChange={(event) => edit("symbol", event.target.value)}
        />
      </label>
      <label className="field">
        <span className="field-label">持仓规模依据</span>
        <input
          placeholder="未知可留空"
          value={fields.size_basis}
          onChange={(event) => edit("size_basis", event.target.value)}
        />
      </label>
      <label className="field">
        <span className="field-label">观察日期</span>
        <input
          inputMode="numeric"
          placeholder="YYYY-MM-DD，未知可留空"
          value={fields.observation_date}
          onChange={(event) => edit("observation_date", event.target.value)}
        />
        {dateIncomplete ? (
          <span className="field-hint">格式为 YYYY-MM-DD；输入完整前按未知处理。</span>
        ) : null}
      </label>
    </div>
  );
}

export function PortfolioEditor({ draft, onCancel, onChange, onSave }: PortfolioEditorProps) {
  const [activeTab, setActiveTab] = useState<EditorTab>("holdings");
  const [newHolding, setNewHolding] = useState(EMPTY_HOLDING);
  const [message, setMessage] = useState<string | null>(null);
  const usable = useMemo(() => listUsableLines(draft), [draft]);
  const unresolved = useMemo(() => listUnresolvedLines(draft), [draft]);

  function save() {
    const result = snapshotCurrentDraft(draft);
    if (!result.ok) {
      setMessage(result.message);
      return;
    }
    const skipped = result.skippedCount > 0 ? `；${result.skippedCount} 条未决行保持未知` : "";
    setMessage(`已保存下一次复盘输入${skipped}。历史复盘不会改写。`);
    onSave?.(result.snapshot);
  }

  function addRandomHoldings() {
    const next = appendRandomHoldings(draft);
    const added = next.lines.length - draft.lines.length;
    onChange(next);
    setMessage(`已生成 ${added} 条随机体验持仓草稿（标注为体验数据）；确认保存后才会进入快照。`);
  }

  return (
    <div className="portfolio-editor">
      <header className="portfolio-editor__header">
        <div>
          <p className="portfolio-editor__eyebrow">DATA MANAGEMENT</p>
          <h1>数据管理</h1>
          <p>管理下一次复盘使用的持仓与个人偏好，历史记录不会被改写。</p>
        </div>
        <div className="portfolio-editor__summary" aria-label="当前数据概览">
          <span><Database aria-hidden="true" size={18} />{usable.length} 项可用持仓</span>
          <span><SlidersHorizontal aria-hidden="true" size={18} />4 项个人偏好</span>
        </div>
      </header>

      <div className="portfolio-editor__tabs" role="tablist" aria-label="持仓数据与个人偏好">
        <button
          aria-controls="portfolio-holdings-panel"
          aria-selected={activeTab === "holdings"}
          className={activeTab === "holdings" ? "is-active" : undefined}
          id="portfolio-holdings-tab"
          onClick={() => setActiveTab("holdings")}
          role="tab"
          type="button"
        >
          持仓数据（{draft.lines.length}）
        </button>
        <button
          aria-controls="portfolio-constraints-panel"
          aria-selected={activeTab === "constraints"}
          className={activeTab === "constraints" ? "is-active" : undefined}
          id="portfolio-constraints-tab"
          onClick={() => setActiveTab("constraints")}
          role="tab"
          type="button"
        >
          个人偏好
        </button>
      </div>

      <div className="portfolio-editor__body">
        <section
          aria-labelledby="portfolio-holdings-tab"
          className={`portfolio-editor__holdings${activeTab === "holdings" ? " is-visible" : ""}`}
          id="portfolio-holdings-panel"
          role="tabpanel"
        >
          <div className="portfolio-editor__section-heading">
            <div>
              <h2>持仓数据</h2>
              <p>可用 {usable.length} 条，未决 {unresolved.length} 条。未决行不会进入快照。</p>
            </div>
            <Button onClick={addRandomHoldings} variant="secondary">
              <Dices aria-hidden="true" size={20} />
              新增随机数据
            </Button>
          </div>

          <div className="portfolio-lines" role="list">
            {draft.lines.map((line, index) => (
              <article
                className={`portfolio-line${line.is_usable ? "" : " portfolio-line--unresolved"}`}
                key={line.line_id}
                role="listitem"
                style={{ "--line-index": index } as CSSProperties}
              >
                <div className="portfolio-line__heading">
                  <div>
                    <strong>{line.name}</strong>
                    <span>{line.is_usable ? "可用于下次复盘" : "未决未知项"}</span>
                  </div>
                  <IconButton
                    icon={Trash2}
                    label={`删除 ${line.name}`}
                    onClick={() => onChange(deleteHolding(draft, line.line_id))}
                    tooltip="删除持仓"
                  />
                </div>
                <HoldingLineFields
                  line={line}
                  onPatch={(patch) => onChange(editHolding(draft, line.line_id, patch))}
                />
                {!line.is_usable ? (
                  <p className="portfolio-line__unknown">
                    待补充：{unresolvedFieldLabels(line.unresolved_fields) || "资产身份或规模依据"}
                  </p>
                ) : null}
              </article>
            ))}
          </div>

          <form
            className="portfolio-add"
            onSubmit={(event) => {
              event.preventDefault();
              onChange(appendHolding(draft, newHolding));
              setNewHolding(EMPTY_HOLDING);
            }}
          >
            <h3>添加一项持仓</h3>
            <div className="portfolio-line__fields">
              <label className="field">
                <span className="field-label">资产类型</span>
                <select
                  value={newHolding.asset_class}
                  onChange={(event) =>
                    setNewHolding((current) => ({
                      ...current,
                      asset_class: event.target.value as AssetClass,
                    }))
                  }
                >
                  <option value="fund">基金</option>
                  <option value="etf">ETF</option>
                  <option value="a_share">A 股</option>
                </select>
              </label>
              <InstrumentField
                id="portfolio-add-name"
                label="名称"
                placeholder="输入名称／代码／拼音首字母可搜索"
                required
                value={newHolding.name}
                onInput={(text) =>
                  setNewHolding((current) => ({ ...current, name: text }))
                }
                onSelect={(suggestion) =>
                  setNewHolding((current) => ({
                    ...current,
                    asset_class: suggestion.asset_class,
                    name: suggestion.name,
                    symbol: suggestion.symbol,
                    market: suggestion.market ?? "",
                  }))
                }
              />
              <label className="field">
                <span className="field-label">代码</span>
                <input
                  placeholder="未知可留空；选中搜索建议会自动回填"
                  value={newHolding.symbol}
                  onChange={(event) =>
                    setNewHolding((current) => ({ ...current, symbol: event.target.value }))
                  }
                />
              </label>
              <label className="field">
                <span className="field-label">持仓规模依据</span>
                <input
                  placeholder="未知可留空"
                  value={newHolding.size_basis}
                  onChange={(event) =>
                    setNewHolding((current) => ({ ...current, size_basis: event.target.value }))
                  }
                />
              </label>
              <label className="field">
                <span className="field-label">观察日期</span>
                <input
                  inputMode="numeric"
                  placeholder="YYYY-MM-DD，未知可留空"
                  value={newHolding.observation_date}
                  onChange={(event) =>
                    setNewHolding((current) => ({
                      ...current,
                      observation_date: event.target.value,
                    }))
                  }
                />
                {newHolding.observation_date.trim().length > 0 &&
                !/^\d{4}-\d{2}-\d{2}$/.test(newHolding.observation_date.trim()) ? (
                  <span className="field-hint">格式为 YYYY-MM-DD；输入完整前按未知处理。</span>
                ) : null}
              </label>
            </div>
            <Button type="submit">
              <Plus aria-hidden="true" size={20} />
              添加持仓
            </Button>
          </form>
        </section>

        <div
          aria-labelledby="portfolio-constraints-tab"
          className={`portfolio-editor__constraints${activeTab === "constraints" ? " is-visible" : ""}`}
          id="portfolio-constraints-panel"
          role="tabpanel"
        >
          <ConstraintsForm
            compact
            value={draft.constraints}
            onChange={(constraints) => onChange(editConstraints(draft, constraints))}
          />
        </div>
      </div>

      {message ? (
        <p className="portfolio-editor__message" role="status">
          {message}
        </p>
      ) : null}

      <footer className="portfolio-editor__actions">
        {onCancel ? (
          <Button onClick={onCancel} variant="secondary">
            取消
          </Button>
        ) : null}
        <Button disabled={usable.length === 0} onClick={save} variant="primary">
          保存后续复盘输入
        </Button>
      </footer>
    </div>
  );
}

/** Standalone compatibility entry used by the scaffold before shell integration. */
export function ReviewPage() {
  const [draft, setDraft] = useState(() => createExampleDraft());
  return <PortfolioEditor draft={draft} onChange={setDraft} />;
}
