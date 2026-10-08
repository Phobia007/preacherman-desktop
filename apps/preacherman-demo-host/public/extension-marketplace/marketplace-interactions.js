(() => {
  'use strict';
  const data = JSON.parse(document.getElementById('catalog-data').textContent);
  const items = new Map(data.items.map(item => [item.slug, item]));
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const grid = $('#all-grid'), heading = $('#all-heading'), count = $('#result-count');
  const content = $('#catalog'), sidebar = $('#filters');
  const searches = $$('input[type="search"]');
  const sort = $('select[data-od-id="sort"]');
  const detail = $('#detail-dialog'), filterDialog = $('#filter-dialog'), menuDialog = $('#menu-dialog');
  let query = '', scope = '', visible = 24, returnMarker, lastFilterButton;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const selected = () => [...sidebar.querySelectorAll('input:checked')].map(i => i.dataset.filter);
  const initialOrder = [...data.allOrder, ...data.items.filter(i => i.kind === 'connector' && !data.allOrder.includes(i.slug)).map(i => i.slug)];
  const status = text => { $('#status-message').textContent = text; };
  function clear() {
    query='';scope='';visible=24;searches.forEach(i=>i.value='');
    sidebar.querySelectorAll('input').forEach(i=>i.checked=false);sort.value='default';render();
  }
  function render() {
    const filters=selected(), types=filters.filter(f=>['remote','local','interactive'].includes(f)), cats=filters.filter(f=>!types.includes(f));
    const active=!!(query||filters.length||scope||sort.value!=='default');
    $$('[data-group]').forEach(s=>s.hidden=active);
    let found=data.items.filter(i=>{
      if(!query&&scope!=='plugins'&&i.kind==='plugin')return false;
      if(scope==='plugins'&&i.kind!=='plugin')return false;
      if(scope==='trending'&&!data.groups.trending.includes(i.slug))return false;
      if(scope==='new'&&!data.groups.new.includes(i.slug))return false;
      if(cats.length&&!cats.some(c=>i.categories.includes(c)))return false;
      if(types.length&&!types.some(t=>t==='interactive'?i.hasMcpApp:i.type===t))return false;
      return !query||[i.title,i.description,i.oneLiner,i.author,...i.categories.map(c=>data.categories[c])].join(' ').toLocaleLowerCase().includes(query.toLocaleLowerCase());
    });
    if(sort.value==='alphabetical')found.sort((a,b)=>a.title.localeCompare(b.title));
    else if(sort.value==='popular')found.sort((a,b)=>(b.popularityScore||0)-(a.popularityScore||0));
    else if(sort.value==='trending')found.sort((a,b)=>(b.trendingScore||0)-(a.trendingScore||0));
    else if(sort.value==='new')found.sort((a,b)=>new Date(b.addedAt||0)-new Date(a.addedAt||0));
    else found.sort((a,b)=>initialOrder.indexOf(a.slug)-initialOrder.indexOf(b.slug));
    heading.textContent=active?(scope==='plugins'?'All plugins':query?'Search results':scope==='trending'?'Trending connectors':scope==='new'?'New connectors':'All connectors'):'All connectors';
    heading.hidden=false;
    count.textContent=`${found.length} ${scope==='plugins'?'plugins':'results'}`;
    grid.innerHTML=found.slice(0,visible).map((item,index)=>{let part=0;return item.html.replace(/data-od-id="[^"]+"/g,()=>`data-od-id="result-${item.slug}-${index}-${part++}"`);}).join('');
    if(!found.length)grid.innerHTML='<div class="empty-results"><h3>No results found</h3><p>Try another search or clear your filters.</p><button type="button" data-clear data-od-id="clear-empty-filters">Clear filters</button></div>';
    $('#more-row').hidden=found.length<=visible;
    $('#reset-filters').hidden=!active;
    let chips=$('#active-filters');
    if(!chips){chips=document.createElement('div');chips.id='active-filters';chips.className='filter-chips';content.insertBefore(chips,content.children[1]);}
    chips.hidden=!active;
    chips.innerHTML=active?`<button class="filter-chip" type="button" data-clear>All results · ${found.length} <span aria-hidden="true">×</span></button>`+cats.map(c=>`<button class="filter-chip" type="button" data-remove="${esc(c)}">${esc(data.categories[c])} <span aria-hidden="true">×</span></button>`).join(''):'';
    status(`Showing ${Math.min(found.length,visible)} of ${found.length} results`);
  }
  function openDetail(slug) {
    const item=items.get(slug);if(!item)return;
    const temp=document.createElement('div');temp.innerHTML=item.html;
    const img=temp.querySelector('img');
    const icon=img?`<img src="${esc(img.getAttribute('src'))}" alt="${esc(item.title)} icon">`:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><rect x="3" y="10" width="7" height="10" rx="1"/><rect x="13" y="3" width="7" height="7" rx="1"/><path d="M13 13h7v7h-7zM3 3h7v4H3z"/></svg>';
    const verified=!!item.verifiedTier||!!temp.querySelector('[class*="VerifiedMark"]');
    detail.innerHTML=`<button class="dialog-close" type="button" data-close aria-label="Close details" data-od-id="close-detail">×</button><div class="detail-icon">${icon}</div><span class="detail-badge">${item.kind==='plugin'?'Plugin':'Connector'}${verified?' · Anthropic verified':''}</span><h2 id="dialog-title">${esc(item.title)}</h2><p class="detail-description">${esc(item.description)}</p><dl class="detail-meta"><dt>Category</dt><dd>${item.categories.map(c=>esc(data.categories[c]||c)).join(', ')}</dd><dt>Developer</dt><dd>${esc(item.author||'Not specified')}</dd><dt>Works with</dt><dd>${item.kind==='plugin'?'Claude Code':(item.worksWith||['claude']).map(x=>({'claude':'Claude','claude-api':'Claude API','claude-code':'Claude Code'})[x]||x).join(', ')}</dd><dt>Type</dt><dd>${item.kind==='plugin'?'Plugin':item.type==='local'?'Desktop extension':'Web'}${item.hasMcpApp?' · Interactive':''}</dd></dl><div class="dialog-actions"><a href="${esc(item.directoryUrl||item.href)}" target="_blank" rel="noopener noreferrer" data-od-id="add-in-claude">${item.kind==='plugin'?'Install plugin':'Add in Claude'} <span aria-hidden="true">↗</span></a><a href="${esc(item.href)}" target="_blank" rel="noopener noreferrer" data-od-id="official-details">Learn more</a></div><p class="detail-note">The official page opens in a new tab to complete ${item.kind==='plugin'?'installation':'connection and authorization'}.</p>`;
    detail.showModal();
  }
  searches.forEach(input=>input.addEventListener('input',()=>{query=input.value.trim();scope='';visible=24;searches.forEach(i=>{if(i!==input)i.value=input.value;});render();}));
  sort.addEventListener('change',()=>{visible=24;render();});
  sidebar.addEventListener('change',()=>{visible=24;scope='';render();});
  $('#reset-filters').addEventListener('click',clear);
  $('#load-more').addEventListener('click',()=>{visible+=24;render();});
  document.addEventListener('click',event=>{
    const target=event.target;
    if(target.closest('[data-close]')){target.closest('dialog').close();return;}
    const remove=target.closest('[data-remove]');if(remove){sidebar.querySelector(`[data-filter="${remove.dataset.remove}"]`).checked=false;render();return;}
    if(target.closest('[data-clear]')){clear();return;}
    const show=target.closest('[data-show]');if(show){event.preventDefault();scope=show.dataset.show==='top'?'all':show.dataset.show;visible=99;render();window.scrollTo({top:content.getBoundingClientRect().top+window.scrollY-165,behavior:'smooth'});return;}
    const card=target.closest('[data-item]');if(card){event.preventDefault();openDetail(card.dataset.item);return;}
    const filter=target.closest('[class*="__filtersButton"]');if(filter){lastFilterButton=filter;filter.setAttribute('aria-expanded','true');returnMarker=document.createElement('span');returnMarker.hidden=true;sidebar.before(returnMarker);filterDialog.innerHTML='<button class="dialog-close" type="button" data-close aria-label="Close filters">×</button>';filterDialog.append(sidebar);filterDialog.insertAdjacentHTML('beforeend','<button class="dialog-primary" data-close type="button">View results</button>');filterDialog.showModal();return;}
    const trigger=target.closest('button[aria-haspopup="menu"]');if(trigger){const parent=trigger.closest('[class*="Dropdown"][class*="__dropdown"]');if(parent){const opened=parent.classList.contains('od-open');$$('.od-open').forEach(e=>{e.classList.remove('od-open');e.querySelector('button[aria-expanded]')?.setAttribute('aria-expanded','false');});if(!opened){parent.classList.add('od-open');trigger.setAttribute('aria-expanded','true');}return;}}
    if(!target.closest('[class*="Dropdown"]'))$$('.od-open').forEach(e=>{e.classList.remove('od-open');e.querySelector('button[aria-expanded]')?.setAttribute('aria-expanded','false');});
    const searchButton=target.closest('button[aria-label="Search"],button[class*="__searchButton"],button[class*="__panelAction"]');if(searchButton){window.scrollTo({top:content.getBoundingClientRect().top+window.scrollY-170,behavior:'smooth'});searches[0].focus({preventScroll:true});}
    const mobile=target.closest('button[class*="MenuToggle"],button[class*="SubNav"][class*="__toggle"],button[aria-label="Open menu"]');if(mobile){menuDialog.innerHTML='<button class="dialog-close" data-close aria-label="Close menu">×</button><h2>Claude Marketplace</h2><nav><a href="claude-marketplace.html">Connectors and plugins</a><a href="marketplace-home.html" data-marketplace-route>Marketplace home ↗</a><a href="marketplace-agents.html" data-marketplace-route>Agents and products ↗</a><a href="https://claude.com/pricing" target="_blank" rel="noopener">Pricing ↗</a><a href="https://claude.ai" target="_blank" rel="noopener">Try Claude ↗</a></nav>';menuDialog.showModal();}
    const privacy=target.closest('[class*="ConsentContainer"][class*="__consentButton"]');if(privacy){detail.innerHTML='<button class="dialog-close" data-close aria-label="Close privacy settings">×</button><h2 id="dialog-title">Privacy choices</h2><p class="detail-description">This page does not use analytics or advertising cookies.</p><button class="dialog-primary" data-close>Done</button>';detail.showModal();}
  });
  filterDialog.addEventListener('close',()=>{if(returnMarker){returnMarker.replaceWith(sidebar);returnMarker=null;}lastFilterButton?.setAttribute('aria-expanded','false');});
  [detail,filterDialog,menuDialog].forEach(dialog=>dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}));
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){$$('.od-open').forEach(e=>{e.classList.remove('od-open');e.querySelector('[aria-expanded]')?.setAttribute('aria-expanded','false');});}if(event.key==='Enter'&&event.target.matches('[data-show]'))event.target.click();});
  $$('footer form').forEach(form=>form.addEventListener('submit',event=>{event.preventDefault();const input=form.querySelector('input,textarea');if(input&&input.value.trim())window.open('https://claude.ai/new?q='+encodeURIComponent(input.value.trim()),'_blank','noopener,noreferrer');else input?.focus();}));
  render();
})();
