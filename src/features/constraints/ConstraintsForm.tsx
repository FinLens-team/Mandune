import { useId } from "react";
import type { PersonalConstraints, UnknownFieldState } from "../../contracts/index.js";

const UNKNOWN: UnknownFieldState = "unknown";

export const CONSTRAINT_FIELDS: ReadonlyArray<{
  key: keyof PersonalConstraints;
  label: string;
  options: readonly string[];
}> = [
  {
    key: "investment_horizon",
    label: "投资期限",
    options: ["1年以内", "1-3年", "3-5年", "5年以上"],
  },
  {
    key: "near_term_liquidity",
    label: "近期流动性需求",
    options: ["很低", "一般", "较高", "很高"],
  },
  {
    key: "tolerable_drawdown",
    label: "可承受回撤",
    options: ["较低", "中等", "较高"],
  },
  {
    key: "investment_objective",
    label: "投资目标",
    options: ["保值", "稳健增长", "长期增长"],
  },
];

export interface ConstraintsFormProps {
  value: PersonalConstraints;
  onChange: (next: PersonalConstraints) => void;
  compact?: boolean;
}

export function ConstraintsForm({ compact = false, onChange, value }: ConstraintsFormProps) {
  const headingId = useId();

  return (
    <section
      className={`constraints-form${compact ? " constraints-form--compact" : " panel"}`}
      aria-labelledby={headingId}
    >
      <div className="panel-head">
        <h2 id={headingId}>个人偏好</h2>
        <p className="panel-note">不确定的项目可以保留为“未知／尚未决定”。</p>
      </div>
      <div className="constraint-grid">
        {CONSTRAINT_FIELDS.map((field) => {
          const current = value[field.key];
          const currentUnknown = current === "not_decided" ? "not_decided" : UNKNOWN;
          return (
            <label key={field.key} className="field">
              <span className="field-label">{field.label}</span>
              <select
                name={field.key}
                value={current}
                onChange={(event) => {
                  onChange({
                    ...value,
                    [field.key]: event.target.value,
                  });
                }}
              >
                <option value={currentUnknown}>未知／尚未决定</option>
                {field.options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          );
        })}
      </div>
    </section>
  );
}
