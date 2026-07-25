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
  const returningVisit = useRef(hasCompletedOnboarding(storage, workspaceId));
  const [step, setStep] = useState<OnboardingStep>("s0");
  const [themeSelected, setThemeSelected] = useState(false);
  const [previewMessage, setPreviewMessage] = useState<string | null>(null);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [placeholderMessage, setPlaceholderMessage] = useState<string | null>(null);
  const [identity, setIdentity] = useState<DemoExperienceIdentity | null>(null);
  const [keyboardNavigation, setKeyboardNavigation] = useState(false);
  const [splashLeaving, setSplashLeaving] = useState(false);
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

  useEffect(() => {
    if (step !== "complete" || notifiedReturningVisit.current) return;
    // 仅作为兜底：正常路径已在 splash 退出时通知
    notifiedReturningVisit.current = true;
    onEnterApp({ identity: null, returning: true });
  }, [onEnterApp, step]);

  useEffect(() => {
    if (step !== "s0") return;
    const timers: number[] = [];

    // 所有用户都展示完整 splash 动画，等待资源加载 + 最低展示时间
    const MIN_DISPLAY_MS = splashDurationMs ?? 2_000;
    let minTimePassed = false;
    let resourcesReady = false;

    function tryLeave() {
      if (minTimePassed && resourcesReady) {
        if (returningVisit.current) {
          // 回访：展开后直接进入主页
          setSplashLeaving(true);
          timers.push(window.setTimeout(() => {
            notifiedReturningVisit.current = true;
            setStep("complete");
            onEnterApp({ identity: null, returning: true });
          }, 600));
        } else {
          // 首次：展开进入引导流程
          setSplashLeaving(true);
          timers.push(window.setTimeout(() => setStep("s1"), 600));
        }
      }
    }

    // 最低展示时间
    timers.push(window.setTimeout(() => {
      minTimePassed = true;
      tryLeave();
    }, MIN_DISPLAY_MS));

    // 等待资源加载 (document ready + 字体 + 图片)
    function checkResources() {
      if (document.readyState === "complete") {
        void document.fonts.ready.then(() => {
          resourcesReady = true;
          tryLeave();
        });
      } else {
        window.addEventListener("load", () => {
          void document.fonts.ready.then(() => {
            resourcesReady = true;
            tryLeave();
          });
        }, { once: true });
      }
    }
    checkResources();

    return () => {
      for (const t of timers) window.clearTimeout(t);
    };
  }, [effectiveReducedMotion, onEnterApp, splashDurationMs, step]);

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
      className={`onboarding${effectiveReducedMotion ? " onboarding--reduced-motion" : ""}${keyboardNavigation ? " onboarding--keyboard" : ""}`}
      data-step={step}
      data-visit={returningVisit.current ? "returning" : "first"}
      onKeyDown={(event) => {
        if (event.key === "Tab" || event.key.startsWith("Arrow")) {
          setKeyboardNavigation(true);
        }
      }}
    >
      <main id="onboarding-main">
        {step === "s0" ? (
          <SplashScreen leaving={splashLeaving} returning={returningVisit.current} />
        ) : null}
        {step === "s1" || (step === "s0" && splashLeaving && !returningVisit.current) ? (
          <div className={`onboarding-reveal${step === "s0" ? " onboarding-reveal--active" : ""}`}>
            <ThemeSelectionScreen
              onContinue={() => {
                if (themeSelected) setStep("s2");
              }}
              onPreview={(index) => {
                setPreviewIndex(index);
                setPreviewMessage(
                  `主题预览 ${String(index).padStart(2, "0")} 暂未开放；它只预览表现方向，不能用于下一步。`,
                );
              }}
              onSelect={() => {
                setThemeSelected(true);
                setPreviewIndex(null);
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
