import { useRef } from "react";
import type { PortfolioSnapshot } from "../../contracts/index.js";
import { Button, DemoBadge } from "../../client/ui/index.js";
import { handleOverlayKeyDown, useOverlayFocus } from "./focus.js";

export interface AnalysisConfirmDialogProps {
  open: boolean;
  snapshot: PortfolioSnapshot | null;
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

export function AnalysisConfirmDialog(props: AnalysisConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useOverlayFocus({
    open: props.open,
    focusScopeRef: dialogRef,
    returnFocus: props.returnFocus,
  });

  if (!props.open || !props.snapshot) return null;
  const unknownCount = countUnknownConstraints(props.snapshot);

  return (
    <div className="analysis-confirm-layer" data-reduce-motion={props.reduceMotion || undefined}>
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
        <DemoBadge />
        <h2 id="analysis-confirm-heading">按当前输入发起今日复盘？</h2>
        <p id="analysis-confirm-description">
          将冻结当前 {props.snapshot.lines.length} 项确认持仓和四项约束，使用截至
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
            onClick={() => props.onConfirm(props.snapshot!)}
            variant="primary"
          >
            开始复盘
          </Button>
        </div>
      </div>
    </div>
  );
}
