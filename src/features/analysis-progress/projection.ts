import {
  TASK_EVENT_STAGES,
  type AnalysisResultStatus,
  type TaskEvent,
  type TaskEventStage,
  type TaskEventState,
} from "../../contracts/index.js";

export type AnalysisConnectionState =
  | "connecting"
  | "connected"
  | "disconnected"
  | "reconnecting"
  | "recovered";

export type AnalysisProgressTerminalReason =
  | "completed"
  | "cancelled"
  | "deadline"
  | "invalid_input"
  | "model_failure"
  | "persistence_failure";

export interface AnalysisProgressTerminal {
  analysis_id: string;
  /** Set only after the controller has both a validated result and matching narrative. */
  displayable: boolean;
  reason?: string;
  status: AnalysisResultStatus;
  terminal_reason: AnalysisProgressTerminalReason;
}

export interface ProjectAnalysisProgressInput {
  analysisId: string;
  connection: AnalysisConnectionState;
  events: readonly TaskEvent[];
  terminal?: AnalysisProgressTerminal;
}

export type AnalysisProgressPhase =
  | "waiting"
  | "active"
  | "retrying"
  | "interrupted"
  | "terminal";

export type AnalysisProgressStageState = TaskEventState | "not_reported";

export interface AnalysisProgressStageItem {
  coveredCount?: number;
  detail?: string;
  isCurrent: boolean;
  label: string;
  occurredAt?: string;
  retryCount?: number;
  stage: TaskEventStage;
  state: AnalysisProgressStageState;
  stateLabel: string;
}

export interface AnalysisProgressLogLine {
  id: string;
  text: string;
}

export interface AnalysisProgressViewModel {
  analysisId: string;
  canOpenResult: boolean;
  canRetry: boolean;
  connection: AnalysisConnectionState;
  connectionLabel: string;
  coveredCount?: number;
  currentMessage: string;
  currentStage?: TaskEventStage;
  isTerminal: boolean;
  latestEventId?: string;
  /** Last few task-event messages, oldest first, capped at MAX_LOG_LINES. */
  logLines: AnalysisProgressLogLine[];
  phase: AnalysisProgressPhase;
  stages: AnalysisProgressStageItem[];
  terminal?: AnalysisProgressTerminal;
}

export const MAX_LOG_LINES = 3;

export function streamHeadingMessages(text: string | undefined): string[] {
  if (!text) return [];
  const seen = new Set<string>();
  const messages: string[] = [];
  for (const line of text.split(/\r?\n/u)) {
    const match = /^\s{0,3}#{1,6}[\t ]*(.+?)\s*#*\s*$/u.exec(line);
    const title = match?.[1]
      ?.replace(/\[([^\]]+)\]\([^)]*\)/gu, "$1")
      .replace(/[*_`~#]/gu, "")
      .replace(/^\s*(?:\d+[.)、]\s*)?/u, "")
      .replace(/\s+/gu, " ")
      .trim()
      .slice(0, 48);
    if (!title) continue;
    const message = `正在生成 ${title}`;
    if (seen.has(message)) continue;
    seen.add(message);
    messages.push(message);
  }
  return messages;
}

const STAGE_LABELS: Record<TaskEventStage, string> = {
  validate_snapshot: "冻结快照",
  resolve_assets: "解析覆盖",
  fetch_structured_data: "结构化数据",
  discover_and_verify_events: "事件发现与核验",
  derive_exposure_and_constraints: "可复算派生",
  form_conclusions_and_advice: "结论与建议",
  render_theme_and_validate_output: "主题叙事",
  persist_or_return: "保存结果",
};

const STATE_LABELS: Record<AnalysisProgressStageState, string> = {
  not_reported: "尚无任务事件",
  pending: "等待执行",
  running: "正在执行",
  retrying: "有限重试",
  succeeded: "已完成",
  failed: "执行失败",
  cancelled: "已取消",
  timed_out: "达到硬截止",
};

const STAGE_BUBBLES: Record<TaskEventStage, Record<TaskEventState, string>> = {
  validate_snapshot: {
    pending: "准备冻结确认快照",
    running: "正在冻结确认快照",
    retrying: "冻结快照有限重试",
    succeeded: "确认快照已冻结",
    failed: "冻结确认快照失败",
    cancelled: "冻结确认快照已取消",
    timed_out: "冻结确认快照已超时",
  },
  resolve_assets: {
    pending: "准备解析持仓覆盖",
    running: "正在解析持仓覆盖",
    retrying: "解析覆盖有限重试",
    succeeded: "持仓覆盖已解析",
    failed: "解析持仓覆盖失败",
    cancelled: "解析持仓覆盖已取消",
    timed_out: "解析持仓覆盖已超时",
  },
  fetch_structured_data: {
    pending: "准备获取结构化数据",
    running: "正在获取结构化数据",
    retrying: "结构化数据有限重试",
    succeeded: "结构化数据已核对",
    failed: "结构化数据获取失败",
    cancelled: "结构化数据获取已取消",
    timed_out: "结构化数据获取已超时",
  },
  discover_and_verify_events: {
    pending: "准备发现并核验事件",
    running: "正在发现并核验事件",
    retrying: "事件核验有限重试",
    succeeded: "相关事件已核验",
    failed: "事件发现或核验失败",
    cancelled: "事件核验已取消",
    timed_out: "事件核验已超时",
  },
  derive_exposure_and_constraints: {
    pending: "准备计算覆盖与约束",
    running: "正在计算覆盖与约束",
    retrying: "派生计算有限重试",
    succeeded: "覆盖与约束已计算",
    failed: "覆盖与约束计算失败",
    cancelled: "派生计算已取消",
    timed_out: "派生计算已超时",
  },
  form_conclusions_and_advice: {
    pending: "准备形成结论与建议",
    running: "正在形成结论与建议",
    retrying: "结论校验有限重试",
    succeeded: "结论与建议已校验",
    failed: "结论与建议校验失败",
    cancelled: "结论生成已取消",
    timed_out: "结论生成已超时",
  },
  render_theme_and_validate_output: {
    pending: "准备生成主题叙事",
    running: "正在生成主题叙事",
    retrying: "主题叙事有限重试",
    succeeded: "主题叙事已校验",
    failed: "主题叙事校验失败",
    cancelled: "主题叙事已取消",
    timed_out: "主题叙事已超时",
  },
  persist_or_return: {
    pending: "准备保存分析结果",
    running: "正在保存分析结果",
    retrying: "保存结果有限重试",
    succeeded: "分析结果已保存",
    failed: "分析结果保存失败",
    cancelled: "保存分析结果已取消",
    timed_out: "保存分析结果已超时",
  },
};

const CONNECTION_CONTENT: Record<AnalysisConnectionState, { label: string; message: string }> = {
  connecting: { label: "正在连接", message: "正在连接分析任务" },
  connected: { label: "连接正常", message: "等待首条真实任务事件" },
  disconnected: { label: "连接中断", message: "连接中断，状态已保留" },
  reconnecting: { label: "正在恢复连接", message: "正在恢复任务连接" },
  recovered: { label: "连接已恢复", message: "连接已恢复，继续接收" },
};

const TERMINAL_MESSAGES: Record<AnalysisResultStatus, string> = {
  supported: "复盘完成，可查看结果",
  limited: "复盘完成，结论受限",
  observation_only: "复盘完成，仅供观察",
  unavailable: "分析不可用，可重试",
};

const RETRYABLE_TERMINAL_REASONS = new Set<AnalysisProgressTerminalReason>([
  "cancelled",
  "deadline",
  "model_failure",
  "persistence_failure",
]);

function uniqueTaskEvents(analysisId: string, events: readonly TaskEvent[]): TaskEvent[] {
  const seen = new Set<string>();
  return events.filter((event) => {
    if (event.analysis_id !== analysisId || seen.has(event.event_id)) return false;
    seen.add(event.event_id);
    return true;
  });
}

function stageItem(
  stage: TaskEventStage,
  event: TaskEvent | undefined,
  currentStage: TaskEventStage | undefined,
): AnalysisProgressStageItem {
  if (!event) {
    return {
      isCurrent: false,
      label: STAGE_LABELS[stage],
      stage,
      state: "not_reported",
      stateLabel: STATE_LABELS.not_reported,
    };
  }

  return {
    ...(event.covered_count === undefined ? {} : { coveredCount: event.covered_count }),
    ...(event.message === undefined ? {} : { detail: event.message }),
    isCurrent: stage === currentStage,
    label: STAGE_LABELS[stage],
    occurredAt: event.occurred_at,
    ...(event.retry_count === undefined ? {} : { retryCount: event.retry_count }),
    stage,
    state: event.state,
    stateLabel: STATE_LABELS[event.state],
  };
}

export function projectAnalysisProgress({
  analysisId,
  connection,
  events,
  terminal: candidateTerminal,
}: ProjectAnalysisProgressInput): AnalysisProgressViewModel {
  const taskEvents = uniqueTaskEvents(analysisId, events);
  const latestByStage = new Map<TaskEventStage, TaskEvent>();
  let coveredCount: number | undefined;

  for (const event of taskEvents) {
    latestByStage.set(event.stage, event);
    if (event.covered_count !== undefined) coveredCount = event.covered_count;
  }

  const latestEvent = taskEvents.at(-1);
  const terminal = candidateTerminal?.analysis_id === analysisId ? candidateTerminal : undefined;
  const currentStage = latestEvent?.stage;
  const connectionContent = CONNECTION_CONTENT[connection];
  let currentMessage = connectionContent.message;
  let phase: AnalysisProgressPhase = "waiting";

  if (terminal) {
    currentMessage = TERMINAL_MESSAGES[terminal.status];
    phase = "terminal";
  } else if (connection === "disconnected" || connection === "reconnecting") {
    phase = "interrupted";
  } else if (connection === "recovered") {
    phase = "waiting";
  } else if (latestEvent) {
    currentMessage = STAGE_BUBBLES[latestEvent.stage][latestEvent.state];
    if (["failed", "cancelled", "timed_out"].includes(latestEvent.state)) {
      phase = "interrupted";
    } else {
      phase = latestEvent.state === "retrying" ? "retrying" : "active";
    }
  }

  const logLines: AnalysisProgressLogLine[] = taskEvents.slice(-MAX_LOG_LINES).map((event) => ({
    id: event.event_id,
    text: event.message ?? STAGE_BUBBLES[event.stage][event.state],
  }));

  return {
    analysisId,
    canOpenResult:
      terminal !== undefined && terminal.displayable && terminal.status !== "unavailable",
    canRetry:
      terminal !== undefined &&
      (terminal.status === "unavailable" || RETRYABLE_TERMINAL_REASONS.has(terminal.terminal_reason)),
    connection,
    connectionLabel: connectionContent.label,
    ...(coveredCount === undefined ? {} : { coveredCount }),
    currentMessage,
    ...(currentStage === undefined ? {} : { currentStage }),
    isTerminal: terminal !== undefined,
    ...(latestEvent === undefined ? {} : { latestEventId: latestEvent.event_id }),
    logLines,
    phase,
    stages: TASK_EVENT_STAGES.map((stage) => stageItem(stage, latestByStage.get(stage), currentStage)),
    ...(terminal === undefined ? {} : { terminal }),
  };
}

export interface AnalysisAnimationState {
  connection: AnalysisConnectionState;
  inViewport: boolean;
  isTerminal: boolean;
  pageVisible: boolean;
  phase: AnalysisProgressPhase;
  reduceMotion: boolean;
}

export function shouldAnimateAnalysisProgress(state: AnalysisAnimationState): boolean {
  const connected = state.connection === "connected" || state.connection === "recovered";
  return (
    connected &&
    state.inViewport &&
    state.pageVisible &&
    state.phase !== "interrupted" &&
    !state.reduceMotion &&
    !state.isTerminal
  );
}
