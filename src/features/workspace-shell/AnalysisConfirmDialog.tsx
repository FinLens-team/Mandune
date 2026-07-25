import { useEffect, useRef, useState } from "react";
import type { PersonalConstraints, PortfolioSnapshot } from "../../contracts/index.js";
import { Button, DemoBadge, type DemoBadgeSource } from "../../client/ui/index.js";
import { handleOverlayKeyDown, useOverlayFocus, useOverlayPresence } from "./focus.js";

export interface AnalysisConfirmDialogProps {
  open: boolean;
  snapshot: PortfolioSnapshot | null;
  experienceSource?: DemoBadgeSource;
  latestCompleteTradingDay?: string;
  reduceMotion: boolean;
  returnFocus: HTMLElement | null;
  onCancel: () => void;
  onConfirm: (snapshot: PortfolioSnapshot) => void;
}

export function countUnknownConstraints(snapshot: PortfolioSnapshot): number {
  return Object.values(snapshot.constraints).filter(
    (value) => value === "unknown" || value === "not_decided",
  ).length;
}

const CONSTRAINT_SUMMARY: ReadonlyArray<[keyof PersonalConstraints, string]> = [
  ["investment_horizon", "投资期限"],
  ["near_term_liquidity", "近期流动性需求"],
  ["tolerable_drawdown", "可承受回撤"],
  ["investment_objective", "投资目标"],
];

export function formatConstraintValue(value: string): string {
  return value === "unknown" || value === "not_decided" ? "未知／尚未决定" : value;
}

export function AnalysisConfirmDialog(props: AnalysisConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [lastSnapshot, setLastSnapshot] = useState(props.snapshot);
  const presence = useOverlayPresence(props.open, props.reduceMotion ? 100 : 140);
  const snapshot = props.snapshot ?? lastSnapshot;

  useEffect(() => {
    if (props.snapshot) setLastSnapshot(props.snapshot);
  }, [props.snapshot]);

  useOverlayFocus({
    open: presence.present,
    focusScopeRef: dialogRef,
    returnFocus: props.returnFocus,
  });

  if (!presence.present || !snapshot) return null;
  const unknownCount = countUnknownConstraints(snapshot);

  return (
    <div
      className="analysis-confirm-layer"
      data-reduce-motion={props.reduceMotion || undefined}
      data-state={presence.phase}
    >
      <button
        aria-label="取消发起复盘"
        className="analysis-confirm__backdrop"
        onClick={props.onCancel}
        tabIndex={-1}
        type="button"
      />
      <div
        aria-describedby="analysis-confirm-description"
        aria-labelledby="analysis-confirm-heading"
        aria-modal="true"
        className="analysis-confirm"
        onKeyDown={(event) => {
          if (dialogRef.current) {
            handleOverlayKeyDown(event, dialogRef.current, props.onCancel);
          }
        }}
        ref={dialogRef}
        role="dialog"
      >
        <DemoBadge source={props.experienceSource} />
        <h2 id="analysis-confirm-heading">按当前输入发起今日复盘？</h2>
        <p id="analysis-confirm-description">
          将冻结当前 {snapshot.lines.length} 项确认持仓和四项约束，使用截至
          {props.latestCompleteTradingDay
            ? ` ${props.latestCompleteTradingDay}`
            : "分析开始时可获得的最新完整交易日"}
          的证据。
        </p>
        <dl className="analysis-confirm__facts">
          <div>
            <dt>约束状态</dt>
            <dd>{unknownCount === 0 ? "四项均已填写" : `${unknownCount} 项未知，相关判断将受限`}</dd>
          </div>
          {CONSTRAINT_SUMMARY.map(([key, label]) => (
            <div key={key}>
              <dt>{label}</dt>
              <dd>{formatConstraintValue(snapshot.constraints[key])}</dd>
            </div>
          ))}
          <div>
            <dt>完成目标</dt>
            <dd>约 90 秒</dd>
          </div>
          <div>
            <dt>硬截止</dt>
            <dd>180 秒，届时停止未完成任务并诚实降级</dd>
          </div>
        </dl>
        <p className="analysis-confirm__boundary">
          复盘只提供可追溯的方向性建议，不给出精确金额、比例、价格或交易时点。
        </p>
        <div className="analysis-confirm__actions">
          <Button onClick={props.onCancel} variant="secondary">
            取消
          </Button>
          <Button
            data-initial-focus="true"
            onClick={() => props.onConfirm(snapshot)}
            variant="primary"
          >
            开始复盘
          </Button>
        </div>
      </div>
    </div>
  );
}
