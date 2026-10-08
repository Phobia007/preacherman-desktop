/* Keep the imported document on the host's theme before its first paint. */
(() => {
  const sync = () => {
    const shell = parent.document.querySelector('.demo-app-shell');
    if (!shell) return;
    document.documentElement.dataset.preachermanEmbedded = String(Boolean(parent.document.querySelector('.extension-marketplace')));
    const style = parent.getComputedStyle(shell);
    for (const key of style) if (key.startsWith('--demo-theme-') || key === '--demo-font-primary') document.documentElement.style.setProperty(key, style.getPropertyValue(key));
    document.documentElement.dataset.appearance = parent.document.documentElement.dataset.appearance || 'dark';
  };
  sync();
  const observer = new MutationObserver(sync);
  observer.observe(parent.document.documentElement, { attributes: true, attributeFilter: ['data-appearance'] });
  window.addEventListener('pagehide', () => observer.disconnect(), { once: true });
  const external = href => {
    try {
      const url = new URL(href, location.href);
      if (url.origin === location.origin || !['https:', 'http:', 'mailto:'].includes(url.protocol)) return false;
      parent.postMessage({ type: 'preacherman-extension-external', href: url.href }, location.origin);
      return true;
    } catch { return false; }
  };
  document.addEventListener('click', event => {
    const anchor = event.target.closest?.('a[href]');
    if (anchor && external(anchor.href)) event.preventDefault();
  });
  const originalOpen = window.open.bind(window);
  window.open = (url, ...args) => external(String(url)) ? null : originalOpen(url, ...args);
  // The host retains these documents; switching a tab no longer reloads its catalog.
  const routes = new Set(['marketplace-home.html', 'claude-marketplace.html', 'marketplace-agents.html']);
  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (!parent.document.querySelector('.extension-marketplace')) return;
    const anchor = event.target.closest?.('a[href]');
    if (!anchor || anchor.hasAttribute('download') || (anchor.target && anchor.target !== '_self')) return;
    const url = new URL(anchor.href, location.href), page = url.pathname.split('/').pop();
    if (url.origin !== location.origin || !routes.has(page)) return;
    event.preventDefault();
    document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
    parent.postMessage({ type: 'preacherman-extension-route', page }, location.origin);
  }, true);
})();
