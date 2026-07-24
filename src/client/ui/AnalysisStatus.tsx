import { CircleCheck, CircleX, Eye, TriangleAlert } from "lucide-react";
import type { HTMLAttributes } from "react";
import type { LucideIcon } from "lucide-react";

export type AnalysisStatusValue =
  | "supported"
  | "limited"
  | "observation_only"
  | "unavailable";

interface StatusContent {
  description: string;
  icon: LucideIcon;
  label: string;
}

const STATUS_CONTENT: Record<AnalysisStatusValue, StatusContent> = {
  supported: {
    description: "当前证据支持全部物质性结论",
    icon: CircleCheck,
    label: "证据支持",
  },
  limited: {
    description: "部分证据缺口限制了结论范围",
    icon: TriangleAlert,
    label: "有限分析",
  },
  observation_only: {
    description: "当前证据仅支持事实与观察项",
    icon: Eye,
    label: "仅观察",
  },
  unavailable: {
    description: "当前证据不足以生成观象长笺",
    icon: CircleX,
    label: "分析不可用",
  },
};

export interface AnalysisStatusProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "children" | "role"> {
  description?: string;
  status: AnalysisStatusValue;
}

export function AnalysisStatus({
  className,
  description,
  status,
  ...statusProps
}: AnalysisStatusProps) {
  const content = STATUS_CONTENT[status];
  const Icon = content.icon;
  const classes = [
    "analysis-status",
    "ui-analysis-status",
    `ui-analysis-status--${status}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div {...statusProps} className={classes} data-status={status} role="status">
      <Icon aria-hidden="true" className="ui-analysis-status__icon" size={20} />
      <span className="ui-analysis-status__copy">
        <strong>{content.label}</strong>
        <span>{description ?? content.description}</span>
      </span>
    </div>
  );
}
