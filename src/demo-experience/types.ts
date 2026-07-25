import type {
  AssetClass,
  PersonalConstraints,
} from "../contracts/index.js";

export const DEMO_EXPERIENCE_SOURCE_LABEL = "内置标的随机生成";

export interface DemoExperienceHolding {
  line_id: string;
  asset_class: AssetClass;
  name: string;
  symbol: string;
  market?: string;
  size_basis: string;
  observation_date: string;
  source_name: string;
}

export interface DemoExperienceIdentity {
  identity_id: string;
  seed: string;
  scenario_id: "random_portfolio";
  theme_id: "eastern_observation";
  created_at: string;
  is_example: true;
  source_kind: "generated";
  source_label: typeof DEMO_EXPERIENCE_SOURCE_LABEL;
  holdings: DemoExperienceHolding[];
  constraints: PersonalConstraints;
}
