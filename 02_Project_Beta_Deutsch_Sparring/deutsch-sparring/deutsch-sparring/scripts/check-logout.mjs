// Checks review R7 "log out clears this browser": clearAccountData(username) (lib/storage.js) removes that
// student's per-account keys and the class code in the profile, and keeps every other student's keys.
// A FAKE localStorage is used, so nothing is read from a real browser:
//   node scripts/check-logout.mjs
process.removeAllListeners('warning');
import { register } from 'node:module';

// lib/*.js import each other without ".js" – teach plain node to cope (Next.js does this by itself)
register('data:text/javascript,' + encodeURIComponent(`export async function resolve(s, c, next) {
  try { return await next(s, c); } catch (e) { if (s.startsWith('.')) { try { return await next(s + '.js', c); } catch {} } throw e; }
}`));

let failed = 0;
function check(name, ok, detail = '') {
  if (!ok) failed += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || !detail ? '' : ` – ${detail}`}`);
}

// ---- a fake browser storage (same methods as localStorage) ----
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
const has = (k) => store.has(k);

const S = await import('../lib/storage.js');

// Anna (logged in) and Ben (another student who used the same computer)
store.set('wort_profile', JSON.stringify({ name: 'anna', classCode: 'KLASSE-7', clientId: 'abc123' }));
for (const who of ['anna', 'ben']) {
  for (const key of ['wort_history', 'wort_chat', 'wort_scores', 'wort_scores_v2', 'wort_goals', 'wort_answerlog', 'wort_rulelog', 'wort_coach', 'wort_coachtry', 'wort_zoom']) {
    store.set(`${key}@${who}`, '{"x":1}');
  }
  store.set(`wort_imported@${who}`, '1');
}
store.set('wort_prefs', '{"view":"glance"}');

S.clearAccountData('Anna');

const annaLeft = [...store.keys()].filter((k) => k.endsWith('@anna'));
check('Anna: no per-account keys left', annaLeft.length === 0, annaLeft.join(', '));
const profileNow = JSON.parse(store.get('wort_profile'));
check('Anna: the class code is gone from the profile', !('classCode' in profileNow));
check('Anna: the rest of the profile is kept', profileNow.clientId === 'abc123' && profileNow.name === 'anna');
const benKeys = [...store.keys()].filter((k) => k.endsWith('@ben'));
check("Ben's keys are kept", benKeys.length === 11, String(benKeys.length));
check('the shared preferences are kept', has('wort_prefs'));

// nothing to remove, no name: must not throw
store.clear();
let threw = false;
try {
  S.clearAccountData('');
  S.clearAccountData(undefined);
  S.clearAccountData('nobody');
} catch {
  threw = true;
}
check('an empty name or no profile does not throw', !threw);

// blocked storage: must not throw
globalThis.localStorage = {
  getItem() { throw new Error('blocked'); },
  setItem() { throw new Error('blocked'); },
  removeItem() { throw new Error('blocked'); },
};
threw = false;
try { S.clearAccountData('anna'); } catch { threw = true; }
check('blocked storage does not throw', !threw);

console.log(failed ? `\n${failed} check(s) failed` : '\nAll logout checks passed.');
process.exit(failed ? 1 : 0);
