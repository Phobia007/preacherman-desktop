(() => {
 const menu=document.querySelector('.menu-toggle'),nav=document.querySelector('.brand-nav');menu.addEventListener('click',()=>{const open=nav.classList.toggle('is-open');menu.setAttribute('aria-expanded',String(open));menu.setAttribute('aria-label',open?'Close navigation':'Open navigation')});
 for(const dialog of document.querySelectorAll('dialog')){dialog.querySelector('[data-close]').addEventListener('click',()=>dialog.close());dialog.addEventListener('click',e=>{if(e.target===dialog){const b=dialog.getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)dialog.close()}})}
 document.getElementById('search-toggle').addEventListener('click',()=>{document.getElementById('search-dialog').showModal();document.getElementById('love-search').focus()});
 const entries=[['Style · FIND YOUR FIT','style','width small medium classic size'],['Material · White, Rose, or Yellow','material','white gold rose gold yellow gold color alloy'],['Diamonds · Your Bracelet, Your Brilliance','diamonds','diamonds paving paved'],['Finish · A final touch','finish','polished brushed surface'],['Closure · One or two','closure','screw closure hinge']];
 document.getElementById('search-form').addEventListener('submit',e=>{e.preventDefault();const q=document.getElementById('love-search').value.trim().toLowerCase();const found=entries.filter(x=>!q||q==='love'||x.join(' ').toLowerCase().includes(q));const area=document.getElementById('search-results');area.replaceChildren();if(!found.length){const p=document.createElement('p');p.textContent='No results found. Try “diamonds” or “gold”.';area.append(p)}for(const [title,id]of found){const a=document.createElement('a');a.className='search-result';a.href='#'+id;a.textContent=title+' →';a.addEventListener('click',()=>document.getElementById('search-dialog').close());area.append(a)}});
 document.getElementById('bag-toggle').addEventListener('click',()=>document.getElementById('bag-dialog').showModal());
 document.getElementById('saved-toggle').addEventListener('click',()=>{
  const area=document.getElementById('saved-content');area.replaceChildren();let saved;
  try{saved=JSON.parse(localStorage.getItem('preacherman.market.love.saved'))}catch{}
  if(saved?.summary && /[\u3400-\u9fff]/.test(saved.summary)) {
   try {
    let state=JSON.parse(new URLSearchParams(saved.hash.slice(1)).get('love'));
    if(typeof state==='string')state=JSON.parse(state);
    const selection=state.state.currentSelection;
    const model={small:'Small',medium:'Medium',classic:'Classic'}[selection.model];
    const material={yellowgold:'18K yellow gold',whitegold:'18K white gold',rosegold:'18K rose gold'}[selection.material];
    const diamonds={none:'',four:', with 4 diamonds',six:', with 6 diamonds',ten:', with 10 diamonds',paved:', paved with diamonds',pavedten:', with 10 diamonds and paved',pavedceramic:', paved ceramic, diamond-paved'}[selection.paving];
    const finish={polished:'polished finish',brushed:'brushed finish'}[selection.finish];
    const closure={original:'original closure',singlescrew:'single-screw closure',pushbutton:'push button closure'}[selection.closure];
    if(!model||!material||diamonds===undefined||!finish||!closure)throw new Error('Unknown selection');
    saved.summary=`The ${model} LOVE bracelet in ${material}${diamonds}, a ${finish} and ${closure}.`;
    localStorage.setItem('preacherman.market.love.saved',JSON.stringify(saved));
   } catch { saved.summary='Your saved LOVE bracelet'; }
  }
  const description=document.createElement('p');
  description.textContent=saved?.summary||'Find your LOVE, one detail at a time. Complete your design to add your selection to your wishlist.';
  area.append(description);
  const link=document.createElement('a');
  link.href='love-configurator.html'+(saved?.hash?.startsWith('#love=')?saved.hash:'');
  link.className='button button--primary';link.textContent=saved?.summary?'View my selection':'Start Designing';area.append(link);
  document.getElementById('saved-dialog').showModal();
 });
})();
