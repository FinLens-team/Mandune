import { describe, expect, it } from "vitest";
import {
  hasCompletedOnboarding,
  markOnboardingCompleted,
  onboardingStorageKey,
  type OnboardingStorage,
} from "../../src/features/onboarding/storage.js";

class MemoryStorage implements OnboardingStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe("workspace-scoped onboarding state", () => {
  it("marks only the completed workspace without storing an identity payload", () => {
    const storage = new MemoryStorage();

    expect(hasCompletedOnboarding(storage, "ws-a")).toBe(false);
    expect(markOnboardingCompleted(storage, "ws-a", "2026-07-25T08:00:00.000Z")).toBe(true);
    expect(hasCompletedOnboarding(storage, "ws-a")).toBe(true);
    expect(hasCompletedOnboarding(storage, "ws-b")).toBe(false);

    const raw = storage.values.get(onboardingStorageKey("ws-a"));
    expect(raw).toContain("completed_at");
    expect(raw).not.toContain("holdings");
    expect(raw).not.toContain("constraints");
  });

  it("fails closed for malformed or unavailable storage", () => {
    const malformed = new MemoryStorage();
    malformed.values.set(onboardingStorageKey("ws-a"), "not-json");
    const throwing: OnboardingStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };

    expect(hasCompletedOnboarding(malformed, "ws-a")).toBe(false);
    expect(hasCompletedOnboarding(throwing, "ws-a")).toBe(false);
    expect(markOnboardingCompleted(throwing, "ws-a", "2026-07-25T08:00:00.000Z")).toBe(false);
  });
});
