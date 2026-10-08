(() => {
  'use strict';
  const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
  const esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const page=document.documentElement.dataset.marketplacePage;
  const menu=$('#menu-dialog'),searchDialog=$('#marketplace-search');
  const searchInput=searchDialog.querySelector('input'),results=$('#marketplace-search-results');
  const searchData=JSON.parse($('#marketplace-search-data').textContent);
  let searchIndex=-1,searchMatches=[],filterMarker;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const status=text=>$('#page-status').textContent=text;
  // Captured useInView: reveal once at a 20% bottom inset, keeping the source CSS timings.
  const revealObserver=new IntersectionObserver(entries=>entries.forEach(entry=>{
    if(entry.isIntersecting){reveal(entry.target);revealObserver.unobserve(entry.target);}
  }),{rootMargin:'0px 0px -20% 0px'});
  function reveal(element){const name=[...element.classList].find(c=>/^Animated(?:Heading|Reveal)-/.test(c)&&/__(?:heading|container)$/.test(c));if(name)element.classList.add(name.replace(/__(?:heading|container)$/,'__revealed'));}
  $$('[class*="AnimatedHeading"][class*="__heading"],[class*="AnimatedReveal"][class*="__container"]').forEach(element=>{
    const rect=element.getBoundingClientRect();
    if(reduced||(rect.bottom>0&&rect.top<innerHeight&&rect.width+rect.height>0))reveal(element);else revealObserver.observe(element);
  });

  function renderSearch(){
    const term=searchInput.value.trim().toLowerCase();
    searchMatches=searchData.filter(item=>!term||(item.title+' '+item.description).toLowerCase().includes(term)).slice(0,30);
    searchIndex=-1;searchInput.removeAttribute('aria-activedescendant');
    searchDialog.querySelector('[class*="__groupLabel"]').textContent=term?'Results':'Popular';
    results.innerHTML=searchMatches.length?searchMatches.map((item,i)=>`<li id="marketplace-search-option-${i}" role="option" aria-selected="false" class="SearchDialog-module-scss-module__8y_Ugq__row" data-result-index="${i}" tabindex="-1"><span class="search-result-icon" aria-hidden="true">${item.icon?`<img src="${esc(item.icon)}" alt="">`:item.kind==='Plugin'?'⌘':'↗'}</span><span class="search-result-copy"><span class="search-result-title">${esc(item.title)}</span><span class="search-result-description">${esc(item.description)}</span></span><span class="search-result-kind">${item.kind}</span></li>`).join(''):'<li class="search-empty">No results found. Try another search.</li>';
    status(`${searchMatches.length} search results`);
  }
  function openSearch(){renderSearch();searchDialog.showModal();searchInput.focus();}
  searchInput.addEventListener('input',renderSearch);
  searchInput.addEventListener('keydown',event=>{
    if(['ArrowDown','ArrowUp'].includes(event.key)){
      event.preventDefault();if(!searchMatches.length)return;
      searchIndex=(searchIndex+(event.key==='ArrowDown'?1:-1)+searchMatches.length)%searchMatches.length;
      results.querySelectorAll('[role="option"]').forEach((row,i)=>row.setAttribute('aria-selected',String(i===searchIndex)));
      const row=results.children[searchIndex];searchInput.setAttribute('aria-activedescendant',row.id);
      const area=searchDialog.querySelector('[class*="__resultsArea"]');
      if(area){const delta=row.getBoundingClientRect().bottom-area.getBoundingClientRect().bottom;if(delta>0)area.scrollTop+=delta;if(row.getBoundingClientRect().top<area.getBoundingClientRect().top)area.scrollTop-=area.getBoundingClientRect().top-row.getBoundingClientRect().top;}
    }else if(event.key==='Enter'&&searchMatches.length){event.preventDefault();window.open(searchMatches[Math.max(0,searchIndex)].href,'_blank','noopener,noreferrer');}
  });
  results.addEventListener('click',event=>{const row=event.target.closest('[data-result-index]');if(row)window.open(searchMatches[Number(row.dataset.resultIndex)].href,'_blank','noopener,noreferrer');});

  function openMenu(){
    menu.innerHTML='<button type="button" class="dialog-close" data-close aria-label="Close menu">×</button><h2>Extension</h2><nav><a href="marketplace-home.html" data-marketplace-route>Home</a><a href="claude-marketplace.html" data-marketplace-route>Connectors and plugins</a><a href="marketplace-agents.html" data-marketplace-route>Agents and products</a></nav>';
    menu.querySelector(`a[href="${page==='home'?'marketplace-home.html':'marketplace-agents.html'}"]`).setAttribute('aria-current','page');menu.showModal();
  }

  const categoryStates=page==='home'?JSON.parse($('#home-categories').textContent):[];
  function closeCategory(){const list=$('#home-category-menu');if(list)list.remove();$('[class*="__categoryTrigger"]')?.setAttribute('aria-expanded','false');}
  function openCategory(){
    const trigger=$('[class*="__categoryTrigger"]');if($('#home-category-menu')){closeCategory();return;}
    trigger.parentElement.append($('#home-category-menu-template').content.cloneNode(true));
    const list=$('#home-category-menu');list.hidden=false;trigger.setAttribute('aria-expanded','true');
    list.querySelector('[aria-selected="true"]')?.focus();
  }
  function chooseCategory(name){
    const state=categoryStates.find(s=>s.name===name);if(!state)return;
    const card=$('[class*="__categoryCard"]');card.outerHTML=state.html;
    const replacement=$('[class*="__categoryCard"]');
    if(!reduced)replacement.animate([{opacity:.35},{opacity:1}],{duration:240,easing:'ease-out'});
    replacement.querySelector('[class*="__categoryTrigger"]').focus({preventScroll:true});status(`${name} connectors`);
  }

  const agentCards=$$('[data-agent-card]'),agentFilters=$('#agent-filters');
  function filterAgents(){
    const terms=$$('main input[type="search"]');const query=(terms[0]?.value||'').trim().toLowerCase();
    const selected=[...agentFilters.querySelectorAll('input:checked')].map(e=>e.dataset.useCase);
    let count=0;
    agentCards.forEach(card=>{const show=(!query||card.textContent.toLowerCase().includes(query))&&(!selected.length||selected.includes(card.dataset.useCase));card.hidden=!show;if(show)count++;});
    $('#agent-empty').hidden=count>0;$('#agent-clear').hidden=!query&&!selected.length;status(`${count} products`);
    const counter=$('[class*="__content"] > p.sr-only');if(counter)counter.textContent=`${count} products`;
  }
  if(page==='agents'){
    const inputs=$$('main input[type="search"]');inputs.forEach(input=>input.addEventListener('input',()=>{inputs.forEach(other=>{if(other!==input)other.value=input.value;});filterAgents();}));
    agentFilters.addEventListener('change',filterAgents);
    $('#filter-dialog').addEventListener('close',()=>{if(filterMarker){filterMarker.replaceWith(agentFilters);filterMarker=null;}$('[class*="__filtersButton"]')?.setAttribute('aria-expanded','false');});
  }

  document.addEventListener('click',event=>{
    const target=event.target;
    if(target.closest('[data-close]')){target.closest('dialog').close();return;}
    if(target.closest('[class*="SearchDialog"][class*="__esc"]')){searchDialog.close();return;}
    if(target.closest('[class*="MarketplaceHero"][class$="__search"],header button[aria-label="Search"],header button[class*="__panelAction"]')){openSearch();return;}
    if(target.closest('button[class*="MenuToggle"],button[class*="SubNav"][class*="__toggle"]')){openMenu();return;}
    if(target.closest('[class*="__categoryTrigger"]')){openCategory();return;}
    const option=target.closest('#home-category-menu [role="option"]');if(option){chooseCategory(option.textContent.trim());return;}
    if(!target.closest('[class*="__categoryPicker"]'))closeCategory();
    const faq=target.closest('[class*="FAQAccordion"][class*="__trigger"]');
    if(faq){const item=faq.closest('[class*="__item"]'),open=faq.getAttribute('aria-expanded')!=='true';faq.setAttribute('aria-expanded',String(open));item.classList.toggle('FAQAccordion-module-scss-module__nWoFyW__open',open);const content=document.getElementById(faq.getAttribute('aria-controls'));content.inert=!open;return;}
    const filter=target.closest('[class*="__filtersButton"]');
    if(filter&&agentFilters){const dialog=$('#filter-dialog');filterMarker=document.createElement('span');agentFilters.before(filterMarker);dialog.innerHTML='<button type="button" class="dialog-close" data-close aria-label="Close filters">×</button>';dialog.append(agentFilters);dialog.insertAdjacentHTML('beforeend','<button type="button" class="dialog-primary" data-close>View results</button>');filter.setAttribute('aria-expanded','true');dialog.showModal();return;}
    if(target.closest('[data-agent-clear]')){$$('main input[type="search"]').forEach(e=>e.value='');agentFilters.querySelectorAll('input').forEach(e=>e.checked=false);filterAgents();return;}
    const trigger=target.closest('button[aria-haspopup="menu"]');
    if(trigger){const parent=trigger.closest('[class*="Dropdown"][class*="__dropdown"]');if(parent){const open=!parent.classList.contains('od-open');$$('.od-open').forEach(e=>{e.classList.remove('od-open');e.querySelector('button')?.setAttribute('aria-expanded','false');});parent.classList.toggle('od-open',open);trigger.setAttribute('aria-expanded',String(open));return;}}
    if(!target.closest('[class*="Dropdown"]'))$$('.od-open').forEach(e=>{e.classList.remove('od-open');e.querySelector('button')?.setAttribute('aria-expanded','false');});
    if(target.closest('[class*="ConsentContainer"][class*="__consentButton"]')){menu.innerHTML='<button class="dialog-close" data-close aria-label="Close privacy choices">×</button><h2>Privacy choices</h2><p class="detail-description">This page does not use analytics or advertising cookies.</p><button class="dialog-primary" data-close>Done</button>';menu.showModal();}
  });
  document.addEventListener('keydown',event=>{
    if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){event.preventDefault();if(!searchDialog.open)openSearch();}
    if(event.key==='Escape'){const opened=$('dialog[open]');if(opened){event.preventDefault();opened.close();}closeCategory();$$('.od-open').forEach(e=>{e.classList.remove('od-open');e.querySelector('button')?.setAttribute('aria-expanded','false');});}
    const option=event.target.closest('#home-category-menu [role="option"]');
    if(option&&['Enter',' '].includes(event.key)){event.preventDefault();chooseCategory(option.textContent.trim());}
    if(option&&['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();const list=$$('#home-category-menu [role="option"]'),i=list.indexOf(option);list[(i+(event.key==='ArrowDown'?1:-1)+list.length)%list.length].focus();}
  });
  $$('dialog').forEach(dialog=>dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}));
  $$('footer form').forEach(form=>form.addEventListener('submit',event=>{event.preventDefault();const input=form.querySelector('input,textarea');if(input?.value.trim())window.open('https://claude.ai/new?q='+encodeURIComponent(input.value.trim()),'_blank','noopener,noreferrer');else input?.focus();}));
})();
