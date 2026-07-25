import { Lock } from "lucide-react";
import type { HTMLAttributes, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export type BadgeTone = "demo" | "locked" | "observed" | "risk" | "neutral";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  children: ReactNode;
  icon?: LucideIcon;
  showDot?: boolean;
  tone?: BadgeTone;
}

export function Badge({
  children,
  className,
  icon: Icon,
  showDot = false,
  tone = "neutral",
  ...badgeProps
}: BadgeProps) {
  const classes = ["ui-badge", `ui-badge--${tone}`, className]
    .filter(Boolean)
    .join(" ");

  return (
    <span {...badgeProps} className={classes} data-tone={tone}>
      {showDot ? <span aria-hidden="true" className="ui-badge__dot" /> : null}
      {Icon ? <Icon aria-hidden="true" className="ui-badge__icon" size={14} /> : null}
      <span>{children}</span>
    </span>
  );
}

export type DemoBadgeSource = "random" | "edited";

export interface DemoBadgeProps
  extends Omit<BadgeProps, "children" | "icon" | "showDot" | "tone"> {
  source?: DemoBadgeSource;
}

export function DemoBadge({ source = "random", ...props }: DemoBadgeProps) {
  return (
    <Badge {...props} data-source={source} showDot tone="demo">
      {source === "edited" ? "体验持仓 · 已编辑" : "随机体验身份 · 示例数据"}
    </Badge>
  );
}

export type LockBadgeProps = Omit<BadgeProps, "children" | "icon" | "showDot" | "tone">;

export function LockBadge(props: LockBadgeProps) {
  return (
    <Badge {...props} icon={Lock} tone="locked">
      暂未开放
    </Badge>
  );
}
