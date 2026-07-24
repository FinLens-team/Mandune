import type { PersonalConstraints, UnknownFieldState } from "../../contracts/index.js";

const UNKNOWN: UnknownFieldState = "unknown";

const FIELDS: Array<{
  key: keyof PersonalConstraints;
  label: string;
  options: string[];
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

export function ConstraintsForm(props: {
  value: PersonalConstraints;
  onChange: (next: PersonalConstraints) => void;
}) {
  return (
    <section className="panel" aria-labelledby="constraints-heading">
      <div className="panel-head">
        <h2 id="constraints-heading">四项个人约束</h2>
        <p className="panel-note">均可选择“未知／尚未决定”，不会阻止继续。</p>
      </div>
      <div className="constraint-grid">
        {FIELDS.map((field) => {
          const current = props.value[field.key];
          return (
            <label key={field.key} className="field">
              <span className="field-label">{field.label}</span>
              <select
                value={typeof current === "string" ? current : UNKNOWN}
                onChange={(event) => {
                  props.onChange({
                    ...props.value,
                    [field.key]: event.target.value,
                  });
                }}
              >
                <option value={UNKNOWN}>未知／尚未决定</option>
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
