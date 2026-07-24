/**
 * Pure TypeScript runtime validators for Demo V1 contracts.
 * Fail closed on unknown versions, missing material refs, privacy leaks,
 * and out-of-policy advice statements.
 */

import type {
  AnalysisResult,
  Conclusion,
  DirectionalAdvice,
  LongCardData,
} from "./analysis.js";
import {
  ANALYSIS_RESULT_STATUSES,
  ASSET_CLASSES,
  DIRECTIONAL_ADVICE_KINDS,
  EVIDENCE_STATUSES,
  ENTRY_METHODS,
  PROVENANCE_KINDS,
  TASK_EVENT_STAGES,
  TASK_EVENT_STATES,
  UNKNOWN_FIELD_STATES,
  type AnalysisResultStatus,
  type EvidenceStatus,
  type ProvenanceKind,
  type TaskEventStage,
  type TaskEventState,
  type UnknownFieldState,
  type ValidateResult,
  type ValidationIssue,
} from "./common.js";
import type { EvidenceRecord } from "./evidence.js";
import type {
  ConfirmedLine,
  DraftLine,
  PersonalConstraints,
  PortfolioDraft,
  PortfolioSnapshot,
} from "./portfolio.js";
import type { TaskEvent } from "./task-event.js";
import { CONTRACTS_VERSION } from "./version.js";

const PRIVACY_FORBIDDEN_KEYS = new Set([
  "screenshot",
  "screenshot_bytes",
  "raw_image",
  "image_base64",
  "identity",
  "id_number",
  "phone",
  "email",
  "account_name",
  "account_number",
  "broker_account",
  "workspace_credential",
  "workspace_token",
  "api_key",
  "apiKey",
  "password",
  "secret",
  "token",
  "MODEL_API_KEY",
  "PANDA_PASSWORD",
  "BOCHA_API_KEY",
]);

/** Exact trade-instruction patterns forbidden in advice statements. */
const FORBIDDEN_ADVICE_PATTERNS: RegExp[] = [
  /\d+(\.\d+)?\s*%/,
  /\d+(\.\d+)?\s*(元|块|万|亿|股|份|手)/,
  /¥\s*\d+/,
  /\$\s*\d+/,
  /\b\d{1,2}([:：]\d{2})\b/,
  /\b20\d{2}[-/年]\d{1,2}([-/月]\d{1,2})?/,
  /(买入|卖出|建仓|清仓|加仓|减仓)\s*\d+/,
  /目标价\s*\d+/,
  /仓位\s*\d+/,
];

function issue(path: string, code: string, message: string): ValidationIssue {
  return { path, code, message };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isIsoDateTime(value: unknown): value is string {
  return (
    isNonEmptyString(value) &&
    !Number.isNaN(Date.parse(value)) &&
    (value.includes("T") || value.includes(" "))
  );
}

function isIsoDate(value: unknown): value is string {
  return isNonEmptyString(value) && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isUnknownFieldState(value: unknown): value is UnknownFieldState {
  return (
    typeof value === "string" &&
    (UNKNOWN_FIELD_STATES as readonly string[]).includes(value)
  );
}

function isStringOrUnknown(value: unknown): value is string | UnknownFieldState {
  return isNonEmptyString(value) || isUnknownFieldState(value);
}

function includesConst<T extends string>(
  allowed: readonly T[],
  value: unknown,
): value is T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value);
}

function collectPrivacyIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
  seen = new WeakSet<object>(),
): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      collectPrivacyIssues(item, `${path}[${index}]`, issues, seen);
    });
    return;
  }
  if (!isObject(value)) {
    return;
  }
  if (seen.has(value)) {
    return;
  }
  seen.add(value);
  for (const [key, child] of Object.entries(value)) {
    const childPath = path ? `${path}.${key}` : key;
    if (PRIVACY_FORBIDDEN_KEYS.has(key)) {
      issues.push(
        issue(
          childPath,
          "privacy_forbidden_field",
          `Field "${key}" is forbidden in analysis contracts.`,
        ),
      );
    }
    collectPrivacyIssues(child, childPath, issues, seen);
  }
}

export function scanPrivacy(value: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  collectPrivacyIssues(value, "", issues);
  return issues;
}

export function adviceStatementIsAllowed(statement: string): boolean {
  return !FORBIDDEN_ADVICE_PATTERNS.some((pattern) => pattern.test(statement));
}

function requireContractsVersion(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (value !== CONTRACTS_VERSION) {
    issues.push(
      issue(
        path,
        "unknown_contracts_version",
        `Expected contracts_version "${CONTRACTS_VERSION}", got ${String(value)}.`,
      ),
    );
  }
}

function validateConstraints(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): asserts value is PersonalConstraints {
  if (!isObject(value)) {
    issues.push(issue(path, "type", "constraints must be an object."));
    return;
  }
  for (const key of [
    "investment_horizon",
    "near_term_liquidity",
    "tolerable_drawdown",
    "investment_objective",
  ] as const) {
    if (!isStringOrUnknown(value[key])) {
      issues.push(
        issue(
          `${path}.${key}`,
          "type",
          "constraint must be a non-empty string or unknown/not_decided.",
        ),
      );
    }
  }
}

function validateConfirmedLine(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): asserts value is ConfirmedLine {
  if (!isObject(value)) {
    issues.push(issue(path, "type", "confirmed line must be an object."));
    return;
  }
  if (!isNonEmptyString(value.line_id)) {
    issues.push(issue(`${path}.line_id`, "required", "line_id is required."));
  }
  if (!includesConst(ASSET_CLASSES, value.asset_class)) {
    issues.push(issue(`${path}.asset_class`, "enum", "invalid asset_class."));
  }
  if (!isNonEmptyString(value.name)) {
    issues.push(issue(`${path}.name`, "required", "name is required."));
  }
  if (!isNonEmptyString(value.symbol)) {
    issues.push(issue(`${path}.symbol`, "required", "symbol is required."));
  }
  if (value.market !== undefined && !isNonEmptyString(value.market)) {
    issues.push(issue(`${path}.market`, "type", "market must be a string when set."));
  }
  if (!isNonEmptyString(value.size_basis)) {
    issues.push(issue(`${path}.size_basis`, "required", "size_basis is required."));
  }
  if (
    !(isIsoDate(value.observation_date) || isUnknownFieldState(value.observation_date))
  ) {
    issues.push(
      issue(
        `${path}.observation_date`,
        "type",
        "observation_date must be YYYY-MM-DD or unknown/not_decided.",
      ),
    );
  }
  if (!includesConst(ENTRY_METHODS, value.entry_method)) {
    issues.push(issue(`${path}.entry_method`, "enum", "invalid entry_method."));
  }
  if (!isIsoDateTime(value.confirmed_at)) {
    issues.push(
      issue(`${path}.confirmed_at`, "type", "confirmed_at must be an ISO datetime."),
    );
  }
}

function validateDraftLine(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): asserts value is DraftLine {
  if (!isObject(value)) {
    issues.push(issue(path, "type", "draft line must be an object."));
    return;
  }
  if (!isNonEmptyString(value.line_id)) {
    issues.push(issue(`${path}.line_id`, "required", "line_id is required."));
  }
  if (!includesConst(ASSET_CLASSES, value.asset_class)) {
    issues.push(issue(`${path}.asset_class`, "enum", "invalid asset_class."));
  }
  if (!isNonEmptyString(value.name)) {
    issues.push(issue(`${path}.name`, "required", "name is required."));
  }
  if (!(isNonEmptyString(value.symbol) || isUnknownFieldState(value.symbol))) {
    issues.push(issue(`${path}.symbol`, "type", "symbol invalid."));
  }
  if (
    !(
      isNonEmptyString(value.size_basis) || isUnknownFieldState(value.size_basis)
    )
  ) {
    issues.push(issue(`${path}.size_basis`, "type", "size_basis invalid."));
  }
  if (
    !(
      isIsoDate(value.observation_date) ||
      isUnknownFieldState(value.observation_date)
    )
  ) {
    issues.push(issue(`${path}.observation_date`, "type", "observation_date invalid."));
  }
  if (!includesConst(ENTRY_METHODS, value.entry_method)) {
    issues.push(issue(`${path}.entry_method`, "enum", "invalid entry_method."));
  }
  if (typeof value.is_usable !== "boolean") {
    issues.push(issue(`${path}.is_usable`, "type", "is_usable must be boolean."));
  }
  if (
    !Array.isArray(value.unresolved_fields) ||
    !value.unresolved_fields.every((item) => typeof item === "string")
  ) {
    issues.push(
      issue(
        `${path}.unresolved_fields`,
        "type",
        "unresolved_fields must be a string array.",
      ),
    );
  }
}

export function validatePortfolioSnapshot(
  value: unknown,
): ValidateResult<PortfolioSnapshot> {
  const issues: ValidationIssue[] = [];
  issues.push(...scanPrivacy(value));
  if (!isObject(value)) {
    return {
      ok: false,
      issues: [issue("", "type", "portfolio snapshot must be an object.")],
    };
  }
  if (!isNonEmptyString(value.snapshot_id)) {
    issues.push(issue("snapshot_id", "required", "snapshot_id is required."));
  }
  if (!isIsoDateTime(value.created_at)) {
    issues.push(issue("created_at", "type", "created_at must be ISO datetime."));
  }
  requireContractsVersion(value.contracts_version, "contracts_version", issues);
  if (!isNonEmptyString(value.theme_id)) {
    issues.push(issue("theme_id", "required", "theme_id is required."));
  }
  if (!Array.isArray(value.lines) || value.lines.length === 0) {
    issues.push(issue("lines", "required", "at least one confirmed line is required."));
  } else {
    value.lines.forEach((line, index) => {
      validateConfirmedLine(line, `lines[${index}]`, issues);
    });
  }
  validateConstraints(value.constraints, "constraints", issues);
  if (issues.length > 0) {
    return { ok: false, issues };
  }
  return { ok: true, value: value as unknown as PortfolioSnapshot };
}

export function validatePortfolioDraft(
  value: unknown,
): ValidateResult<PortfolioDraft> {
  const issues: ValidationIssue[] = [];
  issues.push(...scanPrivacy(value));
  if (!isObject(value)) {
    return {
      ok: false,
      issues: [issue("", "type", "portfolio draft must be an object.")],
    };
  }
  if (!isNonEmptyString(value.draft_id)) {
    issues.push(issue("draft_id", "required", "draft_id is required."));
  }
  if (!isIsoDateTime(value.created_at) || !isIsoDateTime(value.updated_at)) {
    issues.push(issue("created_at", "type", "draft timestamps must be ISO datetime."));
  }
  if (!Array.isArray(value.lines)) {
    issues.push(issue("lines", "type", "lines must be an array."));
  } else {
    value.lines.forEach((line, index) => {
      validateDraftLine(line, `lines[${index}]`, issues);
    });
  }
  validateConstraints(value.constraints, "constraints", issues);
  if (issues.length > 0) {
    return { ok: false, issues };
  }
  return { ok: true, value: value as unknown as PortfolioDraft };
}

function validateEvidenceRecord(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): asserts value is EvidenceRecord {
  if (!isObject(value)) {
    issues.push(issue(path, "type", "evidence must be an object."));
    return;
  }
  if (!isNonEmptyString(value.id)) {
    issues.push(issue(`${path}.id`, "required", "evidence id is required."));
  }
  if (!isObject(value.scope)) {
    issues.push(issue(`${path}.scope`, "type", "scope must be an object."));
  } else if (
    value.scope.kind !== "asset" &&
    value.scope.kind !== "portfolio" &&
    value.scope.kind !== "constraint"
  ) {
    issues.push(issue(`${path}.scope.kind`, "enum", "invalid evidence scope."));
  }
  if (!isNonEmptyString(value.metric_or_event_type)) {
    issues.push(
      issue(
        `${path}.metric_or_event_type`,
        "required",
        "metric_or_event_type is required.",
      ),
    );
  }
  if (!isObject(value.source) || !isNonEmptyString(value.source.name) || !isNonEmptyString(value.source.locator)) {
    issues.push(
      issue(`${path}.source`, "required", "source.name and source.locator are required."),
    );
  }
  if (!isIsoDateTime(value.observation_or_event_time)) {
    issues.push(
      issue(
        `${path}.observation_or_event_time`,
        "type",
        "observation_or_event_time must be ISO datetime.",
      ),
    );
  }
  if (!isIsoDateTime(value.fetched_at)) {
    issues.push(issue(`${path}.fetched_at`, "type", "fetched_at must be ISO datetime."));
  }
  if (!includesConst(EVIDENCE_STATUSES, value.status)) {
    issues.push(issue(`${path}.status`, "enum", "invalid evidence status."));
  }
  if (!includesConst(PROVENANCE_KINDS, value.provenance)) {
    issues.push(issue(`${path}.provenance`, "enum", "invalid provenance."));
  }
  if (
    !Array.isArray(value.limitations) ||
    !value.limitations.every((item) => typeof item === "string")
  ) {
    issues.push(issue(`${path}.limitations`, "type", "limitations must be string[]."));
  }
  // Fail closed: unavailable/failed/stale/unverified evidence must not invent a current value claim via empty limitations
  if (
    includesConst(EVIDENCE_STATUSES, value.status) &&
    value.status !== "available" &&
    value.value !== undefined &&
    value.value !== null &&
    Array.isArray(value.limitations) &&
    value.limitations.length === 0
  ) {
    issues.push(
      issue(
        `${path}.limitations`,
        "pseudo_current_value",
        "Non-available evidence with a value must record limitations; do not invent a current value.",
      ),
    );
  }
}

function validateMaterialRefs(
  refs: unknown,
  path: string,
  issues: ValidationIssue[],
  known: Set<string>,
  requireAtLeastOne: boolean,
): void {
  if (!Array.isArray(refs)) {
    issues.push(issue(path, "type", "refs must be an array."));
    return;
  }
  if (requireAtLeastOne && refs.length === 0) {
    issues.push(
      issue(path, "missing_material_ref", "material conclusions require at least one ref."),
    );
  }
  refs.forEach((ref, index) => {
    if (!isObject(ref) || !isNonEmptyString(ref.ref_id)) {
      issues.push(issue(`${path}[${index}]`, "type", "ref must include ref_id."));
      return;
    }
    if (
      ref.kind !== "confirmed_input" &&
      ref.kind !== "derived" &&
      ref.kind !== "evidence"
    ) {
      issues.push(issue(`${path}[${index}].kind`, "enum", "invalid ref kind."));
    }
    if (!known.has(ref.ref_id)) {
      issues.push(
        issue(
          `${path}[${index}].ref_id`,
          "unknown_ref",
          `Reference "${ref.ref_id}" is not present in confirmed inputs, derived results, or evidence.`,
        ),
      );
    }
  });
}

function validateAdvice(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
  known: Set<string>,
): asserts value is DirectionalAdvice {
  if (!isObject(value)) {
    issues.push(issue(path, "type", "advice must be an object."));
    return;
  }
  if (!isNonEmptyString(value.id)) {
    issues.push(issue(`${path}.id`, "required", "advice id is required."));
  }
  if (!includesConst(DIRECTIONAL_ADVICE_KINDS, value.kind)) {
    issues.push(issue(`${path}.kind`, "enum", "invalid advice kind."));
  }
  if (!isNonEmptyString(value.statement)) {
    issues.push(issue(`${path}.statement`, "required", "advice statement is required."));
  } else if (!adviceStatementIsAllowed(value.statement)) {
    issues.push(
      issue(
        `${path}.statement`,
        "advice_boundary",
        "Advice must stay qualitative; exact amounts, ratios, prices, or trade times are forbidden.",
      ),
    );
  }
  if (value.urgency !== "routine" && value.urgency !== "attention") {
    issues.push(issue(`${path}.urgency`, "enum", "invalid urgency."));
  }
  validateMaterialRefs(value.trigger_refs, `${path}.trigger_refs`, issues, known, true);
}

function validateConclusion(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
  known: Set<string>,
): asserts value is Conclusion {
  if (!isObject(value)) {
    issues.push(issue(path, "type", "conclusion must be an object."));
    return;
  }
  if (!isNonEmptyString(value.id) || !isNonEmptyString(value.statement)) {
    issues.push(issue(path, "required", "conclusion id and statement are required."));
  }
  if (!includesConst(PROVENANCE_KINDS, value.provenance)) {
    issues.push(issue(`${path}.provenance`, "enum", "invalid provenance."));
  }
  if (typeof value.affected_by_unknowns !== "boolean") {
    issues.push(
      issue(`${path}.affected_by_unknowns`, "type", "affected_by_unknowns must be boolean."),
    );
  }
  // generated conclusions still need refs to observed/derived material for material claims
  validateMaterialRefs(value.refs, `${path}.refs`, issues, known, true);
}

export function validateAnalysisResult(
  value: unknown,
): ValidateResult<AnalysisResult> {
  const issues: ValidationIssue[] = [];
  issues.push(...scanPrivacy(value));
  if (!isObject(value)) {
    return {
      ok: false,
      issues: [issue("", "type", "analysis result must be an object.")],
    };
  }
  requireContractsVersion(value.contracts_version, "contracts_version", issues);
  for (const key of [
    "analysis_id",
    "snapshot_id",
    "theme_id",
  ] as const) {
    if (!isNonEmptyString(value[key])) {
      issues.push(issue(key, "required", `${key} is required.`));
    }
  }
  if (!includesConst(ANALYSIS_RESULT_STATUSES, value.status)) {
    issues.push(issue("status", "enum", "invalid analysis status."));
  }
  if (
    !isIsoDateTime(value.analysis_started_at) ||
    !isIsoDateTime(value.analysis_completed_at) ||
    !isIsoDateTime(value.evidence_cutoff_at)
  ) {
    issues.push(
      issue(
        "analysis_started_at",
        "type",
        "analysis and cutoff timestamps must be ISO datetime.",
      ),
    );
  }
  if (!isIsoDate(value.latest_complete_trading_day)) {
    issues.push(
      issue(
        "latest_complete_trading_day",
        "type",
        "latest_complete_trading_day must be YYYY-MM-DD.",
      ),
    );
  }
  validateConstraints(value.constraints, "constraints", issues);

  if (!isObject(value.coverage)) {
    issues.push(issue("coverage", "type", "coverage must be an object."));
  }

  const known = new Set<string>();
  if (Array.isArray(value.evidence)) {
    value.evidence.forEach((item, index) => {
      validateEvidenceRecord(item, `evidence[${index}]`, issues);
      if (isObject(item) && isNonEmptyString(item.id)) {
        known.add(item.id);
      }
    });
  } else {
    issues.push(issue("evidence", "type", "evidence must be an array."));
  }

  if (Array.isArray(value.derived)) {
    value.derived.forEach((item, index) => {
      if (!isObject(item) || !isNonEmptyString(item.id)) {
        issues.push(issue(`derived[${index}]`, "type", "derived item invalid."));
        return;
      }
      if (item.provenance !== "derived") {
        issues.push(
          issue(`derived[${index}].provenance`, "enum", "derived provenance must be derived."),
        );
      }
      known.add(item.id);
    });
  } else {
    issues.push(issue("derived", "type", "derived must be an array."));
  }

  // Confirmed input refs use line_id style ids; accept any confirmed_input ref that looks non-empty
  // by allowing snapshot line ids encoded as `line:*` or raw line ids present in coverage.
  if (isObject(value.coverage)) {
    for (const key of [
      "covered_line_ids",
      "uncovered_line_ids",
      "unsupported_line_ids",
    ] as const) {
      const list = value.coverage[key];
      if (Array.isArray(list)) {
        for (const id of list) {
          if (typeof id === "string") {
            known.add(id);
          }
        }
      }
    }
  }

  if (Array.isArray(value.conclusions)) {
    value.conclusions.forEach((item, index) => {
      validateConclusion(item, `conclusions[${index}]`, issues, known);
    });
  } else {
    issues.push(issue("conclusions", "type", "conclusions must be an array."));
  }

  if (Array.isArray(value.advice)) {
    value.advice.forEach((item, index) => {
      validateAdvice(item, `advice[${index}]`, issues, known);
    });
  } else {
    issues.push(issue("advice", "type", "advice must be an array."));
  }

  if (!Array.isArray(value.unknowns) || !Array.isArray(value.risk_notes)) {
    issues.push(issue("unknowns", "type", "unknowns and risk_notes must be arrays."));
  }

  // Status-specific fail-closed rules
  if (value.status === "supported") {
    if (Array.isArray(value.conclusions) && value.conclusions.length === 0) {
      issues.push(
        issue("conclusions", "status_matrix", "supported results need conclusions."),
      );
    }
  }
  if (value.status === "unavailable") {
    if (
      !Array.isArray(value.recovery_actions) ||
      value.recovery_actions.length === 0
    ) {
      issues.push(
        issue(
          "recovery_actions",
          "status_matrix",
          "unavailable results must explain recovery actions.",
        ),
      );
    }
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }
  return { ok: true, value: value as unknown as AnalysisResult };
}

export function validateLongCardData(
  value: unknown,
): ValidateResult<LongCardData> {
  const issues: ValidationIssue[] = [];
  issues.push(...scanPrivacy(value));
  if (!isObject(value)) {
    return {
      ok: false,
      issues: [issue("", "type", "long card data must be an object.")],
    };
  }
  requireContractsVersion(value.contracts_version, "contracts_version", issues);
  if (value.status === "unavailable") {
    issues.push(
      issue(
        "status",
        "status_matrix",
        "unavailable results must not be rendered as a normal long card.",
      ),
    );
  }
  if (
    !includesConst(
      ["supported", "limited", "observation_only"] as const,
      value.status,
    )
  ) {
    issues.push(issue("status", "enum", "invalid long-card status."));
  }
  const snapshotResult = validatePortfolioSnapshot(value.snapshot);
  if (!snapshotResult.ok) {
    issues.push(
      ...snapshotResult.issues.map((item) => ({
        ...item,
        path: item.path ? `snapshot.${item.path}` : "snapshot",
      })),
    );
  }
  if (!isObject(value.front) || !isObject(value.back)) {
    issues.push(issue("front", "required", "front and back presentation are required."));
  }
  if (typeof value.is_example !== "boolean") {
    issues.push(issue("is_example", "type", "is_example must be boolean."));
  }
  if (value.is_example === true && !isNonEmptyString(value.example_label)) {
    issues.push(
      issue(
        "example_label",
        "required",
        "example long cards must carry an explicit example_label.",
      ),
    );
  }
  if (issues.length > 0) {
    return { ok: false, issues };
  }
  return { ok: true, value: value as unknown as LongCardData };
}

export function validateTaskEvent(value: unknown): ValidateResult<TaskEvent> {
  const issues: ValidationIssue[] = [];
  issues.push(...scanPrivacy(value));
  if (!isObject(value)) {
    return {
      ok: false,
      issues: [issue("", "type", "task event must be an object.")],
    };
  }
  if (!isNonEmptyString(value.event_id) || !isNonEmptyString(value.analysis_id)) {
    issues.push(issue("event_id", "required", "event_id and analysis_id are required."));
  }
  if (!includesConst(TASK_EVENT_STAGES, value.stage)) {
    issues.push(issue("stage", "enum", "invalid task stage."));
  }
  if (!includesConst(TASK_EVENT_STATES, value.state)) {
    issues.push(issue("state", "enum", "invalid task state."));
  }
  if (!isIsoDateTime(value.occurred_at)) {
    issues.push(issue("occurred_at", "type", "occurred_at must be ISO datetime."));
  }
  if (issues.length > 0) {
    return { ok: false, issues };
  }
  return { ok: true, value: value as unknown as TaskEvent };
}

export type {
  AnalysisResultStatus,
  EvidenceStatus,
  ProvenanceKind,
  TaskEventStage,
  TaskEventState,
};
