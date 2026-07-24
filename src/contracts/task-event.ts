/**
 * Observatory task events: typed stages only.
 * Stage state must come from real tasks, never synthetic progress timers.
 */

import type {
  IsoDateTimeString,
  TaskEventStage,
  TaskEventState,
} from "./common.js";

export interface TaskEvent {
  event_id: string;
  analysis_id: string;
  stage: TaskEventStage;
  state: TaskEventState;
  message?: string;
  /** Counts and coverage labels only — never full private holdings. */
  covered_count?: number;
  retry_count?: number;
  occurred_at: IsoDateTimeString;
}
