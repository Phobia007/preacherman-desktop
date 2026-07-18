import { useCallback, useEffect, useRef, useState } from "react";
import { STARTUP_INTRO_TIMING } from "../introSequence";
import { uiCopy, type Appearance, type Locale } from "../preferences";
import { AnimatedPreachermanLogo } from "./AnimatedPreachermanLogo";
import "./animated-preacherman-logo.css";

interface IntroSplashProps {
  readonly appearance: Appearance;
  readonly locale: Locale;
  readonly onComplete: () => void;
}

export function IntroSplash({ appearance, locale, onComplete }: IntroSplashProps) {
  const [showLogo, setShowLogo] = useState(false);
  const [isFading, setIsFading] = useState(false);
  const completionHandledRef = useRef(false);
  const holdTimerRef = useRef<number>();
  const fadeTimerRef = useRef<number>();

  useEffect(() => {
    const whiteHoldTimer = window.setTimeout(
      () => setShowLogo(true),
      STARTUP_INTRO_TIMING.whiteHoldMs,
    );
    return () => window.clearTimeout(whiteHoldTimer);
  }, []);

  useEffect(() => () => {
    if (holdTimerRef.current !== undefined) {
      window.clearTimeout(holdTimerRef.current);
    }
    if (fadeTimerRef.current !== undefined) {
      window.clearTimeout(fadeTimerRef.current);
    }
  }, []);

  const handleLogoComplete = useCallback(() => {
    if (completionHandledRef.current) {
      return;
    }
    completionHandledRef.current = true;
    holdTimerRef.current = window.setTimeout(() => {
      setIsFading(true);
      fadeTimerRef.current = window.setTimeout(
        onComplete,
        STARTUP_INTRO_TIMING.logoFadeOutMs,
      );
    }, STARTUP_INTRO_TIMING.logoVisibleMs);
  }, [onComplete]);
  const introInk = appearance === "dark" ? "#f7f5f1" : "#111111";

  return (
    <section
      aria-label={uiCopy[locale].introLabel}
      className="demo-intro-splash"
      data-appearance={appearance}
    >
      <div className={`demo-intro-splash__logo${isFading ? " is-fading" : ""}`}>
        {showLogo ? (
          <AnimatedPreachermanLogo
            autoPlay
            ink={introInk}
            onComplete={handleLogoComplete}
            replayOnClick={false}
            size={600}
          />
        ) : null}
      </div>
    </section>
  );
}
