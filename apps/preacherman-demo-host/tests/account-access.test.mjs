import test from 'node:test';
import assert from 'node:assert/strict';
import { hasAccountAccess, requiresAccount } from '../src/auth/accountAccess.ts';

const originalStorage = globalThis.localStorage;
globalThis.localStorage = {getItem: () => null};
const { createDemoAccountStore } = await import('../src/auth/demoAccount.ts');
if (originalStorage === undefined) delete globalThis.localStorage;
else globalThis.localStorage = originalStorage;

const signedOut = {status: 'signed-out', user: null};
test('protected destinations stay closed during restore, pending login and logout', () => {
  for (const status of ['restoring', 'signed-out', 'opening', 'waiting', 'finishing', 'signing-out']) {
    assert.equal(hasAccountAccess({status, user: null}, null), false);
    assert.equal(hasAccountAccess({status, user: {id: 'stale-user'}}, null), false);
  }
  assert.equal(hasAccountAccess({status: 'signed-in', user: null}, null), false);
  assert.equal(hasAccountAccess({status: 'signed-in', user: {id: 'member'}}, null), true);
  for (const surface of ['home','market','asset','extension']) assert.equal(requiresAccount(surface), true);
  for (const surface of ['account','settings','workspace','ledger']) assert.equal(requiresAccount(surface), false);
});

test('existing demo account unlocks immediately, persists and locks again on sign out', () => {
  const values = new Map();
  const storage = {getItem: key => values.get(key) ?? null, setItem: (key,value) => values.set(key,value)};
  const store = createDemoAccountStore(storage, () => 'test-account');
  const changes = [];
  const unsub = store.subscribe(() => changes.push(hasAccountAccess(signedOut, store.getSnapshot())));
  assert.equal(hasAccountAccess(signedOut,store.getSnapshot()),false);
  store.signIn('guest@example.invalid');
  assert.equal(hasAccountAccess(signedOut,store.getSnapshot()),true);
  assert.equal(hasAccountAccess(signedOut,createDemoAccountStore(storage).getSnapshot()),true);
  store.signOut();
  assert.equal(hasAccountAccess(signedOut,createDemoAccountStore(storage).getSnapshot()),false);
  assert.deepEqual(changes,[true,false]);
  unsub();
});
