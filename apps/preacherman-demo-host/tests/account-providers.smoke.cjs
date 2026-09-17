const assert = require('node:assert/strict');

module.exports = async function verifyProviders(page, appearance, shot) {
  await page.locator('.account[data-entrance="complete"]').waitFor();
  const buttons = page.locator('.account__provider');
  await buttons.last().waitFor();
  await page.waitForFunction(() => !document.querySelector('.account__provider:last-child')?.disabled);
  assert.deepEqual(await buttons.allTextContents(), ['Continue with Google', 'Continue with GitHub', 'Continue with Apple', 'Continue with Codex']);
  const layout = await buttons.evaluateAll(items => items.map(item => {
    const box = item.getBoundingClientRect(), style = getComputedStyle(item), img = item.querySelector('img');
    return {x:box.x,y:box.y,width:box.width,height:box.height,font:style.font,border:style.borderRadius,
      authoredHeight:parseFloat(style.height),gap:parseFloat(getComputedStyle(item.parentElement).gap),
      color:style.color,background:style.backgroundColor,iconReady:img.complete && img.naturalWidth>0,filter:getComputedStyle(img).filter};
  }));
  for (const [index, item] of layout.entries()) {
    assert.ok(item.iconReady, 'Every provider icon loads');
    for (const key of ['x','width','height']) assert.ok(Math.abs(item[key]-layout[0][key])<.05, 'Matching '+key);
    for (const key of ['font','border','color','background']) assert.equal(item[key], layout[0][key], 'Matching '+key);
    assert.equal(item.authoredHeight,52);
    assert.equal(item.gap,12);
    // The authored 1800 x 1000 composition scales to the actual viewport.
    if(index) assert.ok(Math.abs(item.y-layout[index-1].y-layout[index-1].height-12*item.height/item.authoredHeight)<.05);
    if(index>1) assert.equal(item.filter,layout[1].filter,'New icons follow GitHub theme treatment');
  }
  for(const provider of ['Google','Apple','Codex']) {
    const button=page.getByRole('button',{name:'Continue with '+provider,exact:true});
    await button.focus();
    await page.keyboard.press('Enter');
    const dialog=page.getByRole('dialog');
    await dialog.waitFor();
    assert.ok((await dialog.innerText()).includes(provider+' sign-in is not connected yet.'));
    await shot(page,appearance+'-'+provider.toLowerCase()+'-status');
    await dialog.getByRole('button',{name:'Got it',exact:true}).click();
    await dialog.waitFor({state:'hidden'});
    assert.ok(await button.evaluate(el=>document.activeElement===el),'Focus returns to initiating provider');
  }
  const apple=page.getByRole('button',{name:'Continue with Apple',exact:true});
  await apple.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  assert.equal(await apple.evaluate(el=>getComputedStyle(el).outlineStyle),'solid');
  await apple.hover();
  const hover=await apple.evaluate(el=>({background:getComputedStyle(el).backgroundColor,border:getComputedStyle(el).borderColor}));
  assert.notEqual(hover.background,layout[2].background,'Hover is visible');
  await page.mouse.move(5,5);
  await shot(page,appearance+'-account-providers');
  return {appearance,providers:4,matchingLayout:true,iconsLoaded:true,localFeedback:true,focusRestored:true,hover,layout};
};
