import type { DemoExperienceIdentity } from "../../demo-experience/index.js";
import type { ThemeId } from "../../theme/index.js";

export type OnboardingStep = "s0" | "s1" | "s2" | "s3" | "complete";

export interface OnboardingExit {
  identity: DemoExperienceIdentity | null;
  returning: boolean;
  themeId: ThemeId;
}
