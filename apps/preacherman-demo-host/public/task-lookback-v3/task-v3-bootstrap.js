(function taskLookbackV3Bootstrap() {
  "use strict";

  const namespace = "/task-lookback-v3";
  const readyMessage = "task-lookback-v3-ready";
  const errorMessage = "task-lookback-v3-error";
  const nativePushState = history.pushState.bind(history);
  const nativeReplaceState = history.replaceState.bind(history);

  const postToHost = (type, detail) => {
    if (window.parent !== window) {
      window.parent.postMessage({ source: "task-lookback-v3", type, detail }, location.origin);
    }
  };

  const normalizeHistoryUrl = (value) => {
    if (value === undefined || value === null || value === "") return value;

    try {
      const url = new URL(String(value), location.href);
      if (url.origin !== location.origin) return value;
      if (url.pathname.startsWith(namespace + "/")) {
        return `${url.pathname}${url.search}${url.hash}`;
      }

      if (
        url.pathname === "/" ||
        url.pathname === "/surf" ||
        url.pathname === "/articles" ||
        url.pathname === "/about" ||
        url.pathname.startsWith("/articles/")
      ) {
        const path = url.pathname === "/" ? "/" : url.pathname;
        return `${namespace}${path}${url.search}${url.hash}`;
      }
    } catch {
      return value;
    }

    return value;
  };

  history.pushState = function taskLookbackReplacePush(state, title, url) {
    return nativeReplaceState(state, title, normalizeHistoryUrl(url));
  };
  history.replaceState = function taskLookbackReplaceState(state, title, url) {
    return nativeReplaceState(state, title, normalizeHistoryUrl(url));
  };

  if (location.pathname.endsWith("/index.html")) {
    nativeReplaceState(history.state, "", `${namespace}/${location.search}${location.hash}`);
  }

  const NativeAudio = window.Audio;
  if (typeof NativeAudio === "function") {
    function SilentAudio() {
      const audio = new NativeAudio();
      audio.preload = "none";
      audio.autoplay = false;
      audio.muted = true;
      audio.volume = 0;
      audio.removeAttribute("src");
      return audio;
    }

    SilentAudio.prototype = NativeAudio.prototype;
    Object.setPrototypeOf(SilentAudio, NativeAudio);
    window.Audio = SilentAudio;
  }

  const nativeMediaPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function taskLookbackMediaPlay() {
    if (this instanceof HTMLAudioElement) {
      this.pause();
      this.autoplay = false;
      this.muted = true;
      this.volume = 0;
      this.removeAttribute("src");
      return Promise.resolve();
    }

    return nativeMediaPlay.call(this);
  };

  const silenceAudio = (root) => {
    const audioElements = [];
    if (root instanceof HTMLAudioElement) audioElements.push(root);
    if (root instanceof Element || root instanceof Document) {
      audioElements.push(...root.querySelectorAll("audio"));
    }

    audioElements.forEach((audio) => {
      audio.pause();
      audio.autoplay = false;
      audio.muted = true;
      audio.volume = 0;
      audio.removeAttribute("src");
      audio.load();
    });
  };

  document.addEventListener(
    "play",
    (event) => {
      if (event.target instanceof HTMLAudioElement) silenceAudio(event.target);
    },
    true,
  );

  const copyThemeFromHost = () => {
    let appearance = "dark";
    let hostStyles = null;

    try {
      const hostRoot = window.parent.document.documentElement;
      const shell = window.parent.document.querySelector("[data-appearance]");
      appearance = shell?.getAttribute("data-appearance") || hostRoot.dataset.appearance || appearance;
      hostStyles = window.parent.getComputedStyle(hostRoot);
    } catch {
      // The standalone reference remains usable even without a parent shell.
    }

    document.documentElement.dataset.preachermanAppearance = appearance;
    if (!hostStyles) return;

    const tokenMap = {
      "--task-embed-text": "--demo-theme-text",
      "--task-embed-muted": "--demo-theme-muted",
      "--task-embed-border": "--demo-theme-border",
      "--task-embed-focus": "--demo-theme-focus",
      "--task-embed-surface": "--demo-theme-surface",
    };

    Object.entries(tokenMap).forEach(([localName, hostName]) => {
      const value = hostStyles.getPropertyValue(hostName).trim();
      if (value) document.documentElement.style.setProperty(localName, value);
    });
  };

  copyThemeFromHost();
  try {
    const hostRoot = window.parent.document.documentElement;
    new MutationObserver(copyThemeFromHost).observe(hostRoot, {
      attributes: true,
      attributeFilter: ["data-appearance"],
    });
  } catch {
    // No same-origin parent is available in the standalone reference.
  }

  const findSilentEntryButton = () =>
    Array.from(document.querySelectorAll("button")).find(
      (candidate) => candidate.textContent?.trim() === "...or without",
    );

  const introReady = () =>
    Array.from(document.querySelectorAll(".intro .js-text")).some(
      (candidate) => candidate.textContent?.trim() === "Loaded",
    );

  const timelineCardVisible = () =>
    Array.from(document.querySelectorAll(".js-flip-target")).some((card) => {
      const bounds = card.getBoundingClientRect();
      const styles = getComputedStyle(card);
      return (
        bounds.width > 1 &&
        bounds.height > 1 &&
        bounds.right > 0 &&
        bounds.bottom > 0 &&
        bounds.left < window.innerWidth &&
        bounds.top < window.innerHeight &&
        styles.visibility !== "hidden" &&
        Number.parseFloat(styles.opacity || "1") > 0.01
      );
    });

  const waitFor = async (predicate, timeout = 4000) => {
    const deadline = performance.now() + timeout;

    while (performance.now() < deadline) {
      if (predicate()) return true;
      await new Promise((resolve) => setTimeout(resolve, 80));
    }

    return false;
  };

  const findNavigationLink = (label) =>
    Array.from(document.querySelectorAll("a")).find(
      (link) => link.textContent?.trim() === label,
    );

  const initializeTimelineRoute = async (silentEntryButton) => {
    silentEntryButton.click();

    const surfLink = findNavigationLink("Surf");
    if (!surfLink) return false;
    surfLink.click();
    if (!(await waitFor(() => document.querySelector(".surf-carousel")))) return false;

    const timelineLink = findNavigationLink("Timeline");
    if (!timelineLink) return false;
    timelineLink.click();
    return waitFor(timelineCardVisible);
  };

  const observer = new MutationObserver((records) => {
    records.forEach((record) => record.addedNodes.forEach(silenceAudio));
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  const waitForVisuals = async () => {
    const deadline = performance.now() + 12000;

    while (performance.now() < deadline) {
      silenceAudio(document);

      const timelineLink = Array.from(document.querySelectorAll("a")).find((link) =>
        link.textContent?.trim().startsWith("Timeline"),
      );
      const timeline = document.querySelector(".carousel, .js-slides");
      const silentEntryButton = findSilentEntryButton();

      if (timelineLink && timeline && silentEntryButton && introReady()) {
        await document.fonts?.ready?.catch(() => undefined);
        const visibleImages = Array.from(document.querySelectorAll("img"))
          .filter((image) => image.getBoundingClientRect().width > 0)
          .slice(0, 5);
        await Promise.race([
          Promise.all(
            visibleImages.map(
              (image) =>
                image.complete ||
                new Promise((resolve) => {
                  image.addEventListener("load", resolve, { once: true });
                  image.addEventListener("error", resolve, { once: true });
                }),
            ),
          ),
          new Promise((resolve) => setTimeout(resolve, 1600)),
        ]);
        if (!(await initializeTimelineRoute(silentEntryButton))) {
          postToHost(errorMessage, "Timeline did not initialize in time.");
          return;
        }
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        document.documentElement.dataset.taskLookbackReady = "true";
        postToHost(readyMessage, { route: "timeline", audio: false });
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 80));
    }

    postToHost(errorMessage, "Timeline did not become ready in time.");
  };

  window.addEventListener("error", (event) => {
    postToHost(errorMessage, event.message || "The Lookback failed to load.");
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", waitForVisuals, { once: true });
  } else {
    waitForVisuals();
  }
})();
