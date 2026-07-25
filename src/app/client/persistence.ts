import { onboardingStorageKey } from "../../features/onboarding/storage.js";
import type { JourneyExperienceSource } from "./source.js";

const ACTIVE_ANALYSIS_PREFIX = "mandong.active-analysis";
const ANALYSIS_SOURCE_PREFIX = "mandong.analysis-source";
const EXPERIENCE_SOURCE_PREFIX = "mandong.experience-source";
const REDUCED_MOTION_PREFIX = "mandong.reduced-motion";
const REVIEW_COACHMARK_PREFIX = "mandong.review-coachmark-dismissed";

export interface JourneyKeyValueStorage {
  getItem(key: string): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}

export interface JourneyPersistence {
  clearActiveAnalysis(workspaceId: string): void;
  clearOnboarding(workspaceId: string): void;
  clearWorkspace(workspaceId: string): void;
  getActiveAnalysis(workspaceId: string): string | null;
  getAnalysisExperienceSource(
    workspaceId: string,
    analysisId: string,
  ): JourneyExperienceSource | null;
  getExperienceSource(workspaceId: string): JourneyExperienceSource | null;
  getReducedMotion(workspaceId: string): boolean | null;
  getReviewCoachmarkDismissed(workspaceId: string): boolean;
  setActiveAnalysis(workspaceId: string, analysisId: string): void;
  setAnalysisExperienceSource(
    workspaceId: string,
    analysisId: string,
    source: JourneyExperienceSource,
  ): void;
  setExperienceSource(workspaceId: string, source: JourneyExperienceSource): void;
  setReducedMotion(workspaceId: string, enabled: boolean): void;
  setReviewCoachmarkDismissed(workspaceId: string): void;
}

function scoped(prefix: string, workspaceId: string): string {
  return `${prefix}.${workspaceId}`;
}

export function createJourneyPersistence(
  storage: JourneyKeyValueStorage | null,
): JourneyPersistence {
  const safeGet = (key: string): string | null => {
    if (!storage) return null;
    try {
      return storage.getItem(key);
    } catch {
      return null;
    }
  };
  const safeSet = (key: string, value: string): void => {
    try {
      storage?.setItem(key, value);
    } catch {
      // Browser storage is optional; the durable server remains authoritative.
    }
  };
  const safeRemove = (key: string): void => {
    try {
      storage?.removeItem(key);
    } catch {
      // Browser storage is optional; the durable server remains authoritative.
    }
  };
  const analysisSources = (workspaceId: string): Record<string, JourneyExperienceSource> => {
    const raw = safeGet(scoped(ANALYSIS_SOURCE_PREFIX, workspaceId));
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
      return Object.fromEntries(
        Object.entries(parsed).filter(
          ([analysisId, source]) =>
            /^[A-Za-z0-9_-]{1,160}$/.test(analysisId) &&
            (source === "random" || source === "edited"),
        ),
      );
    } catch {
      return {};
    }
  };

  return {
    clearActiveAnalysis(workspaceId) {
      safeRemove(scoped(ACTIVE_ANALYSIS_PREFIX, workspaceId));
    },
    clearOnboarding(workspaceId) {
      safeRemove(onboardingStorageKey(workspaceId));
    },
    clearWorkspace(workspaceId) {
      safeRemove(scoped(ACTIVE_ANALYSIS_PREFIX, workspaceId));
      safeRemove(scoped(ANALYSIS_SOURCE_PREFIX, workspaceId));
      safeRemove(scoped(EXPERIENCE_SOURCE_PREFIX, workspaceId));
      safeRemove(scoped(REDUCED_MOTION_PREFIX, workspaceId));
      safeRemove(scoped(REVIEW_COACHMARK_PREFIX, workspaceId));
      safeRemove(onboardingStorageKey(workspaceId));
    },
    getActiveAnalysis(workspaceId) {
      const value = safeGet(scoped(ACTIVE_ANALYSIS_PREFIX, workspaceId));
      return value && /^[A-Za-z0-9_-]{1,160}$/.test(value) ? value : null;
    },
    getAnalysisExperienceSource(workspaceId, analysisId) {
      return analysisSources(workspaceId)[analysisId] ?? null;
    },
    getExperienceSource(workspaceId) {
      const value = safeGet(scoped(EXPERIENCE_SOURCE_PREFIX, workspaceId));
      return value === "random" || value === "edited" ? value : null;
    },
    getReducedMotion(workspaceId) {
      const value = safeGet(scoped(REDUCED_MOTION_PREFIX, workspaceId));
      return value === "true" ? true : value === "false" ? false : null;
    },
    getReviewCoachmarkDismissed(workspaceId) {
      return safeGet(scoped(REVIEW_COACHMARK_PREFIX, workspaceId)) === "true";
    },
    setActiveAnalysis(workspaceId, analysisId) {
      safeSet(scoped(ACTIVE_ANALYSIS_PREFIX, workspaceId), analysisId);
    },
    setAnalysisExperienceSource(workspaceId, analysisId, source) {
      if (!/^[A-Za-z0-9_-]{1,160}$/.test(analysisId)) return;
      safeSet(
        scoped(ANALYSIS_SOURCE_PREFIX, workspaceId),
        JSON.stringify({ ...analysisSources(workspaceId), [analysisId]: source }),
      );
    },
    setExperienceSource(workspaceId, source) {
      safeSet(scoped(EXPERIENCE_SOURCE_PREFIX, workspaceId), source);
    },
    setReducedMotion(workspaceId, enabled) {
      safeSet(scoped(REDUCED_MOTION_PREFIX, workspaceId), String(enabled));
    },
    setReviewCoachmarkDismissed(workspaceId) {
      safeSet(scoped(REVIEW_COACHMARK_PREFIX, workspaceId), "true");
    },
  };
}

export function getBrowserJourneyStorage(): JourneyKeyValueStorage | null {
  try {
    return (globalThis as { localStorage?: JourneyKeyValueStorage }).localStorage ?? null;
  } catch {
    return null;
  }
}
