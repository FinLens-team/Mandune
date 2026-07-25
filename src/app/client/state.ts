import type { PortfolioDraft, TaskEvent } from "../../contracts/index.js";
import type {
  AnalysisConnectionState,
  AnalysisProgressTerminal,
} from "../../features/analysis-progress/projection.js";
import type { WorkspacePublicStatus } from "../../workspace/index.js";
import type { JourneyLongCardRuntimeInput } from "./runtime.js";
import type { JourneyExperienceSource } from "./source.js";

export type JourneyPhase =
  | "booting"
  | "workspace_error"
  | "onboarding"
  | "home"
  | "analysis"
  | "result"
  | "history"
  | "atlas"
  | "about"
  | "deleted";

export interface ActiveJourneyAnalysis {
  analysisId: string;
  connection: AnalysisConnectionState;
  events: TaskEvent[];
  experienceSource: JourneyExperienceSource;
  resultInput?: JourneyLongCardRuntimeInput;
  streamText?: string;
  terminal?: AnalysisProgressTerminal;
}

export interface JourneyState {
  activeAnalysis: ActiveJourneyAnalysis | null;
  displayedResult: JourneyLongCardRuntimeInput | null;
  draft: PortfolioDraft | null;
  draftSaving: boolean;
  experienceSource: JourneyExperienceSource;
  lastAnalysisAt?: string;
  message?: string;
  onboardingRevision: number;
  phase: JourneyPhase;
  reducedMotion: boolean;
  reviewCoachmarkVisible: boolean;
  resultReturn: "home" | "history" | "atlas";
  resumeAnalysisId: string | null;
  resumeAnalysisSource: JourneyExperienceSource | null;
  workspace: WorkspacePublicStatus | null;
}

export type JourneyAction =
  | { type: "BOOT_STARTED" }
  | {
      type: "BOOT_SUCCEEDED";
      workspace: WorkspacePublicStatus;
      draft: PortfolioDraft | null;
      experienceSource: JourneyExperienceSource;
      reducedMotion: boolean;
      reviewCoachmarkVisible: boolean;
      resumeAnalysisId: string | null;
      resumeAnalysisSource: JourneyExperienceSource | null;
    }
  | { type: "WORKSPACE_FAILED"; message: string }
  | { type: "ONBOARDING_RESET" }
  | { type: "ENTER_APP"; draft: PortfolioDraft; resumeAnalysisId: string | null }
  | { type: "DRAFT_CHANGED"; draft: PortfolioDraft }
  | { type: "DRAFT_SAVE_STARTED" }
  | { type: "DRAFT_SAVE_SUCCEEDED"; draft: PortfolioDraft }
  | { type: "DRAFT_SAVE_FAILED"; message: string }
  | { type: "EXPERIENCE_SOURCE_CHANGED"; source: JourneyExperienceSource }
  | { type: "REDUCED_MOTION_CHANGED"; enabled: boolean }
  | { type: "REVIEW_COACHMARK_DISMISSED" }
  | { type: "NAVIGATED"; phase: "home" | "history" | "atlas" | "about" }
  | { type: "ANALYSIS_STARTING" }
  | {
      type: "ANALYSIS_STARTED";
      analysisId: string;
      experienceSource: JourneyExperienceSource;
    }
  | {
      type: "ANALYSIS_REFRESHED";
      analysisId: string;
      connection: AnalysisConnectionState;
      events: TaskEvent[];
    }
  | {
      type: "ANALYSIS_TERMINAL";
      analysisId: string;
      terminal: AnalysisProgressTerminal;
      resultInput?: JourneyLongCardRuntimeInput;
      completedAt?: string;
    }
  | { type: "ANALYSIS_DISCONNECTED"; analysisId: string; message: string }
  | { type: "ANALYSIS_STREAM_UPDATED"; analysisId: string; text: string }
  | { type: "ANALYSIS_LEFT" }
  | {
      type: "ANALYSIS_RESUMED";
      analysisId: string;
      experienceSource: JourneyExperienceSource;
    }
  | { type: "RESULT_OPENED"; input: JourneyLongCardRuntimeInput; returnTo: "home" | "history" | "atlas" }
  | { type: "TERMINAL_CLEARED" }
  | { type: "HISTORY_RECORD_FAILED"; message: string }
  | { type: "WORKSPACE_DELETED" };

export const initialJourneyState: JourneyState = {
  activeAnalysis: null,
  displayedResult: null,
  draft: null,
  draftSaving: false,
  experienceSource: "random",
  onboardingRevision: 0,
  phase: "booting",
  reducedMotion: false,
  reviewCoachmarkVisible: true,
  resultReturn: "home",
  resumeAnalysisId: null,
  resumeAnalysisSource: null,
  workspace: null,
};

export function journeyReducer(state: JourneyState, action: JourneyAction): JourneyState {
  switch (action.type) {
    case "BOOT_STARTED":
      return { ...initialJourneyState, onboardingRevision: state.onboardingRevision };
    case "BOOT_SUCCEEDED":
      return {
        ...state,
        activeAnalysis: null,
        displayedResult: null,
        draft: action.draft,
        draftSaving: false,
        experienceSource: action.experienceSource,
        message: undefined,
        phase: "onboarding",
        reducedMotion: action.reducedMotion,
        reviewCoachmarkVisible: action.reviewCoachmarkVisible,
        resumeAnalysisId: action.resumeAnalysisId,
        resumeAnalysisSource: action.resumeAnalysisSource,
        workspace: action.workspace,
      };
    case "WORKSPACE_FAILED":
      return {
        ...state,
        activeAnalysis: null,
        draftSaving: false,
        message: action.message,
        phase: "workspace_error",
        workspace: state.workspace,
      };
    case "ONBOARDING_RESET":
      return {
        ...state,
        message: undefined,
        onboardingRevision: state.onboardingRevision + 1,
        phase: "onboarding",
        resumeAnalysisId: null,
        resumeAnalysisSource: null,
      };
    case "ENTER_APP": {
      const activeAnalysis = action.resumeAnalysisId
        ? {
            analysisId: action.resumeAnalysisId,
            connection: "connecting" as const,
            events: [],
            experienceSource: state.resumeAnalysisSource ?? "random",
          }
        : null;
      return {
        ...state,
        activeAnalysis,
        displayedResult: null,
        draft: action.draft,
        draftSaving: false,
        message: undefined,
        phase: activeAnalysis ? "analysis" : "home",
        resumeAnalysisId: action.resumeAnalysisId,
        resumeAnalysisSource: activeAnalysis?.experienceSource ?? null,
      };
    }
    case "DRAFT_CHANGED":
      return { ...state, draft: action.draft, draftSaving: true, message: undefined };
    case "DRAFT_SAVE_STARTED":
      return { ...state, draftSaving: true, message: undefined };
    case "DRAFT_SAVE_SUCCEEDED":
      return { ...state, draft: action.draft, draftSaving: false, message: undefined };
    case "DRAFT_SAVE_FAILED":
      return { ...state, draftSaving: false, message: action.message };
    case "EXPERIENCE_SOURCE_CHANGED":
      return { ...state, experienceSource: action.source };
    case "REDUCED_MOTION_CHANGED":
      return { ...state, reducedMotion: action.enabled };
    case "REVIEW_COACHMARK_DISMISSED":
      return { ...state, reviewCoachmarkVisible: false };
    case "NAVIGATED":
      return { ...state, displayedResult: null, message: undefined, phase: action.phase };
    case "ANALYSIS_STARTING":
      return { ...state, draftSaving: true, message: undefined };
    case "ANALYSIS_STARTED":
      return {
        ...state,
        activeAnalysis: {
          analysisId: action.analysisId,
          connection: "connecting",
          events: [],
          experienceSource: action.experienceSource,
        },
        displayedResult: null,
        draftSaving: false,
        message: undefined,
        phase: "analysis",
        resumeAnalysisId: action.analysisId,
        resumeAnalysisSource: action.experienceSource,
      };
    case "ANALYSIS_REFRESHED":
      if (state.activeAnalysis?.analysisId !== action.analysisId) return state;
      return {
        ...state,
        activeAnalysis: {
          ...state.activeAnalysis,
          connection: action.connection,
          events: action.events,
        },
        message: undefined,
      };
    case "ANALYSIS_TERMINAL":
      if (state.activeAnalysis?.analysisId !== action.analysisId) return state;
      return {
        ...state,
        activeAnalysis: {
          ...state.activeAnalysis,
          connection: "connected",
          terminal: action.terminal,
          ...(action.resultInput ? { resultInput: action.resultInput } : {}),
        },
        ...(action.completedAt ? { lastAnalysisAt: action.completedAt } : {}),
        message: action.terminal.reason,
      };
    case "ANALYSIS_DISCONNECTED":
      if (state.activeAnalysis?.analysisId !== action.analysisId) return state;
      return {
        ...state,
        activeAnalysis: {
          ...state.activeAnalysis,
          connection:
            state.activeAnalysis.connection === "connected" ||
            state.activeAnalysis.connection === "recovered"
              ? "disconnected"
              : "reconnecting",
        },
        message: action.message,
      };
    case "ANALYSIS_STREAM_UPDATED":
      if (state.activeAnalysis?.analysisId !== action.analysisId) return state;
      return {
        ...state,
        activeAnalysis: { ...state.activeAnalysis, streamText: action.text },
      };
    case "ANALYSIS_LEFT":
      return { ...state, message: undefined, phase: "home" };
    case "ANALYSIS_RESUMED": {
      const activeAnalysis = state.activeAnalysis?.analysisId === action.analysisId
        ? { ...state.activeAnalysis, connection: "reconnecting" as const }
        : {
            analysisId: action.analysisId,
            connection: "connecting" as const,
            events: [],
            experienceSource: action.experienceSource,
          };
      return {
        ...state,
        activeAnalysis,
        message: undefined,
        phase: "analysis",
        resumeAnalysisId: action.analysisId,
        resumeAnalysisSource: activeAnalysis.experienceSource,
      };
    }
    case "RESULT_OPENED":
      return {
        ...state,
        message: undefined,
        phase: "result",
        resultReturn: action.returnTo,
        displayedResult: action.input,
        activeAnalysis:
          action.returnTo === "home" && state.activeAnalysis
            ? { ...state.activeAnalysis, resultInput: action.input }
            : state.activeAnalysis,
      };
    case "TERMINAL_CLEARED":
      return {
        ...state,
        activeAnalysis: null,
        displayedResult: null,
        message: undefined,
        phase: "home",
        resumeAnalysisId: null,
        resumeAnalysisSource: null,
      };
    case "HISTORY_RECORD_FAILED":
      return {
        ...state,
        displayedResult: null,
        message: action.message,
        phase: "history",
      };
    case "WORKSPACE_DELETED":
      return {
        ...initialJourneyState,
        onboardingRevision: state.onboardingRevision + 1,
        phase: "deleted",
      };
  }
}
