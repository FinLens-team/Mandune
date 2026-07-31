import { useCallback, useEffect, useRef, useState } from "react";
import type { DraftLine, PortfolioDraft } from "../../contracts/index.js";
import { addLine, createEmptyDraft } from "../../portfolio/index.js";
import { PortfolioEditor } from "../review/ReviewPage.js";
import { ScreenshotImportPanel } from "../screenshot-import/ScreenshotImportPanel.js";
import {
  createRandomDemoExperience,
  rerollDemoExperience,
  type DemoExperienceIdentity,
} from "../../demo-experience/index.js";
import {
  getBrowserOnboardingStorage,
  hasCompletedOnboarding,
  markOnboardingCompleted,
  type OnboardingStorage,
} from "./storage.js";
import { BrandBanner } from "../../client/ui/index.js";
import {
  ExperienceSummaryScreen,
  SourceSelectionScreen,
  SplashScreen,
  ThemeSelectionScreen,
} from "./Screens.js";
import type { OnboardingExit, OnboardingStep } from "./types.js";
import { DEFAULT_THEME_ID, type ThemeId } from "../../theme/index.js";
import "./styles.css";

export interface OnboardingFlowProps {
  initialThemeId?: ThemeId;
  workspaceId: string;
  onEnterApp: (exit: OnboardingExit) => void;
  storage?: OnboardingStorage | null;
  random?: () => number;
  now?: () => Date;
  reducedMotion?: boolean;
}

export function OnboardingFlow({
  initialThemeId = DEFAULT_THEME_ID,
  workspaceId,
  onEnterApp,
  storage = getBrowserOnboardingStorage(),
  random = Math.random,
  now = () => new Date(),
  reducedMotion = false,
}: OnboardingFlowProps) {
  const returningVisit = useRef(hasCompletedOnboarding(storage, workspaceId));
  const [step, setStep] = useState<OnboardingStep>("s0");
  const [splashLeaving, setSplashLeaving] = useState(false);
  const [splashReady, setSplashReady] = useState(false);
  const [selectedThemeId, setSelectedThemeId] = useState<ThemeId>(initialThemeId);
  const [identity, setIdentity] = useState<DemoExperienceIdentity | null>(null);
  const [draft, setDraft] = useState<PortfolioDraft | null>(null);
  const [keyboardNavigation, setKeyboardNavigation] = useState(false);
  const [motionDirection, setMotionDirection] = useState<"back" | "forward">("forward");
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false,
  );
  const titleRef = useRef<HTMLHeadingElement>(null);
  const notifiedReturningVisit = useRef(false);
  const effectiveReducedMotion = reducedMotion || prefersReducedMotion;

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setPrefersReducedMotion(mediaQuery.matches);
    updatePreference();
    mediaQuery.addEventListener("change", updatePreference);
    return () => mediaQuery.removeEventListener("change", updatePreference);
  }, []);

  // Splash lifecycle: wait for document + fonts ready AND minimum 2 seconds
  useEffect(() => {
    if (step !== "s0") return;
    let cancelled = false;
    const start = Date.now();
    const MIN_DISPLAY = 2000;

    async function waitForReady() {
      // Wait for document and fonts
      if (document.fonts?.ready) {
        await document.fonts.ready;
      }
      // Ensure minimum display time
      const elapsed = Date.now() - start;
      if (elapsed < MIN_DISPLAY) {
        await new Promise((resolve) => setTimeout(resolve, MIN_DISPLAY - elapsed));
      }
      if (!cancelled) setSplashReady(true);
    }

    waitForReady();
    return () => { cancelled = true; };
  }, [step]);

  // When splash is ready, trigger leaving animation
  useEffect(() => {
    if (!splashReady || step !== "s0") return;
    setSplashLeaving(true);
  }, [splashReady, step]);

  // After leaving animation completes, advance to next step
  const onSplashAnimationEnd = useCallback(() => {
    if (!splashLeaving) return;
    if (returningVisit.current) {
      notifiedReturningVisit.current = true;
      setStep("complete");
      onEnterApp({ identity: null, returning: true, themeId: selectedThemeId });
    } else {
      setStep("s1");
    }
  }, [selectedThemeId, splashLeaving, onEnterApp]);

  useEffect(() => {
    if (step === "s1" || step === "s2" || step === "s3" || step === "editor" || step === "ocr") {
      titleRef.current?.focus();
    }
  }, [step]);

  if (step === "complete") {
    return null;
  }

  function chooseRandomExperience(): void {
    setIdentity(createRandomDemoExperience(random, now));
    goToStep("s3", "forward");
  }

  function goToStep(nextStep: OnboardingStep, direction: "back" | "forward"): void {
    setMotionDirection(direction);
    setStep(nextStep);
  }

  function confirmIdentity(): void {
    if (!identity) return;
    markOnboardingCompleted(storage, workspaceId, now().toISOString());
    notifiedReturningVisit.current = true;
    setStep("complete");
    onEnterApp({ identity, returning: false, themeId: selectedThemeId });
  }

  function confirmDraft(confirmedDraft: PortfolioDraft): void {
    markOnboardingCompleted(storage, workspaceId, now().toISOString());
    notifiedReturningVisit.current = true;
    setStep("complete");
    onEnterApp({ identity: null, draft: confirmedDraft, returning: false, themeId: selectedThemeId });
  }

  function startManualEntry(): void {
    setDraft(createEmptyDraft({ source_label: "用户自主录入", entry_method: "manual" }));
    goToStep("editor", "forward");
  }

  function mergeOcrLines(lines: DraftLine[]): void {
    const current = draft ?? createEmptyDraft({ source_label: "本机 OCR 识别草稿", entry_method: "screenshot_extract" });
    const symbols = new Set(current.lines.map((line) => line.symbol));
    const merged = lines.reduce((next, line) => {
      if (symbols.has(line.symbol)) return next;
      symbols.add(line.symbol);
      return addLine(next, line);
    }, current);
    setDraft(merged);
    goToStep("editor", "forward");
  }

  return (
    <div
      className={`onboarding${effectiveReducedMotion ? " onboarding--reduced-motion" : ""}${keyboardNavigation ? " onboarding--keyboard" : ""}`}
      data-step={step}
      data-visit={returningVisit.current ? "returning" : "first"}
      onKeyDown={(event) => {
        if (event.key === "Tab" || event.key.startsWith("Arrow")) {
          setKeyboardNavigation(true);
        }
      }}
    >
      {step === "s0" ? (
        <div onAnimationEnd={onSplashAnimationEnd}>
          <SplashScreen
            returning={returningVisit.current}
            leaving={splashLeaving}
          />
        </div>
      ) : (
        <>
          <BrandBanner />
          <main id="onboarding-main">
            {step === "s1" ? (
          <div className={`onboarding-page onboarding-page--${motionDirection}`}>
            <ThemeSelectionScreen
              onContinue={() => {
                goToStep("s2", "forward");
              }}
              onSelect={setSelectedThemeId}
              selectedThemeId={selectedThemeId}
              titleRef={titleRef}
            />
          </div>
        ) : null}
        {step === "s2" ? (
          <div className={`onboarding-page onboarding-page--${motionDirection}`}>
            <SourceSelectionScreen
              onBack={() => goToStep("s1", "back")}
              onChooseManual={startManualEntry}
              onChooseRandom={chooseRandomExperience}
              onChooseScreenshot={() => {
                if (!draft) setDraft(createEmptyDraft({ source_label: "本机 OCR 识别草稿", entry_method: "screenshot_extract" }));
                goToStep("ocr", "forward");
              }}
              placeholderMessage={null}
              titleRef={titleRef}
            />
          </div>
        ) : null}
        {step === "s3" && identity ? (
          <div className={`onboarding-page onboarding-page--${motionDirection}`}>
            <ExperienceSummaryScreen
              identity={identity}
              onBack={() => goToStep("s2", "back")}
              onConfirm={confirmIdentity}
              onReroll={() => setIdentity(rerollDemoExperience(identity, random, now))}
              titleRef={titleRef}
            />
          </div>
        ) : null}
        {step === "ocr" ? (
          <div className={`onboarding-page onboarding-page--${motionDirection}`}>
            <ScreenshotImportPanel
              onCancel={() => goToStep("s2", "back")}
              onDraftLines={(lines) => mergeOcrLines(lines)}
            />
          </div>
        ) : null}
        {step === "editor" && draft ? (
          <div className={`onboarding-page onboarding-page--${motionDirection} onboarding-page--editor`}>
            <PortfolioEditor
              draft={draft}
              onCancel={() => goToStep("s2", "back")}
              onChange={setDraft}
              onConfirmDraft={confirmDraft}
            />
          </div>
        ) : null}
          </main>
        </>
      )}
    </div>
  );
}
