import { useEffect, useRef, useState } from "react";
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
  splashDurationMs?: number;
}

export function OnboardingFlow({
  workspaceId,
  onEnterApp,
  storage = getBrowserOnboardingStorage(),
  random = Math.random,
  now = () => new Date(),
  reducedMotion = false,
  splashDurationMs,
}: OnboardingFlowProps) {
  const [step, setStep] = useState<OnboardingStep>(() =>
    hasCompletedOnboarding(storage, workspaceId) ? "complete" : "s0",
  );
  const [themeSelected, setThemeSelected] = useState(false);
  const [previewMessage, setPreviewMessage] = useState<string | null>(null);
  const [placeholderMessage, setPlaceholderMessage] = useState<string | null>(null);
  const [identity, setIdentity] = useState<DemoExperienceIdentity | null>(null);
  const [keyboardNavigation, setKeyboardNavigation] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const notifiedReturningVisit = useRef(false);

  useEffect(() => {
    if (step !== "complete" || notifiedReturningVisit.current) return;
    notifiedReturningVisit.current = true;
    onEnterApp({ identity: null, returning: true });
  }, [onEnterApp, step]);

  useEffect(() => {
    if (step !== "s0") return;
    const delay = splashDurationMs ?? (reducedMotion ? 400 : 2_500);
    const timer = window.setTimeout(() => setStep("s1"), delay);
    return () => window.clearTimeout(timer);
  }, [reducedMotion, splashDurationMs, step]);

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
    setStep("s3");
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
      className={`onboarding${reducedMotion ? " onboarding--reduced-motion" : ""}${keyboardNavigation ? " onboarding--keyboard" : ""}`}
      data-step={step}
      onKeyDown={(event) => {
        if (event.key === "Tab" || event.key.startsWith("Arrow")) {
          setKeyboardNavigation(true);
        }
      }}
    >
      <a className="skip-link" href="#onboarding-main">
        跳到主要内容
      </a>
      <main id="onboarding-main">
        {step === "s0" ? <SplashScreen onSkip={() => setStep("s1")} /> : null}
        {step === "s1" ? (
          <ThemeSelectionScreen
            onContinue={() => {
              if (themeSelected) setStep("s2");
            }}
            onPreview={(index) => {
              setPreviewMessage(`主题预览 ${index} 尚未开放，不能用于下一步。`);
            }}
            onSelect={() => {
              setThemeSelected(true);
              setPreviewMessage(null);
            }}
            previewMessage={previewMessage}
            selected={themeSelected}
            titleRef={titleRef}
          />
        ) : null}
        {step === "s2" ? (
          <SourceSelectionScreen
            onBack={() => setStep("s1")}
            onChooseRandom={chooseRandomExperience}
            onPlaceholder={(source) => {
              setPlaceholderMessage(
                source === "manual"
                  ? "手工录入暂未开放，请使用随机体验身份。"
                  : "截图识别暂未开放；不会打开文件选择器或上传图片。",
              );
            }}
            placeholderMessage={placeholderMessage}
            titleRef={titleRef}
          />
        ) : null}
        {step === "s3" && identity ? (
          <ExperienceSummaryScreen
            identity={identity}
            onBack={() => setStep("s2")}
            onConfirm={confirmIdentity}
            onReroll={() => setIdentity(rerollDemoExperience(identity, random, now))}
            titleRef={titleRef}
          />
        ) : null}
      </main>
    </div>
  );
}
