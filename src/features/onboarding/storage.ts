export const ONBOARDING_STORAGE_PREFIX = "mandong.onboarded";

export interface OnboardingStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface OnboardingRecord {
  version: 1;
  completed_at: string;
}

export function onboardingStorageKey(workspaceId: string): string {
  return `${ONBOARDING_STORAGE_PREFIX}.${workspaceId}`;
}

export function getBrowserOnboardingStorage(): OnboardingStorage | null {
  try {
    return (globalThis as { localStorage?: OnboardingStorage }).localStorage ?? null;
  } catch {
    return null;
  }
}

export function hasCompletedOnboarding(
  storage: OnboardingStorage | null,
  workspaceId: string,
): boolean {
  if (!storage) return false;
  try {
    const raw = storage.getItem(onboardingStorageKey(workspaceId));
    if (!raw) return false;
    const parsed = JSON.parse(raw) as Partial<OnboardingRecord>;
    return parsed.version === 1 && typeof parsed.completed_at === "string";
  } catch {
    return false;
  }
}

export function markOnboardingCompleted(
  storage: OnboardingStorage | null,
  workspaceId: string,
  completedAt: string,
): boolean {
  if (!storage) return false;
  const record: OnboardingRecord = {
    version: 1,
    completed_at: completedAt,
  };
  try {
    storage.setItem(onboardingStorageKey(workspaceId), JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}
