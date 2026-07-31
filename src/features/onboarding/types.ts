import type { PortfolioDraft } from "../../contracts/index.js";
import type { DemoExperienceIdentity } from "../../demo-experience/index.js";
import type { ThemeId } from "../../theme/index.js";

export type OnboardingStep = "s0" | "s1" | "s2" | "s3" | "editor" | "ocr" | "complete";

export interface OnboardingExit {
  identity: DemoExperienceIdentity | null;
  draft?: PortfolioDraft;
  returning: boolean;
  themeId: ThemeId;
}
