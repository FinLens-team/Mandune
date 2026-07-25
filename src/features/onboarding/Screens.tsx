import {
  CircleUserRound,
  Panda,
  PenLine,
  RefreshCw,
  ScanLine,
  Shuffle,
} from "lucide-react";
import { useEffect, useRef, type Ref } from "react";
import type { PersonalConstraints } from "../../contracts/index.js";
import type { DemoExperienceIdentity } from "../../demo-experience/index.js";
import { Button, DemoBadge, LockBadge } from "../../client/ui/index.js";

interface ScreenTitleProps {
  titleRef?: Ref<HTMLHeadingElement>;
}

export interface SplashScreenProps {
  onSkip: () => void;
}

export function SplashScreen({ onSkip }: SplashScreenProps) {
  const skipRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    skipRef.current?.focus();
  }, []);

  return (
    <section className="onboarding-screen onboarding-splash" aria-labelledby="s0-title">
      <div className="onboarding-splash__copy">
        <p className="onboarding-kicker">每日持仓复盘</p>
        <h1 id="s0-title">满懂</h1>
        <p>看得懂的每日持仓复盘 · 只给方向，不替你下单</p>
      </div>
      <button ref={skipRef} className="btn onboarding-skip" onClick={onSkip} type="button">
        跳过
      </button>
    </section>
  );
}

export interface ThemeSelectionScreenProps extends ScreenTitleProps {
  selected: boolean;
  previewMessage: string | null;
  onSelect: () => void;
  onPreview: (index: number) => void;
  onContinue: () => void;
}

const LOCKED_THEME_PREVIEWS = [1, 2, 3] as const;

export function ThemeSelectionScreen({
  selected,
  previewMessage,
  titleRef,
  onSelect,
  onPreview,
  onContinue,
}: ThemeSelectionScreenProps) {
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
        <legend>当前可用主题</legend>
        <div className="onboarding-theme-grid">
          <label className={`onboarding-theme-card onboarding-theme-card--available${selected ? " is-selected" : ""}`}>
            <input
              checked={selected}
              name="theme"
              onChange={onSelect}
              type="radio"
              value="eastern_observation"
            />
            <Panda aria-hidden="true" className="onboarding-theme-icon" size={48} />
            <strong>东方观象</strong>
            <span>熊猫兜兜陪你观察、解释并承认未知</span>
          </label>

          {LOCKED_THEME_PREVIEWS.map((index) => (
            <button
              aria-disabled="true"
              className="onboarding-theme-card onboarding-theme-card--locked"
              key={index}
              onClick={() => onPreview(index)}
              type="button"
            >
              <CircleUserRound aria-hidden="true" className="onboarding-theme-icon" size={44} />
              <strong>主题预览 {index}</strong>
              <span>占位角色 {index}</span>
              <LockBadge />
            </button>
          ))}
        </div>
      </fieldset>

      <p className="onboarding-inline-status" role="status">
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
          <h2>先随便看看</h2>
          <p>随机生成一份体验持仓与四项约束</p>
        </div>
        <Button onClick={onChooseRandom} variant="primary">
          生成随机体验身份
        </Button>
      </div>

      <div className="onboarding-divider" role="separator">
        其它持仓来源
      </div>
      <div className="onboarding-placeholder-grid">
        <button
          aria-disabled="true"
          className="onboarding-placeholder"
          onClick={() => onPlaceholder("manual")}
          type="button"
        >
          <PenLine aria-hidden="true" size={22} />
          <span>手工录入持仓</span>
          <LockBadge />
        </button>
        <button
          aria-disabled="true"
          className="onboarding-placeholder"
          onClick={() => onPlaceholder("screenshot")}
          type="button"
        >
          <ScanLine aria-hidden="true" size={22} />
          <span>截图识别导入</span>
          <LockBadge />
        </button>
      </div>
      <p className="onboarding-inline-status" role="status">
        {placeholderMessage ?? "未开放入口不会打开表单、相机或文件选择器。"}
      </p>
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
        <p className="onboarding-seed" role="status">
          可复现体验编号：<code>{identity.seed}</code> · {identity.source_label}
        </p>
      </header>

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
                    </p>
                  </div>
                  <span className="onboarding-evidence-kind">observed</span>
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
                    <dd>
                      {holding.evidence_status} · {identity.source_label}
                    </dd>
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
