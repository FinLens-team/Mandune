import { useState } from "react";
import { FIXTURES, type FixtureScenarioId } from "../../fixtures/scenarios.js";
import { LongCard, ThemePreview, longCardRuntimeFromFixture } from "./LongCard.js";

const SCENARIOS: Array<{ id: FixtureScenarioId; label: string }> = [
  { id: "supported_full", label: "证据支持" },
  { id: "limited_partial", label: "有限分析" },
  { id: "observation_only_gaps", label: "仅观察" },
  { id: "unavailable_no_evidence", label: "不可用" },
];

export function LongCardDemo() {
  const [scenario, setScenario] = useState<FixtureScenarioId>("supported_full");
  return (
    <section className="long-card-demo" aria-labelledby="long-card-demo-heading">
      <div className="long-card-demo-head">
        <div>
          <p className="eyebrow">每日复盘示例</p>
          <h2 id="long-card-demo-heading">同一快照的观象长笺</h2>
        </div>
        <p>示例数据</p>
      </div>
      <ThemePreview />
      <div className="scenario-tabs" aria-label="示例分析状态" role="group">
        {SCENARIOS.map((item) => (
          <button
            aria-pressed={scenario === item.id}
            className={scenario === item.id ? "is-selected" : undefined}
            key={item.id}
            onClick={() => setScenario(item.id)}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>
      <LongCard input={longCardRuntimeFromFixture(FIXTURES[scenario])} />
    </section>
  );
}
