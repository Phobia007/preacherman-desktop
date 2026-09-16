(() => {
  const themeNames = ["text", "muted", "border", "control", "hover", "focus", "loading", "error", "ink-shadow"];
  let shell;
  try { shell = parent.document.querySelector(".demo-app-shell"); } catch { /* Standalone preview. */ }
  const syncTheme = () => {
    if (!shell) return;
    const style = parent.getComputedStyle(shell);
    document.documentElement.dataset.appearance = shell.dataset.appearance;
    // Chromium paints an opaque iframe canvas when its color scheme differs
    // from the embedding document, even when both CSS backgrounds are clear.
    document.documentElement.style.colorScheme = parent.getComputedStyle(parent.document.documentElement).colorScheme;
    for (const name of themeNames) {
      const property = `--demo-theme-market-${name}`;
      document.documentElement.style.setProperty(property, style.getPropertyValue(property));
    }
  };
  syncTheme();
  const themeObserver = new MutationObserver(syncTheme);
  if (shell) themeObserver.observe(shell, { attributes: true, attributeFilter: ["data-appearance"] });

  const notify = type => {
    if (parent !== window) parent.postMessage({ type: `preacherman.market.${type}`, page: location.pathname.endsWith("love-configurator.html") ? "configurator" : "intro" }, location.origin);
  };
  notify("page");
  let assetsReady = false;
  let stylesReady = false;
  let timer;
  let deadline;
  const checkReady = () => {
    if (!assetsReady || !stylesReady) return;
    clearTimeout(deadline);
    notify("ready");
  };
  document.addEventListener("loveconfiguratorready", () => {
    assetsReady = true;
    checkReady();
  }, { once: true });
  const cleanup = () => {
    clearTimeout(timer);
    clearTimeout(deadline);
    themeObserver.disconnect();
  };
  window.addEventListener("pagehide", cleanup, { once: true });

  // A Details link belongs to its own product, never the activated desktop avatar.
  const productLink = target => target?.closest?.('a[href^="love-configurator.html"]');
  const prefetched = new Set();
  const prefetch = event => {
    const link = productLink(event.target), modelId = link?.closest("[data-character-id]")?.dataset.characterId;
    if (parent === window || !modelId || prefetched.has(modelId)) return;
    prefetched.add(modelId);
    parent.postMessage({ type: "preacherman.market.prefetch", modelId }, location.origin);
  };
  document.addEventListener("pointerover", prefetch);
  document.addEventListener("focusin", prefetch);
  document.addEventListener("click", event => {
    const link = productLink(event.target), modelId = link?.closest("[data-character-id]")?.dataset.characterId;
    if (parent === window || !modelId || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    document.querySelector("[data-market-return-focus]")?.removeAttribute("data-market-return-focus");
    link.setAttribute("data-market-return-focus", "");
    parent.postMessage({ type: "preacherman.market.details", modelId }, location.origin);
  });

  document.addEventListener("DOMContentLoaded", () => {
    const host = document.getElementById("configurator");
    if (!host) {
      notify("ready");
      return;
    }
    host.dataset.marketStyling = "pending";
    deadline = setTimeout(() => {
      clearTimeout(timer);
      notify("error");
    }, 30000);
    const attachTheme = () => {
      const root = host.shadowRoot;
      if (!root) { timer = setTimeout(attachTheme, 16); return; }
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "market-embed.css";
      link.addEventListener("error", () => notify("error"), { once: true });
      link.addEventListener("load", () => {
        host.dataset.marketStyling = "ready";
        stylesReady = true;
        checkReady();
      }, { once: true });
      root.append(link);
    };
    attachTheme();
  }, { once: true });
})();
