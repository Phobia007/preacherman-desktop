/* Keep the imported document on the host's theme before its first paint. */
(() => {
  const sync = () => {
    const shell = parent.document.querySelector('.demo-app-shell');
    if (!shell) return;
    const style = parent.getComputedStyle(shell);
    for (const key of style) if (key.startsWith('--demo-theme-')) document.documentElement.style.setProperty(key, style.getPropertyValue(key));
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
})();
