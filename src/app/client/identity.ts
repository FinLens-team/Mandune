import type { PortfolioDraft } from "../../contracts/index.js";
import type { DemoExperienceIdentity } from "../../demo-experience/index.js";

export const RANDOM_EXPERIENCE_DRAFT_LABEL_PREFIX = "随机体验身份";

export function identityToPortfolioDraft(identity: DemoExperienceIdentity): PortfolioDraft {
  const sourceLabel = `${RANDOM_EXPERIENCE_DRAFT_LABEL_PREFIX} · ${identity.source_label}`;
  return {
    draft_id: `draft-${identity.identity_id}`,
    created_at: identity.created_at,
    updated_at: identity.created_at,
    source_label: sourceLabel,
    constraints: structuredClone(identity.constraints),
    lines: identity.holdings.map((holding) => ({
      line_id: holding.line_id,
      asset_class: holding.asset_class,
      name: holding.name,
      symbol: holding.symbol,
      ...(holding.market ? { market: holding.market } : {}),
      size_basis: holding.size_basis,
      observation_date: holding.observation_date,
      entry_method: "example",
      is_usable: true,
      unresolved_fields: [],
      notes: `${sourceLabel}；${holding.source_name}；观察 ${holding.observed_at}；获取 ${holding.fetched_at}`,
    })),
  };
}
