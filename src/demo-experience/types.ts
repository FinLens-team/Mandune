import type {
  AssetClass,
  EvidenceStatus,
  PersonalConstraints,
  ProvenanceKind,
} from "../contracts/index.js";

export const DEMO_EXPERIENCE_SOURCE_LABEL = "测试 fixture · 非实时行情";

export interface DemoExperienceHolding {
  line_id: string;
  evidence_id: string;
  asset_class: Extract<AssetClass, "a_share" | "etf">;
  name: string;
  symbol: string;
  market?: string;
  size_basis: string;
  observation_date: string;
  observed_value: string | number;
  observed_unit?: string;
  source_name: string;
  source_locator: string;
  observed_at: string;
  fetched_at: string;
  evidence_status: EvidenceStatus;
  provenance: ProvenanceKind;
}

export interface DemoExperienceIdentity {
  identity_id: string;
  seed: string;
  scenario_id: "supported_full";
  theme_id: "eastern_observation";
  created_at: string;
  is_example: true;
  source_kind: "fixture";
  source_label: typeof DEMO_EXPERIENCE_SOURCE_LABEL;
  holdings: DemoExperienceHolding[];
  constraints: PersonalConstraints;
}
