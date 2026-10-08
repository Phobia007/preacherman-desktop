import test from 'node:test';
import assert from 'node:assert/strict';
import { createMarketSelection, marketSelectionTotal } from '../src/surfaces/market/marketSelection.ts';

test('Market totals start at 81 and follow additions, replacements and removal', () => {
  const selection = createMarketSelection('cortana');
  assert.equal(marketSelectionTotal(selection), 81);
  const configured = {...selection, options: [{id: 'voice', price: 12.1}, {id: 'motion', price: 4.2}]};
  assert.equal(marketSelectionTotal(configured), 97.3);
  assert.equal(marketSelectionTotal({...configured, options: [{id: 'voice', price: 20}]}), 101);
  assert.equal(marketSelectionTotal({...configured, options: []}), 81);
  assert.equal(marketSelectionTotal(createMarketSelection('zima')), 81);
  assert.deepEqual(selection.options, []);
});
