import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('firebase.js', 'utf8');
const values = new Map([
  ['smartfarm.firebase.idToken', 'stale-id-token'],
  ['smartfarm.firebase.user', JSON.stringify({ localId: 'uid-401', email: 'test@example.com' })]
]);
const events = [];
const context = {
  console,
  URLSearchParams,
  AbortController,
  setTimeout,
  clearTimeout,
  CustomEvent: class CustomEvent { constructor(type) { this.type = type; } },
  localStorage: {
    getItem(key) { return values.get(key) || null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  },
  fetch: async () => ({
    status: 401,
    async text() { return '{"error":"Permission denied"}'; },
    async json() { return { error: 'Permission denied' }; }
  }),
  window: {
    dispatchEvent(event) { events.push(event.type); }
  }
};
vm.createContext(context);
vm.runInContext(source, context, { filename: 'firebase.js' });

let requestError = null;
try { await context.window.FirebaseDB.get('cucumberSales'); } catch (error) { requestError = error; }
assert.equal(requestError?.message.startsWith('HTTP 401'), true, '401 request must reject with an HTTP 401 error');
assert.deepEqual(events, ['firebase:auth-expired'], '401 must emit the auth-expired event');
assert.equal(values.has('smartfarm.firebase.idToken'), false, 'stale token must be cleared');
assert.equal(values.has('smartfarm.firebase.user'), false, 'stale user must be cleared');

console.log('Auth expiry regression: 4 passed, 0 failed');
