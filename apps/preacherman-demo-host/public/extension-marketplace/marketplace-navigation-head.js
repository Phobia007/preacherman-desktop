/* Synchronous bootstrap. Load before the shared navigation stylesheet. */
(() => {
  'use strict';

  const root = document.documentElement;
  const key = 'claude-marketplace:navigation';
  let pending;

  try {
    pending = JSON.parse(sessionStorage.getItem(key) || 'null');
    sessionStorage.removeItem(key);
  } catch {
    return;
  }

  if (!pending || !/^https?:$/.test(location.protocol)) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (performance.getEntriesByType('navigation')[0]?.type === 'back_forward') return;

  const age = Date.now() - pending.at;
  if (pending.to !== location.href || age < 0 || age > 15000) return;

  root.dataset.marketplaceNavigation = 'arriving';

  // If the deferred runtime fails to load, the document must still be usable.
  setTimeout(() => {
    if (root.dataset.marketplaceNavigation === 'arriving') {
      root.dataset.marketplaceNavigation = 'idle';
    }
  }, 6000);
})();
