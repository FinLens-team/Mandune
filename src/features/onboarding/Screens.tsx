import {
  PenLine,
  RefreshCw,
  ScanLine,
  Shuffle,
} from "lucide-react";
import { useEffect, useRef, useState, type Ref } from "react";
import type { PersonalConstraints } from "../../contracts/index.js";
import type { DemoExperienceIdentity } from "../../demo-experience/index.js";
import { Badge, Button, DemoBadge, LockBadge } from "../../client/ui/index.js";
import doudouObserver from "../../client/assets/doudou/doudou-observer.png";
import previewOne from "../../client/assets/theme-previews/theme-preview-1.png";
import previewTwo from "../../client/assets/theme-previews/theme-preview-2.png";
import previewThree from "../../client/assets/theme-previews/theme-preview-3.png";

interface ScreenTitleProps {
  titleRef?: Ref<HTMLHeadingElement>;
}

export interface SplashScreenProps {
  onSkip: () => void;
  returning?: boolean;
}

export function SplashScreen({ onSkip, returning = false }: SplashScreenProps) {
  return (
    <section
      className={`onboarding-screen onboarding-splash${returning ? " onboarding-splash--returning" : ""}`}
      aria-labelledby="s0-title"
    >
      <div className="onboarding-splash__copy">
        <div className="onboarding-splash__wordmark">
          <span aria-hidden="true" className="onboarding-splash__mark" />
          <h1 id="s0-title">满懂</h1>
        </div>
        {returning ? null : (
          <p className="onboarding-splash__positioning">
            看得懂的每日持仓复盘 · 只给方向，不替你下单
          </p>
        )}
      </div>
      <Button autoFocus className="onboarding-skip" onClick={onSkip}>
        跳过
      </Button>
    </section>
  );
}

export interface ThemeSelectionScreenProps extends ScreenTitleProps {
  selected: boolean;
  previewMessage: string | null;
  previewIndex?: number | null;
  onSelect: () => void;
  onPreview: (index: number) => void;
  onContinue: () => void;
}

const LOCKED_THEME_PREVIEWS = [
  {
    description: "明快色彩与独立角色的表现方向",
    image: previewOne,
    index: 2,
  },
  {
    description: "轻盈留白与独立角色的表现方向",
    image: previewTwo,
    index: 3,
  },
  {
    description: "清朗动势与独立角色的表现方向",
    image: previewThree,
    index: 4,
  },
] as const;

export function ThemeSelectionScreen({
  selected,
  previewMessage,
  previewIndex = null,
  titleRef,
  onSelect,
  onPreview,
  onContinue,
}: ThemeSelectionScreenProps) {
  const themeGridRef = useRef<HTMLDivElement>(null);
  const [forceList, setForceList] = useState(false);

  useEffect(() => {
    const grid = themeGridRef.current;
    if (!grid || typeof ResizeObserver === "undefined") return;

    const checkFit = () => {
      const cards = grid.querySelectorAll<HTMLElement>(".onboarding-theme-card");
      const contentOverflows = [...cards].some(
        (card) => card.scrollHeight > card.clientHeight + 1 || card.scrollWidth > card.clientWidth + 1,
      );
      if (contentOverflows) setForceList(true);
    };
    const observer = new ResizeObserver(checkFit);
    observer.observe(grid);
    grid.querySelectorAll(".onboarding-theme-card").forEach((card) => observer.observe(card));
    checkFit();
    return () => observer.disconnect();
  }, []);

  return (
    <section className="onboarding-screen" aria-labelledby="s1-title">
      <header className="onboarding-heading">
        <p className="onboarding-step">首次引导 · 1 / 3</p>
        <h1 id="s1-title" ref={titleRef} tabIndex={-1}>
          选择复盘主题
        </h1>
        <p>主题只改变表达方式，不改变证据、风险判断或方向性建议。</p>
      </header>

      <fieldset className="onboarding-theme-fieldset">
        <legend>主题选择与预览</legend>
        <div
          className={`onboarding-theme-grid${selected ? " is-selected" : ""}${forceList ? " onboarding-theme-grid--list" : ""}`}
          ref={themeGridRef}
        >
          <label className={`onboarding-theme-card onboarding-theme-card--available${selected ? " is-selected" : ""}`}>
            <input
              checked={selected}
              name="theme"
              onChange={onSelect}
              type="radio"
              value="eastern_observation"
            />
            <img alt="" className="onboarding-theme-art" height="512" src={doudouObserver} width="512" />
            <strong>东方观象</strong>
            <span>熊猫兜兜陪你观察、解释并承认未知</span>
            <Badge tone="observed">当前可用</Badge>
          </label>

          {LOCKED_THEME_PREVIEWS.map((preview) => (
            <button
              aria-disabled="true"
              aria-controls="s1-preview-detail"
              aria-describedby="s1-preview-detail"
              aria-expanded={previewIndex === preview.index}
              aria-label={`查看主题预览 ${String(preview.index).padStart(2, "0")} 详情，尚未开放`}
              className={`onboarding-theme-card onboarding-theme-card--locked${previewIndex === preview.index ? " is-previewed" : ""}`}
              data-preview={preview.index}
              key={preview.index}
              onClick={() => onPreview(preview.index)}
              type="button"
            >
              <img alt="" className="onboarding-theme-art" height="512" src={preview.image} width="512" />
              <strong>主题预览 {String(preview.index).padStart(2, "0")}</strong>
              <span>{preview.description}</span>
              <LockBadge />
            </button>
          ))}
        </div>
      </fieldset>

      <div className="onboarding-theme-selection-row">
        <Button onClick={onSelect}>选择东方观象</Button>
        <span>{selected ? "已选择，主题仅改变表达。" : "当前只有这一主题可选择。"}</span>
      </div>
      <p className="onboarding-inline-status" id="s1-preview-detail" role="status">
        {previewMessage ?? "当前只有东方观象可进入下一步。"}
      </p>
      <div className="onboarding-actions onboarding-actions--end">
        <Button disabled={!selected} onClick={onContinue} variant="primary">
          下一步
        </Button>
      </div>
    </section>
  );
}

export interface SourceSelectionScreenProps extends ScreenTitleProps {
  placeholderMessage: string | null;
  onBack: () => void;
  onChooseRandom: () => void;
  onPlaceholder: (source: "manual" | "screenshot") => void;
}

export function SourceSelectionScreen({
  placeholderMessage,
  titleRef,
  onBack,
  onChooseRandom,
  onPlaceholder,
}: SourceSelectionScreenProps) {
  return (
    <section className="onboarding-screen onboarding-source" aria-labelledby="s2-title">
      <header className="onboarding-heading">
        <p className="onboarding-step">首次引导 · 2 / 3</p>
        <h1 id="s2-title" ref={titleRef} tabIndex={-1}>
          从哪里开始
        </h1>
        <p>Demo 主路径不需要提交真实账户或持仓信息。</p>
      </header>

      <div className="onboarding-source__primary">
        <Shuffle aria-hidden="true" size={28} />
        <div>
          <h2>先体验一次</h2>
          <p>生成一份明确标注的示例持仓与四项约束，不需要提交真实资料。</p>
        </div>
        <Button onClick={onChooseRandom} variant="primary">
          生成体验持仓
        </Button>
      </div>

      <section className="onboarding-source__own" aria-labelledby="own-holdings-title">
        <div className="onboarding-source__group-heading">
          <h2 id="own-holdings-title">使用自己的持仓</h2>
          <span>即将开放</span>
        </div>
        <div className="onboarding-placeholder-grid">
          <button
            aria-disabled="true"
            aria-describedby="s2-placeholder-detail"
            className="onboarding-placeholder"
            onClick={() => onPlaceholder("manual")}
            type="button"
          >
            <PenLine aria-hidden="true" size={22} />
            <span>手工录入</span>
            <LockBadge />
          </button>
          <button
            aria-disabled="true"
            aria-describedby="s2-placeholder-detail"
            className="onboarding-placeholder"
            onClick={() => onPlaceholder("screenshot")}
            type="button"
          >
            <ScanLine aria-hidden="true" size={22} />
            <span>截图识别</span>
            <LockBadge />
          </button>
        </div>
        <p className="onboarding-inline-status" id="s2-placeholder-detail" role="status">
          {placeholderMessage ?? "未开放入口不会打开表单、相机或文件选择器。"}
        </p>
      </section>
      <div className="onboarding-actions">
        <Button onClick={onBack}>返回主题选择</Button>
      </div>
    </section>
  );
}

const CONSTRAINT_LABELS: Record<keyof PersonalConstraints, string> = {
  investment_horizon: "投资期限",
  near_term_liquidity: "近期流动性需求",
  tolerable_drawdown: "可承受回撤",
  investment_objective: "投资目标",
};

function formatConstraint(value: string): string {
  return value === "unknown" || value === "not_decided" ? "未知／尚未决定" : value;
}

function assetClassLabel(assetClass: "a_share" | "etf"): string {
  return assetClass === "a_share" ? "A 股" : "ETF";
}

export interface ExperienceSummaryScreenProps extends ScreenTitleProps {
  identity: DemoExperienceIdentity;
  onBack: () => void;
  onConfirm: () => void;
  onReroll: () => void;
}

export function ExperienceSummaryScreen({
  identity,
  titleRef,
  onBack,
  onConfirm,
  onReroll,
}: ExperienceSummaryScreenProps) {
  return (
    <section className="onboarding-screen onboarding-summary" aria-labelledby="s3-title">
      <header className="onboarding-heading">
        <p className="onboarding-step">首次引导 · 3 / 3</p>
        <DemoBadge aria-label="随机体验身份，以下均为示例数据，不是真实持仓" />
        <h1 id="s3-title" ref={titleRef} tabIndex={-1}>
          确认随机体验身份
        </h1>
        <p>这不是你的真实持仓，也不是系统推荐的约束；进入主界面后仍可修改。</p>
      </header>

      <div className="onboarding-summary__identity" key={identity.identity_id}>
        <p className="onboarding-seed" role="status">
          可复现体验编号：<code>{identity.seed}</code> · {identity.source_label}
        </p>
        <div className="onboarding-summary__grid">
          <section aria-labelledby="holdings-title">
            <div className="onboarding-section-heading">
              <h2 id="holdings-title">体验持仓</h2>
              <span>{identity.holdings.length} 项</span>
            </div>
            <div className="onboarding-holdings">
              {identity.holdings.map((holding) => (
                <article className="onboarding-holding" key={holding.line_id}>
                  <div className="onboarding-holding__title">
                    <div>
                      <h3>{holding.name}</h3>
                      <p>
                        {assetClassLabel(holding.asset_class)} · {holding.symbol}
                        {holding.market ? ` · ${holding.market}` : ""}
                      </p>
                    </div>
                    <span className="onboarding-evidence-kind">{holding.provenance}</span>
                  </div>
                  <dl>
                    <div>
                      <dt>持仓规模依据</dt>
                      <dd>{holding.size_basis}</dd>
                    </div>
                    <div>
                      <dt>观察值</dt>
                      <dd>
                        {String(holding.observed_value)}
                        {holding.observed_unit ? ` ${holding.observed_unit}` : ""}
                      </dd>
                    </div>
                    <div>
                      <dt>观察日期</dt>
                      <dd>{holding.observation_date}</dd>
                    </div>
                    <div>
                      <dt>市场观察时间</dt>
                      <dd>{holding.observed_at}</dd>
                    </div>
                    <div>
                      <dt>系统获取时间</dt>
                      <dd>{holding.fetched_at}</dd>
                    </div>
                    <div>
                      <dt>证据来源</dt>
                      <dd>{holding.source_name}</dd>
                    </div>
                    <div>
                      <dt>来源状态</dt>
                      <dd>{holding.evidence_status}</dd>
                    </div>
                    <div>
                      <dt>数据边界</dt>
                      <dd>{identity.source_label}</dd>
                    </div>
                    <div>
                      <dt>证据定位</dt>
                      <dd>{holding.source_locator}</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          </section>

          <section aria-labelledby="constraints-title">
            <div className="onboarding-section-heading">
              <h2 id="constraints-title">四项体验约束</h2>
              <span>体验生成值</span>
            </div>
            <dl className="onboarding-constraints">
              {(Object.keys(CONSTRAINT_LABELS) as (keyof PersonalConstraints)[]).map((key) => (
                <div key={key}>
                  <dt>{CONSTRAINT_LABELS[key]}</dt>
                  <dd>{formatConstraint(identity.constraints[key])}</dd>
                </div>
              ))}
            </dl>
            <p className="onboarding-constraints-note">
              「未知／尚未决定」是有效输入，会缩小相关判断，不会由系统补成默认答案。
            </p>
          </section>
        </div>
      </div>

      <div className="onboarding-sticky-spacer" aria-hidden="true" />
      <footer className="onboarding-confirm-bar">
        <div className="onboarding-confirm-bar__inner">
          <Button onClick={onBack}>返回来源选择</Button>
          <Button onClick={onReroll}>
            <RefreshCw aria-hidden="true" size={18} />
            换一份体验身份
          </Button>
          <Button onClick={onConfirm} variant="primary">
            确认此体验身份
          </Button>
        </div>
      </footer>
    </section>
  );
}
