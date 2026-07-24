import { onboardingStorageKey } from "../../features/onboarding/storage.js";

const ACTIVE_ANALYSIS_PREFIX = "mandong.active-analysis";
const REDUCED_MOTION_PREFIX = "mandong.reduced-motion";

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
  getReducedMotion(workspaceId: string): boolean | null;
  setActiveAnalysis(workspaceId: string, analysisId: string): void;
  setReducedMotion(workspaceId: string, enabled: boolean): void;
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

  return {
    clearActiveAnalysis(workspaceId) {
      safeRemove(scoped(ACTIVE_ANALYSIS_PREFIX, workspaceId));
    },
    clearOnboarding(workspaceId) {
      safeRemove(onboardingStorageKey(workspaceId));
    },
    clearWorkspace(workspaceId) {
      safeRemove(scoped(ACTIVE_ANALYSIS_PREFIX, workspaceId));
      safeRemove(scoped(REDUCED_MOTION_PREFIX, workspaceId));
      safeRemove(onboardingStorageKey(workspaceId));
    },
    getActiveAnalysis(workspaceId) {
      const value = safeGet(scoped(ACTIVE_ANALYSIS_PREFIX, workspaceId));
      return value && /^[A-Za-z0-9_-]{1,160}$/.test(value) ? value : null;
    },
    getReducedMotion(workspaceId) {
      const value = safeGet(scoped(REDUCED_MOTION_PREFIX, workspaceId));
      return value === "true" ? true : value === "false" ? false : null;
    },
    setActiveAnalysis(workspaceId, analysisId) {
      safeSet(scoped(ACTIVE_ANALYSIS_PREFIX, workspaceId), analysisId);
    },
    setReducedMotion(workspaceId, enabled) {
      safeSet(scoped(REDUCED_MOTION_PREFIX, workspaceId), String(enabled));
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
