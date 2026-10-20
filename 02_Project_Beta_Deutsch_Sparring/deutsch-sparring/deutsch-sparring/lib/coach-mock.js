// The demo coach for MOCK=1 (no OpenAI key needed). It answers in the same format as the real model
// (COACH_SCHEMA) and uses the REAL numbers of the student (gaps, goals), so the whole chain can be tried:
// suggestion → setup screen, plan change → Apply / Keep. Server only.
import { addDays, dayNum, dayOf, goalState, MAX_MILESTONES } from './goals.js';

const wordsAny = (text, re) => re.test(String(text || ''));

// the grammar points a rule like "Genitiv nach wegen" is about
function grammarFor(rule) {
  const r = String(rule || '').toLowerCase();
  const out = [];
  if (r.includes('genitiv')) out.push('genitiv');
  if (r.includes('dativ')) out.push('dativ');
  if (r.includes('akkusativ')) out.push('akkusativ');
  if (r.includes('perfekt')) out.push('perfekt');
  if (r.includes('adjektiv') || r.includes('endung')) out.push('adjective-endings');
  return out;
}

const matchWords = (text) => String(text || '')
  .toLowerCase()
  .replace(/ß/g, 'ss')
  .split(/[^a-zäöü0-9]+/)
  .filter((word) => word.length >= 4);

function matchingLesson(lessons, label, level) {
  const words = matchWords(label);
  const ranked = lessons
    .filter((lesson) => !lesson.levels?.length || lesson.levels.includes(level))
    .map((lesson) => {
      const haystack = `${lesson.title} ${lesson.keywords || ''} ${lesson.objective || ''} ${lesson.rule || ''}`
        .toLowerCase()
        .replace(/ß/g, 'ss');
      const score = words.reduce((sum, word) => sum + (haystack.includes(word.slice(0, 7)) ? 1 : 0), 0);
      return { lesson, score };
    })
    .sort((a, b) => b.score - a.score || (a.lesson.unit || 99) - (b.lesson.unit || 99));
  return ranked[0]?.score > 0 ? ranked[0].lesson : null;
}

function suggestionFor(home, topics, goalLevel) {
  const gap = home.gaps[0];
  const vocab = topics.filter((x) => x.type === 'Wortschatz' && !x.parent && x.id !== 'free');
  const lessons = topics.filter((x) => x.type !== 'Wortschatz' && x.id !== 'free');
  const level = home.goals.find((g) => g.id === gap?.goalId)?.level || goalLevel || 'B1';
  const base = { level, difficulty: gap && gap.pct < 50 ? 'easy' : 'medium', questions: gap ? 20 : 10 };

  if (gap?.kind === 'list') {
    const topic = topics.find((x) => x.type === 'Wortschatz' && x.title === gap.label) || topics.find((x) => x.type === 'Wortschatz' && x.title.startsWith(gap.label.split(' › ')[0]));
    if (topic) return { ...base, kind: 'vocab', topicId: topic.id, grammar: [] };
  }
  if (gap?.kind === 'rule') {
    const points = grammarFor(gap.label);
    const lesson = matchingLesson(lessons, gap.label, level);
    if (lesson) return { ...base, kind: 'grammar', topicId: lesson.id, grammar: [] };
    if (vocab[0]) return { ...base, kind: 'vocab', topicId: vocab[0].id, grammar: points };
  }
  // With no measured gap yet, start with the first curriculum unit at the learner's level.
  const first = lessons
    .filter((lesson) => !lesson.levels?.length || lesson.levels.includes(level))
    .sort((a, b) => (a.unit || 99) - (b.unit || 99))[0] || vocab[0] || lessons[0];
  return first ? { ...base, kind: first.type === 'Wortschatz' ? 'vocab' : 'grammar', topicId: first.id, grammar: [] } : null;
}

// A milestone with real content, like a teacher would set it: the weakest grammar rule of the goal
// ("Genitiv nach wegen: 80 % right"), else the word list of the goal's level with the most words still to learn
// ("Furniture: all 45 words learnt").
// an exam goal needs the words of every lower level too
const levelsOfGoal = (goal) => (goal.type === 'exam' ? ['A1', 'A2', 'B1'].slice(0, ['A1', 'A2', 'B1'].indexOf(goal.level) + 1) : [goal.level]);
function concreteStep(home, goal) {
  const rule = home.gaps.find((x) => x.kind === 'rule' && (!x.goalId || x.goalId === goal.id));
  if (goal.type !== 'vocab' && rule) return `${rule.label}: 80 % right`;
  const lists = (home.vocab?.byList || [])
    .filter((l) => levelsOfGoal(goal).some((lv) => (l.levels[lv] || 0) > 0) && l.learnt < l.total)
    .filter((l) => !goal.scope.section || l.topic.startsWith(goal.scope.section))
    .sort((a, b) => (b.total - b.learnt) - (a.total - a.learnt));
  const l = lists[0];
  if (l) return `${l.topic.split(' › ').pop()}: all ${l.total} words learnt`;
  return rule ? `${rule.label}: 80 % right` : `${goal.level} words: next 40 learnt`;
}

// a plan for fewer minutes: the next two open milestones move 14 days, plus one concrete step halfway
function replan(home, today, minutes) {
  const open = home.goals.filter((g) => g.endDate >= today);
  if (!open.length) return null;
  const goal = open.find((g) => goalState(g, home.progress?.[g.id] ?? 0, today).tag === 'behind') || open[0];
  const progress = home.progress?.[goal.id] ?? 0;
  const next = goal.milestones
    .filter((m) => m.status !== 'done' && m.target > progress && m.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  const changes = [];
  for (const m of next.slice(0, 2)) {
    const date = dayOf(Math.min(dayNum(goal.endDate), dayNum(m.date) + 14));
    if (date !== m.date) changes.push({ action: 'move', milestoneId: m.id, date, title: null, target: null });
  }
  // one concrete step on the way to the first open milestone (after it was moved), so the targets still rise with the date
  const first = next[0];
  const firstDate = first ? (changes.find((c) => c.milestoneId === first.id)?.date || first.date) : goal.endDate;
  const firstTarget = first ? first.target : 100;
  const gap = dayNum(firstDate) - dayNum(today);
  const target = Math.round((progress + firstTarget) / 2);
  if (gap >= 6 && target > progress && target < firstTarget && goal.milestones.length < MAX_MILESTONES) {
    changes.push({ action: 'add', milestoneId: null, date: addDays(today, Math.round(gap / 2)), title: concreteStep(home, goal), target });
  }
  if (!changes.length) return { goal, planChanges: null, minutes };
  return { goal, planChanges: { goalId: goal.id, changes }, minutes };
}

// → the raw answer (like the model's JSON object); lib/coach.js cleans it
export function mockCoach({ text, kind, name, home, topics, today }) {
  const quick = ['What should I practise today?', 'I only have 30 minutes a day, redo my plan', 'Where am I weakest?'];
  const level = home.goals[0]?.level || 'B1';
  const noGoal = home.goals.length ? '' : ' You have no goal yet. Press "New goal" on this page and I can plan with you.';
  const gap = home.gaps[0];

  const recommend = (intro) => {
    const suggestedSession = suggestionFor(home, topics, level);
    const why = gap
      ? `Your biggest gap is "${gap.label}": ${gap.pct} % right in ${gap.n} answers.`
      : home.tiles.answered
        ? `You answered ${home.tiles.answered} questions and ${home.tiles.pctRight} % were right. No clear gap yet.`
        : 'You have no answers in the last 30 days, so a short first session shows us where you are.';
    return {
      message: `${intro} ${why} Let's practise it today.${noGoal}`,
      suggestedSession,
      planChanges: null,
      quickReplies: quick.slice(1),
    };
  };

  if (kind === 'greeting') return recommend(`Hi ${name || 'there'}!`);

  const asksPlan = wordsAny(text, /minute|plan|schedule|re-?plan|busy|time|week|milestone|deadline/i);
  if (asksPlan) {
    const minutes = Number((String(text).match(/(\d{1,3})\s*min/i) || [])[1]) || null;
    const r = replan(home, today, minutes);
    if (!home.goals.length) {
      return { message: 'I cannot plan without a goal. Press "New goal" on this page, then ask me again.', suggestedSession: null, planChanges: null, quickReplies: quick.slice(0, 2) };
    }
    if (!r?.planChanges) {
      return { message: 'Your plan already fits the time you have left. I would not change anything.', suggestedSession: null, planChanges: null, quickReplies: quick.slice(0, 2) };
    }
    const how = minutes ? `${minutes} minutes a day is about ${Math.max(10, Math.round((minutes / 1.5) / 10) * 10)} questions.` : 'A calmer plan is fine.';
    return {
      message: `${how} For "${r.goal.title}" I would move your next milestones a little later and add one concrete step on the way: \"${r.planChanges.changes.find((c) => c.action === 'add')?.title || 'the next list'}\". Do you want these changes?`,
      suggestedSession: null,
      planChanges: r.planChanges,
      quickReplies: ['What should I practise today?'],
    };
  }

  if (wordsAny(text, /weak|gap|worst|mistake|problem/i)) {
    const lines = home.gaps.slice(0, 3).map((x) => `"${x.label}" (${x.pct} %)`);
    return {
      message: lines.length ? `Your weakest spots in the last 30 days: ${lines.join(', ')}. I suggest we start with the first one.` : 'I see no clear gaps yet. Answer a few more questions and I can tell you more.',
      suggestedSession: lines.length ? suggestionFor(home, topics, level) : null,
      planChanges: null,
      quickReplies: quick.slice(1),
    };
  }

  return recommend('Good question.');
}
