import { useEffect, useRef, useState } from "react";
import type { PortfolioSnapshot } from "../../contracts/index.js";
import { Button } from "../../client/ui/index.js";
import { handleOverlayKeyDown, useOverlayFocus, useOverlayPresence } from "./focus.js";

export interface AnalysisConfirmDialogProps {
  open: boolean;
  snapshot: PortfolioSnapshot | null;
  reduceMotion: boolean;
  returnFocus: HTMLElement | null;
  onCancel: () => void;
  onConfirm: (snapshot: PortfolioSnapshot) => void;
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
        <h2 id="analysis-confirm-heading">是否基于当前数据复盘分析？</h2>
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
