import { useMemo, useState, type KeyboardEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { AssetClass, PortfolioDraft, PortfolioSnapshot } from "../../contracts/index.js";
import { createExampleDraft, listUnresolvedLines, listUsableLines } from "../../portfolio/index.js";
import {
  Button,
  DemoBadge,
  IconButton,
  type DemoBadgeSource,
} from "../../client/ui/index.js";
import { ConstraintsForm } from "../constraints/ConstraintsForm.js";
import { InstrumentField } from "./InstrumentField.js";
import {
  appendHolding,
  deleteHolding,
  editConstraints,
  editHolding,
  snapshotCurrentDraft,
} from "./model.js";
import "./styles.css";

type EditorTab = "holdings" | "constraints";

export interface PortfolioEditorProps {
  draft: PortfolioDraft;
  experienceSource?: DemoBadgeSource;
  onChange: (draft: PortfolioDraft) => void;
  onExperienceSourceChange?: (source: DemoBadgeSource) => void;
  onSave?: (snapshot: PortfolioSnapshot) => void;
  onCancel?: () => void;
}

const EDITOR_TABS: readonly EditorTab[] = ["holdings", "constraints"];

function formatDraftValue(value: string | undefined): string {
  return !value || value === "unknown" || value === "not_decided" ? "未知" : value;
}

function assetClassLabel(value: AssetClass): string {
  if (value === "a_share") return "A 股";
  if (value === "etf") return "ETF";
  return "基金";
}

const EMPTY_HOLDING = {
  asset_class: "etf" as AssetClass,
  name: "",
  symbol: "",
  market: "",
  size_basis: "",
  observation_date: "",
};

export function PortfolioEditor({
  draft,
  experienceSource: controlledExperienceSource,
  onCancel,
  onChange,
  onExperienceSourceChange,
  onSave,
}: PortfolioEditorProps) {
  const [activeTab, setActiveTab] = useState<EditorTab>("holdings");
  const [newHolding, setNewHolding] = useState(EMPTY_HOLDING);
  const [message, setMessage] = useState<string | null>(null);
  const [uncontrolledExperienceSource, setUncontrolledExperienceSource] =
    useState<DemoBadgeSource>("random");
  const experienceSource = controlledExperienceSource ?? uncontrolledExperienceSource;
  const usable = useMemo(() => listUsableLines(draft), [draft]);
  const unresolved = useMemo(() => listUnresolvedLines(draft), [draft]);

  function emitChange(nextDraft: PortfolioDraft) {
    onChange(nextDraft);
    if (experienceSource === "random") {
      if (controlledExperienceSource === undefined) setUncontrolledExperienceSource("edited");
      onExperienceSourceChange?.("edited");
    }
  }

  function selectAdjacentTab(event: KeyboardEvent<HTMLButtonElement>, current: EditorTab) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const currentIndex = EDITOR_TABS.indexOf(current);
    const next = EDITOR_TABS[(currentIndex + direction + EDITOR_TABS.length) % EDITOR_TABS.length]!;
    setActiveTab(next);
    document.getElementById(`portfolio-${next}-tab`)?.focus();
  }

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

  return (
    <div className="portfolio-editor">
      <header className="portfolio-editor__header">
        <div>
          <DemoBadge source={experienceSource} />
          <h1>仓位／身份</h1>
          <p>编辑只影响后续复盘；已生成的历史快照不会被改写。</p>
          <p className="portfolio-editor__source">
            当前数据来源：{draft.source_label ?? "体验草稿"}。这里只展示草稿中真实存在的输入字段。
          </p>
        </div>
      </header>

      <div className="portfolio-editor__tabs" role="tablist" aria-label="仓位与约束">
        <button
          aria-controls="portfolio-holdings-panel"
          aria-selected={activeTab === "holdings"}
          className={activeTab === "holdings" ? "is-active" : undefined}
          id="portfolio-holdings-tab"
          onClick={() => setActiveTab("holdings")}
          onKeyDown={(event) => selectAdjacentTab(event, "holdings")}
          role="tab"
          tabIndex={activeTab === "holdings" ? 0 : -1}
          type="button"
        >
          持仓（{draft.lines.length}）
        </button>
        <button
          aria-controls="portfolio-constraints-panel"
          aria-selected={activeTab === "constraints"}
          className={activeTab === "constraints" ? "is-active" : undefined}
          id="portfolio-constraints-tab"
          onClick={() => setActiveTab("constraints")}
          onKeyDown={(event) => selectAdjacentTab(event, "constraints")}
          role="tab"
          tabIndex={activeTab === "constraints" ? 0 : -1}
          type="button"
        >
          四项约束
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
              <h2>确认持仓</h2>
              <p>可用 {usable.length} 条，未决 {unresolved.length} 条。未决行不会进入快照。</p>
            </div>
          </div>

          <div className="portfolio-lines" role="list">
            {draft.lines.map((line) => (
              <article
                className={`portfolio-line${line.is_usable ? "" : " portfolio-line--unresolved"}`}
                key={line.line_id}
                role="listitem"
              >
                <div className="portfolio-line__heading">
                  <div>
                    <strong>{line.name}</strong>
                    <span>{line.is_usable ? "可用于下次复盘" : "未决未知项"}</span>
                  </div>
                  <IconButton
                    icon={Trash2}
                    label={`删除 ${line.name}`}
                    onClick={() => emitChange(deleteHolding(draft, line.line_id))}
                    tooltip="删除持仓"
                  />
                </div>
                <dl className="portfolio-line__summary">
                  <div>
                    <dt>代码</dt>
                    <dd>{formatDraftValue(line.symbol)}</dd>
                  </div>
                  <div>
                    <dt>类型</dt>
                    <dd>{assetClassLabel(line.asset_class)}</dd>
                  </div>
                  <div>
                    <dt>观察日</dt>
                    <dd>{formatDraftValue(line.observation_date)}</dd>
                  </div>
                </dl>
                <details className="portfolio-line__details">
                  <summary>核对与编辑完整字段</summary>
                  <div className="portfolio-line__fields">
                  <label className="field">
                    <span className="field-label">资产类型</span>
                    <select
                      value={line.asset_class}
                      onChange={(event) =>
                        emitChange(
                          editHolding(draft, line.line_id, {
                            asset_class: event.target.value as AssetClass,
                          }),
                        )
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
                      value={line.name}
                      onChange={(event) =>
                        emitChange(editHolding(draft, line.line_id, { name: event.target.value }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span className="field-label">代码</span>
                    <input
                      value={String(line.symbol)}
                      onChange={(event) =>
                        emitChange(
                          editHolding(draft, line.line_id, {
                            symbol: event.target.value.trim() || "unknown",
                          }),
                        )
                      }
                    />
                  </label>
                  <label className="field">
                    <span className="field-label">持仓规模依据</span>
                    <input
                      value={String(line.size_basis)}
                      onChange={(event) =>
                        emitChange(
                          editHolding(draft, line.line_id, {
                            size_basis: event.target.value.trim() || "unknown",
                          }),
                        )
                      }
                    />
                  </label>
                  <label className="field">
                    <span className="field-label">观察日期</span>
                    <input
                      inputMode="numeric"
                      placeholder="YYYY-MM-DD，未知可留空"
                      value={String(line.observation_date)}
                      onChange={(event) =>
                        emitChange(
                          editHolding(draft, line.line_id, {
                            observation_date: event.target.value.trim() || "unknown",
                          }),
                        )
                      }
                    />
                  </label>
                  </div>
                  <dl className="portfolio-line__provenance">
                    <div>
                      <dt>市场</dt>
                      <dd>{formatDraftValue(line.market)}</dd>
                    </div>
                    <div>
                      <dt>录入方式</dt>
                      <dd>{line.entry_method === "example" ? "体验生成" : "用户草稿"}</dd>
                    </div>
                    {line.notes ? (
                      <div>
                        <dt>说明</dt>
                        <dd>{line.notes}</dd>
                      </div>
                    ) : null}
                  </dl>
                </details>
                {!line.is_usable ? (
                  <p className="portfolio-line__unknown">
                    待补充：{line.unresolved_fields.join("、") || "资产身份或规模依据"}
                  </p>
                ) : null}
              </article>
            ))}
          </div>

          <form
            className="portfolio-add"
            onSubmit={(event) => {
              event.preventDefault();
              emitChange(appendHolding(draft, newHolding));
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
            onChange={(constraints) => emitChange(editConstraints(draft, constraints))}
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
