import { useCallback, useEffect, useRef, useState } from "react";
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
import "./styles.css";

export interface OnboardingFlowProps {
  workspaceId: string;
  onEnterApp: (exit: OnboardingExit) => void;
  storage?: OnboardingStorage | null;
  random?: () => number;
  now?: () => Date;
  reducedMotion?: boolean;
}

export function OnboardingFlow({
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
  const [themeSelected, setThemeSelected] = useState(true);
  const [previewMessage, setPreviewMessage] = useState<string | null>(null);
  const [previewIndex, setPreviewIndex] = useState<number | null>(2);
  const [placeholderMessage, setPlaceholderMessage] = useState<string | null>(null);
  const [identity, setIdentity] = useState<DemoExperienceIdentity | null>(null);
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
      onEnterApp({ identity: null, returning: true });
    } else {
      setStep("s1");
    }
  }, [splashLeaving, onEnterApp]);

  useEffect(() => {
    if (step === "s1" || step === "s2" || step === "s3") {
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
    onEnterApp({ identity, returning: false });
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
                if (themeSelected) goToStep("s2", "forward");
              }}
              onPreview={(index) => {
                setThemeSelected(false);
                setPreviewIndex(index);
                setPreviewMessage(null);
              }}
              onSelect={() => {
                // 奶龙主题默认选中；再次点击可取消（点锁定预览卡同样会取消）
                const next = !themeSelected;
                setThemeSelected(next);
                setPreviewIndex(next ? 2 : null);
                setPreviewMessage(null);
              }}
              previewIndex={previewIndex}
              previewMessage={previewMessage}
              selected={themeSelected}
              titleRef={titleRef}
            />
          </div>
        ) : null}
        {step === "s2" ? (
          <div className={`onboarding-page onboarding-page--${motionDirection}`}>
            <SourceSelectionScreen
              onBack={() => goToStep("s1", "back")}
              onChooseRandom={chooseRandomExperience}
              onPlaceholder={(source) => {
                setPlaceholderMessage(
                  source === "manual"
                    ? "手工录入暂未开放，请使用随机体验身份。"
                    : "截图识别持仓暂未开放。",
                );
              }}
              placeholderMessage={placeholderMessage}
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
          </main>
        </>
      )}
    </div>
  );
}
