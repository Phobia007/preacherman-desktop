import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { searchMarketModels, sanitizeSearchHistory, readSearchHistory, rememberSearch, removeSearch, cleanSearchQuery, MARKET_SEARCH_HISTORY_LIMIT } from '../src/surfaces/market/marketSearchData.ts';
const read = file => readFile(new URL('../'+file, import.meta.url), 'utf8');
const models = JSON.parse(await read('public/market-love/characters.json'));
test('Search finds all existing Gallery models by name, full IDs, Unicode width and related names', () => {
  for (const model of models) {
    assert.equal(searchMarketModels(models, model.name)[0].id, model.id);
    assert.ok(searchMarketModels(models, model.id).some(item => item.id === model.id));
  }
  assert.equal(searchMarketModels(models, ' ＣＯＲＴＡＮＡ ')[0].id, 'cortana');
  assert.equal(searchMarketModels(models, 'iron  man')[0].id, 'iron-man-mark-85');
  assert.deepEqual(searchMarketModels(models, 'Halo').map(item => item.id), ['cortana','halo-mk-v-model','spartan-armour-mkv-halo-reach']);
  assert.deepEqual(searchMarketModels(models, '  '), []);
  assert.deepEqual(searchMarketModels(models, '<script>not a model</script>'), []);
});
test('History keeps recent unique submitted queries, deletes individually and survives malformed storage', () => {
  let history=rememberSearch(['Halo','Cortana'], '  CORTANA  ');
  assert.deepEqual(history,['CORTANA','Halo']);
  history=removeSearch(history,'cortana'); assert.deepEqual(history,['Halo']);
  assert.deepEqual(sanitizeSearchHistory([null, 4, '  ', 'Halo', 'halo', 'ZIMA']), ['Halo','ZIMA']);
  assert.equal(sanitizeSearchHistory(Array.from({length:30},(_,i)=>`Model ${i}`)).length, MARKET_SEARCH_HISTORY_LIMIT);
  assert.deepEqual(readSearchHistory({getItem:()=>'{broken'}),[]);
  assert.deepEqual(readSearchHistory({getItem:()=>JSON.stringify(history)}),history);
  assert.deepEqual(readSearchHistory({getItem(){throw new Error('Storage denied');}}),[]);
  assert.equal(cleanSearchQuery(' a\nb\t '),'a b');
  assert.equal(cleanSearchQuery('a'.repeat(200)).length,120);
});
for(const appearance of ['light','dark']) test(`Search and seamless frost preserve ${appearance} tokens, entry timing, keyboard and reduced motion`,async()=>{
  const css=await read('src/surfaces/market/market-search.css'), surface=await read('src/surfaces/market/MarketSurface.tsx');
  const source=await read('src/surfaces/market/MarketSearch.tsx'), frost=await read('src/surfaces/market/market-surface.css');
  const themes=await read('src/styles.css');
  for(const token of ['text','muted','border','control','hover','focus','error']) {
    assert.ok(css.includes(`var(--demo-theme-market-${token})`));
    assert.equal((themes.match(new RegExp(`--demo-theme-market-${token}:`,'g'))||[]).length,2);
  }
  assert.match(css,/880px/);assert.match(css,/font: 400 24px/);
  assert.match(css,/prefers-reduced-motion: reduce/);assert.match(css,/nth-child\(even\)/);
  assert.match(surface,/ready=\{category.phase === "idle" && !selectedModel\}/);
  assert.match(source,/galleryModels.has\(model.id\)/);assert.match(source,/onCompositionStart/);assert.match(source,/onCompositionEnd/);
  assert.match(source,/Delete \$\{item\} from search history/);assert.match(source,/ArrowDown/);assert.match(source,/ArrowUp/);
  assert.match(surface,/captureSearch/);assert.match(surface,/data-market-return-focus/);
  assert.doesNotMatch(frost,/frost-pane/);assert.doesNotMatch(surface,/frost-pane/);
  assert.match(frost,/\.market-surface__frost \{[^}]+backdrop-filter: blur\(12px\)/);
});

for (const appearance of ['light', 'dark']) test(`Task previews inherit ${appearance} surfaces and stop for hidden or reduced-motion states`, async () => {
  const css = await read('src/surfaces/market/market-search-promos.css');
  const source = await read('src/surfaces/market/MarketSearchPromos.tsx');
  for (const token of ['text', 'focus', 'error']) assert.ok(css.includes(`var(--demo-theme-market-${token})`));
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i);
  assert.match(source, /enabled && visible && onScreen && documentVisible/);
  assert.match(source, /active && !reduced && !focused/);
  assert.match(source, /abort.abort\(\); instance\?\.dispose\(\)/);
  assert.match(source, /observer.disconnect\(\)/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.doesNotMatch(source, /market-search-promos__pause/);
  assert.match(source, /matches\(":focus-visible"\)/);
});
