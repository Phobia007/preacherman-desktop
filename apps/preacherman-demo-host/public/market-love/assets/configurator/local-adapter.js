(() => {
  const host = document.getElementById('configurator');
  const hash = value => {
    let result = 2166136261;
    for (const character of value) result = Math.imul(result ^ character.codePointAt(0), 16777619);
    return (result >>> 0).toString(36);
  };
  const bind = () => {
    const root = host.shadowRoot;
    if (!root) { setTimeout(bind, 25); return; }
    const style = document.createElement('style');
    style.textContent = 'ul.t-nav-small button{min-height:44px;min-width:44px;margin-top:-12px;margin-bottom:-12px}.od-close-control{min-height:44px;min-width:44px}';
    root.appendChild(style);
    const annotate = () => {
      root.querySelectorAll('h1.t-headline').forEach(heading => {
        if (heading.textContent.trim() !== 'Your LOVE Bracelet') return;
        const group = heading.parentElement;
        const description = group.querySelector('p.t-summary-description');
        if (!description) return;
        const summary = description.textContent.trim();
        let save = group.querySelector('.od-save-wishlist');
        if (!save) {
          save = document.createElement('button');
          save.type = 'button';
          save.className = 'od-save-wishlist t-button animated-underline opacity-60 hover:opacity-100';
          save.style.cssText = 'align-self:flex-start;min-height:44px;cursor:pointer';
          save.addEventListener('click', () => {
            try {
              localStorage.setItem('preacherman.market.love.saved', JSON.stringify({summary:description.textContent.trim(),hash:location.hash}));
              save.textContent = 'Added to wishlist';
            } catch { save.textContent = 'Unable to save right now'; }
          });
          group.appendChild(save);
        }
        let saved;
        try { saved = JSON.parse(localStorage.getItem('preacherman.market.love.saved') || 'null'); } catch {}
        if (saved?.hash === location.hash && saved.summary !== summary) {
          try { localStorage.setItem('preacherman.market.love.saved', JSON.stringify({...saved,summary})); } catch {}
        }
        const label = saved?.hash === location.hash ? 'Added to wishlist' : 'Add to wishlist';
        if (save.textContent !== label && save.textContent !== 'Unable to save right now') save.textContent = label;
      });
      const counts = new Map();
      root.querySelectorAll('button,a,input,select,canvas,h1,h2,h3,section').forEach(element => {
        const text = (element.getAttribute('aria-label') || element.textContent || element.tagName).trim().replace(/\s+/g, ' ');
        const key = `${element.tagName.toLowerCase()}-${hash(text)}`;
        const count = (counts.get(key) || 0) + 1;
        counts.set(key, count);
        element.setAttribute('data-od-id', `configurator-${key}-${count}`);
        if (element.tagName === 'CANVAS') element.setAttribute('aria-label', '3D LOVE bracelet. Drag to explore the details.');
        if (element.tagName === 'A' && element.textContent.trim() === 'Close') {
          element.setAttribute('href', 'cartier-love.html');
          element.classList.add('od-close-control');
        }
        if (element.tagName === 'A' && /^https:\/\/www\.cartier\.com\//.test(element.href)) {
          element.setAttribute('target', '_blank');
          element.setAttribute('rel', 'noopener noreferrer');
        }
      });
    };
    annotate();
    new MutationObserver(annotate).observe(root, {subtree:true, childList:true, characterData:true});
  };
  bind();
})();
