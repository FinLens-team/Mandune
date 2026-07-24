import type { LucideIcon } from "lucide-react";
import { useId, type ButtonHTMLAttributes } from "react";

export interface IconButtonProps
  extends Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    "aria-describedby" | "aria-label" | "children"
  > {
  icon: LucideIcon;
  label: string;
  tooltip?: string;
}

export function IconButton({
  className,
  icon: Icon,
  label,
  tooltip = label,
  type = "button",
  ...buttonProps
}: IconButtonProps) {
  const tooltipId = useId();
  const classes = ["ui-icon-button", className].filter(Boolean).join(" ");

  return (
    <span className="ui-icon-button-shell">
      <button
        {...buttonProps}
        aria-describedby={tooltipId}
        aria-label={label}
        className={classes}
        type={type}
      >
        <Icon aria-hidden="true" className="ui-icon-button__icon" size={20} />
      </button>
      <span className="ui-tooltip" id={tooltipId} role="tooltip">
        {tooltip}
      </span>
    </span>
  );
}
