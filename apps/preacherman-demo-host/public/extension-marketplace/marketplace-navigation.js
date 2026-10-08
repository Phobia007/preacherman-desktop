/* Native multi-document navigation with the original 300ms / 400ms overlay. */
(() => {
  'use strict';

  const root = document.documentElement;
  const key = 'claude-marketplace:navigation';
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const routeFiles = new Set([
    'claude-marketplace.html',
    'marketplace-home.html',
    'marketplace-agents.html',
  ]);
  const internalArrival = root.dataset.marketplaceNavigation === 'arriving';
  let pending = null;
  let navigationStarted = false;
  let departureTimer;
  let recoveryTimer;
  let revealTimer;
  let restoredFrame;

  if (!internalArrival) root.dataset.marketplaceNavigation = 'idle';

  function clearTimers() {
    clearTimeout(departureTimer);
    clearTimeout(recoveryTimer);
    clearTimeout(revealTimer);
    cancelAnimationFrame(restoredFrame);
  }

  function forgetPending() {
    try {
      sessionStorage.removeItem(key);
    } catch {
      // Native navigation also works when storage is disabled.
    }
  }

  function restore() {
    clearTimers();
    pending = null;
    navigationStarted = false;
    forgetPending();
    // A BFCache snapshot can contain an opaque departure overlay.
    root.dataset.marketplaceNavigation = 'restored';
    restoredFrame = requestAnimationFrame(() => {
      root.dataset.marketplaceNavigation = 'idle';
    });
  }

  function navigate() {
    if (!pending || navigationStarted) return;
    navigationStarted = true;
    clearTimeout(departureTimer);

    // Recover if a browser extension or beforeunload handler cancels navigation.
    recoveryTimer = setTimeout(restore, 5000);
    try {
      location.assign(pending.href);
    } catch {
      restore();
    }
  }

  function samePage(target) {
    if (target.pathname === location.pathname) return true;
    const current = new URL(location.href);
    const normalize = (url) => url.pathname.replace(/\/(?:index\.html)?$/, '/claude-marketplace.html');
    return normalize(target) === normalize(current);
  }

  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey
      || event.shiftKey || event.altKey || reducedMotion.matches) return;
    if (!/^https?:$/.test(location.protocol)) return;

    const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (!anchor || anchor.hasAttribute('download')) return;
    if (anchor.target && anchor.target.toLowerCase() !== '_self') return;
    const href = anchor.getAttribute('href')?.trim();
    if (!href || href.startsWith('#')) return;

    let target;
    try {
      target = new URL(href, location.href);
    } catch {
      return;
    }
    if (target.origin !== location.origin || !/^https?:$/.test(target.protocol)) return;
    const filename = target.pathname.split('/').pop();
    if (!anchor.hasAttribute('data-marketplace-route') && !routeFiles.has(filename)) return;
    if (samePage(target)) return;

    if (pending) {
      event.preventDefault();
      return;
    }

    // Write before cancelling the click; unavailable storage means ordinary navigation.
    try {
      const record = JSON.stringify({ to: target.href, at: Date.now() });
      sessionStorage.setItem(key, record);
      if (sessionStorage.getItem(key) !== record) return;
    } catch {
      return;
    }

    event.preventDefault();
    pending = target;
    navigationStarted = false;
    clearTimers();
    root.dataset.marketplaceNavigation = 'leaving';
    // transitionend is primary; timeout covers disabled CSS / interrupted animations.
    departureTimer = setTimeout(navigate, 350);
  });

  root.addEventListener('transitionend', (event) => {
    if (event.target !== root || event.propertyName !== 'opacity'
      || event.pseudoElement !== '::after') return;
    if (root.dataset.marketplaceNavigation === 'leaving') navigate();
    else if (root.dataset.marketplaceNavigation === 'revealing') {
      clearTimeout(revealTimer);
      root.dataset.marketplaceNavigation = 'idle';
    }
  });

  async function revealArrival() {
    if (!internalArrival) return;
    // Local fonts generally resolve immediately; cap the wait for missing fonts.
    await Promise.race([
      document.fonts?.ready || Promise.resolve(),
      new Promise((resolve) => setTimeout(resolve, 1200)),
    ]);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (root.dataset.marketplaceNavigation !== 'arriving') return;
      window.scrollTo({ top: 0, behavior: 'instant' });
      const heading = document.querySelector('main h1, [role="main"] h1, h1');
      if (heading instanceof HTMLElement) {
        const hadTabindex = heading.hasAttribute('tabindex');
        if (!hadTabindex) {
          heading.setAttribute('tabindex', '-1');
          heading.addEventListener('blur', () => heading.removeAttribute('tabindex'), { once: true });
        }
        heading.focus({ preventScroll: true });
      }
      if (reducedMotion.matches) restore();
      else {
        root.dataset.marketplaceNavigation = 'revealing';
        revealTimer = setTimeout(() => {
          if (root.dataset.marketplaceNavigation === 'revealing') {
            root.dataset.marketplaceNavigation = 'idle';
          }
        }, 450);
      }
    }));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', revealArrival, { once: true });
  } else {
    revealArrival();
  }

  window.addEventListener('pagehide', clearTimers);
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) restore();
  });
  reducedMotion.addEventListener('change', () => {
    if (!reducedMotion.matches) return;
    if (pending) navigate();
    else restore();
  });
})();
