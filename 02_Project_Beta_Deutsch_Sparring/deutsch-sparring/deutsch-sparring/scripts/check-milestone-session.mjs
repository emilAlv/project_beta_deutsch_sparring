// Checks review R14: a Sparring session that belongs to a plan milestone – the setup strip (match / mismatch),
// sessions.settings.milestoneId (kept and cleaned, browser and server), and the "Your milestone" box numbers.
//   node scripts/check-milestone-session.mjs
process.removeAllListeners('warning');
import { register } from 'node:module';

// lib/*.js import each other without ".js" – teach plain node to cope (Next.js does this by itself)
register('data:text/javascript,' + encodeURIComponent(`export async function resolve(s, c, next) {
  try { return await next(s, c); } catch (e) { if (s.startsWith('.')) { try { return await next(s + '.js', c); } catch {} } throw e; }
}`));
process.env.WORT_CHECK = '1';
process.env.DATABASE_URL = 'postgres://fake.invalid/none'; // never contacted: nothing here touches the database
delete process.env.POSTGRES_URL;
const PT = await import('../lib/plan-templates.js');
const PP = await import('../lib/plan-progress.js');
const HP = await import('../lib/home-plan.js');
const MS = await import('../lib/milestone-session.js');
const SS = await import('../lib/session-settings.js');
const SC = await import('../lib/scores.js');
const W = await import('../lib/words.js');
const { cleanSettings, cleanSession } = await import('../lib/progress.js');

let failed = 0;
function check(name, ok, detail = '') {
  if (!ok) failed += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || !detail ? '' : ` – ${detail}`}`);
}
const eq = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const TODAY = '2026-10-28';
const words = W.getWords();
const ctx0 = { words, sections: W.listSections(), today: TODAY, scores: {}, grammarStats: {} };
const built = PT.previewPlan({ template: 'exam', endDate: '2027-04-24', minutesPerDay: 20, startLevel: 'A1', options: { level: 'B1' } }, ctx0);
const goal = built.goal;
const compute = (scores = {}, grammarStats = {}) => PP.computePlans({ goals: [goal], words, scores, grammarStats, today: TODAY, lastPractice: Date.parse(TODAY) });
const plans0 = compute().plans;
const stats = (plans) => ({ goals: [goal], plans });

// a vocabulary milestone with its Practise-this settings
const vocabPart = goal.subPlans.find((p) => p.kind === 'vocab');
const vm = vocabPart.milestones[0];
const vSession = HP.homeExtras([goal], plans0, TODAY, { grammarStats: {} }).sessions[vm.id];
const patch = { kind: 'vocab', level: vSession.level, source: vSession.source, difficulty: vSession.difficulty, questions: vSession.questions, section: 'w:sec', list: 'w:sec:list' };

// ---- the strip: match / mismatch ----
const form = { ...SS.DEFAULT_SETUP, ...patch };
check('strip: the form that came from the milestone matches it', MS.setupMatches(form, patch));
check('strip: difficulty, number of questions and variant are free', MS.setupMatches({ ...form, difficulty: 'hard', questions: 50, variant: 'de' }, patch));
check('strip: another level no longer matches (grey)', !MS.setupMatches({ ...form, level: form.level === 'A1' ? 'B1' : 'A1' }, patch));
check('strip: another list no longer matches', !MS.setupMatches({ ...form, list: 'w:sec:other' }, patch));
check('strip: another section no longer matches', !MS.setupMatches({ ...form, section: 'w:other' }, patch));
check('strip: another source no longer matches', !MS.setupMatches({ ...form, source: form.source === 'kurs' ? 'goethe' : 'kurs' }, patch));
check('strip: grammar instead of words no longer matches', !MS.setupMatches({ ...form, kind: 'grammar' }, patch));
check('strip: "Back to milestone" (form + patch) matches again', MS.setupMatches({ ...form, level: 'A2', list: null, ...patch }, patch));
const gpatch = { kind: 'grammar', level: 'A2', grammarTopic: 'g1' };
check('strip: grammar topic must stay the same', MS.setupMatches({ ...SS.DEFAULT_SETUP, ...gpatch }, gpatch) && !MS.setupMatches({ ...SS.DEFAULT_SETUP, ...gpatch, grammarTopic: 'g2' }, gpatch));
check('strip: no milestone → never matches', !MS.setupMatches(form, null));

// ---- milestoneId in the settings: browser and server ----
const setup = { ...SS.DEFAULT_SETUP, ...patch };
const st = SS.sessionSettings(setup, 'Topic', { id: vm.id, title: PT.milestoneTitle(vm.criterion) });
eq('settings: milestoneId and the template title are kept', [st.milestoneId, st.milestoneTitle], [vm.id, PT.milestoneTitle(vm.criterion)]);
check('settings: a session without a milestone has no milestoneId', !('milestoneId' in SS.sessionSettings(setup, 'Topic')) && !('milestoneId' in SS.sessionSettings(setup, 'Topic', { id: '', title: 'x' })));
check('settings: a bad id is not stored', !('milestoneId' in SS.sessionSettings(setup, 'Topic', { id: 'a b;DROP', title: 'x' })));
eq('server: cleanSettings keeps a good milestoneId', cleanSettings(st).milestoneId, vm.id);
const bad = cleanSettings({ ...st, milestoneId: "x'; DROP TABLE sessions;--" });
check('server: a bad milestoneId (and its title) is dropped', !('milestoneId' in bad) && !('milestoneTitle' in bad));
check('server: an id that is too long or not a string is dropped', !('milestoneId' in cleanSettings({ milestoneId: 'a'.repeat(41) })) && !('milestoneId' in cleanSettings({ milestoneId: { a: 1 } })) && !('milestoneId' in cleanSettings({ milestoneId: 7 })));
eq('server: cleanSession keeps it', cleanSession({ id: 's1', settings: st, total: 20 }).settings.milestoneId, vm.id);
check('setup form again from the settings does not carry the id', !('milestoneId' in SS.setupFrom(st, [])));

// ---- the summary box numbers ----
const members = PP.chunkWords(vocabPart, words);
const ids = members.get(vm.id) || [];
check('vocab milestone has words', ids.length >= 4, String(ids.length));
const good = () => SC.recordFromCompact([9, null, 9, null]);
const learnt = (n) => Object.fromEntries(ids.slice(0, n).map((id) => [id, good()]));
const nowPlans = (n) => compute(learnt(n)).plans;
const before = MS.milestoneSnapshot(nowPlans(2));
const mid = MS.milestoneSummary(before, stats(nowPlans(5)), vm.id);
eq('box: words 2 → 5 of the chunk', [mid.state, mid.primary.from, mid.primary.to, mid.primary.total, mid.primary.reached], ['plan', 2, 5, ids.length, false]);
eq('box: the title comes from the templates', mid.primary.title, PT.milestoneTitle(vm.criterion));
eq('box: the part comes from the templates', mid.primary.partTitle, PT.partTitle(vocabPart));
check('box: nothing moved → from = to', (() => { const s = MS.milestoneSummary(before, stats(nowPlans(2)), vm.id); return s.primary.from === 2 && s.primary.to === 2 && !s.primary.justReached; })());
const done = MS.milestoneSummary(before, stats(nowPlans(ids.length)), vm.id);
check('box: reached when the chunk is learnt', done.primary.reached && done.primary.justReached && done.primary.to === ids.length);
const again = MS.milestoneSummary(MS.milestoneSnapshot(nowPlans(ids.length)), stats(nowPlans(ids.length)), vm.id);
check('box: reached before the session → "already reached", not "just reached"', again.primary.reached && !again.primary.justReached);

// other milestones that moved (a second chunk of the same part)
const vm2 = vocabPart.milestones[1];
const ids2 = members.get(vm2.id) || [];
const both = { ...learnt(5), ...Object.fromEntries(ids2.slice(0, 3).map((id) => [id, good()])) };
const alsoRes = MS.milestoneSummary(before, stats(compute(both).plans), vm.id);
const a2 = alsoRes.also.find((x) => x.id === vm2.id);
check('box: "also counted" lists another milestone that went up, with its own title', a2 && a2.plus === 3 && a2.title === PT.milestoneTitle(vm2.criterion), JSON.stringify(alsoRes.also));
check('box: the milestone itself is not in "also"', !alsoRes.also.some((x) => x.id === vm.id));
const noMs = MS.milestoneSummary(before, stats(compute(both).plans), null);
check('box: a session without a milestone that still moved one → no primary, counted lines', noMs.state === 'plan' && !noMs.primary && noMs.also.length >= 1);
eq('box: a session that matched nothing → "not in your plan"', MS.milestoneSummary(before, stats(nowPlans(2)), null).state, 'none');
eq('box: an unknown milestone id → no primary', MS.milestoneSummary(before, stats(nowPlans(2)), 'nope').state, 'none');
check('box: no snapshot from before → no invented movement', (() => { const s = MS.milestoneSummary(null, stats(nowPlans(5)), vm.id); return s.primary.from === s.primary.to && s.also.length === 0; })());

// ---- grammar in its own wording ----
const gm = goal.subPlans.find((p) => p.kind === 'grammar').milestones.find((m) => m.criterion.kind === 'grammar');
const gStats = (n, ok) => ({ [gm.criterion.topicId]: { n, pct: Math.round((ok / n) * 100), recent: Array.from({ length: Math.min(n, 20) }, (_, i) => [i < ok ? 1 : 0, 0, Date.parse(TODAY) - (i % 3) * 86_400_000]) } });
const gBefore = MS.milestoneSnapshot(compute({}, gStats(20, 10)).plans);
const gRes = MS.milestoneSummary(gBefore, stats(compute({}, gStats(20, 14)).plans), gm.id);
eq('grammar: unit is answers, 10 → 14 of the last 20', [gRes.primary.unit, gRes.primary.from, gRes.primary.to, gRes.primary.total], ['answers', 10, 14, 20]);
check('grammar: the topic title comes from the curriculum', gRes.primary.title === PT.milestoneTitle(gm.criterion));

console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll milestone-session checks passed.');
process.exit(failed ? 1 : 0);
