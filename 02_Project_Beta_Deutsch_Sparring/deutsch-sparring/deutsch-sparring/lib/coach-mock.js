// The demo coach for MOCK=1 (no Gemini key needed). It answers in the same format as the real model
// (COACH_SCHEMA) and uses the REAL numbers of the student (gaps, goals), so the whole chain can be tried:
// suggestion → setup screen, a new goal → preview → Accept, plan change → Apply. Server only.
// Goals (R12): it understands "Goethe B1 by <month>", "A1 vocabulary", "A2 grammar", "30 minutes a day",
// "move it to <month>" and "rename it to <name>" and answers with proposeGoal / planChanges like the real model.
import { dayNum } from './goals.js';
import { PLAN_VERSION, allMilestones } from './plan.js';
import { milestoneTitle } from './plan-templates.js';

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

// ---------- the voice (R15): an old-school boxing coach, kept light ----------
// At most ONE boxing phrase per message, and in only about one message of three (picked from the day and the text, so a
// demo run looks the same every time).
const PUNCH = ['Good round.', 'Keep your guard up.', 'Back in the ring.', 'Stay on your toes.', 'One more round.'];
function punch(seed, today) {
  const n = [...`${today}${seed}`].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 9973, 7);
  return n % 3 === 0 ? PUNCH[n % PUNCH.length] : '';
}
const join = (...parts) => parts.filter(Boolean).join(' ');

// the milestone Home shows as "Next up" (lib/home-plan.js nextUp), with its numbers → { id, title, have, need, unit, date, session } or null
function nextMilestone(home) {
  const nu = home.nextUp;
  const goal = nu && home.goals.find((g) => g.id === nu.goalId);
  const hit = goal && Number(goal.version) === PLAN_VERSION ? allMilestones(goal).find(({ m }) => m.id === nu.milestoneId) : null;
  const session = nu && home.sessions?.[nu.milestoneId];
  if (!hit || !session) return null;
  const info = home.plans?.[goal.id]?.milestones?.[hit.m.id] || {};
  return { id: nu.milestoneId, goal, title: milestoneTitle(hit.m.criterion), have: info.have ?? 0, total: info.total ?? 0, unit: info.unit || 'words', date: hit.m.date || null, session };
}

// ---------- goals by talking (R12) ----------
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const MONTHS_DE = ['januar', 'februar', 'märz', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'dezember'];
const MONTH_RE = new RegExp(`\\b(${[...MONTHS, ...MONTHS_DE].join('|')})\\b`, 'i');

// the last day of the next time this month comes (at least 3 weeks away), as YYYY-MM-DD
function monthEnd(text, today) {
  const m = String(text || '').match(MONTH_RE);
  if (!m) return null;
  const name = m[1].toLowerCase();
  const index = MONTHS.includes(name) ? MONTHS.indexOf(name) : MONTHS_DE.indexOf(name);
  const year = Number(today.slice(0, 4));
  const last = (y) => new Date(Date.UTC(y, index + 1, 0)).toISOString().slice(0, 10);
  return dayNum(last(year)) - dayNum(today) >= 21 ? last(year) : last(year + 1);
}
const levelIn = (text) => (String(text || '').match(/\b(a1|a2|b1)\b/i) || [])[1]?.toUpperCase() || null;
const minutesIn = (text) => {
  const n = Number((String(text || '').match(/(\d{1,3})\s*(?:min|minutes)\b/i) || [])[1]);
  return [15, 20, 30, 45].includes(n) ? n : n ? [15, 20, 30, 45].reduce((b, v) => (Math.abs(v - n) < Math.abs(b - n) ? v : b), 15) : null;
};
const niceDay = (day) => new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

// the goal the last coach message proposed ("[proposed goal: template exam, B1, until 2026-12-31, 20 min a day …]")
function lastProposal(history) {
  const last = [...(history || [])].reverse().find((m) => m.role === 'model' && /\[proposed goal:/.test(m.text));
  const m = last && last.text.match(/\[proposed goal: template (\w+), (A1|A2|B1)(?:, until (\d{4}-\d{2}-\d{2}))?, (\d+) min a day/);
  if (!m || /the student accepted it/.test(last.text)) return null;
  return { template: m[1], level: m[2], endDate: m[3] || null, minutesPerDay: Number(m[4]) };
}

const KIND_OF = (text) => {
  const t = String(text || '');
  if (/goethe|exam|prüfung|pruefung|zertifikat/i.test(t)) return 'exam';
  if (/grammar|grammatik/i.test(t)) return 'grammar';
  if (/vocab|words?\b|wortschatz/i.test(t)) return 'vocab';
  return null;
};

function proposalAnswer(p, quick) {
  const when = p.endDate ? ` It ends on ${niceDay(p.endDate)}.` : '';
  const what = { exam: `the Goethe ${p.level} exam`, vocab: `${p.level} vocabulary`, grammar: `${p.level} grammar` }[p.template];
  return {
    message: `Good goal: ${what}.${when} Here is the plan I would make, with ${p.minutesPerDay} minutes a day. Accept it if it looks right, or tell me what to change.`,
    suggestedSession: null,
    proposeGoal: {
      template: p.template, level: p.level, endDate: p.endDate || null, minutesPerDay: p.minutesPerDay, startLevel: null, options: null,
    },
    planChanges: null,
    quickReplies: quick,
  };
}

// → the raw answer (like the model's JSON object); lib/coach.js cleans it
export function mockCoach({ text, kind, name, home, topics, today, history = [] }) {
  const hasGoals = home.goals.length > 0;
  // plan chips only with a goal
  const examGoal = home.goals.some((g) => g.template === 'exam' || g.isExam);
  const quick = hasGoals
    ? ['What should I practise today?', 'Where am I weakest?', 'I have less time, redo my plan', ...(examGoal ? [] : ['Move my goal date'])]
    : ['What should I practise today?', 'Where am I weakest?', 'I want to set a goal'];
  const level = home.goals[0]?.level || (home.tiles.answered ? 'B1' : 'A1'); // a first session starts at the beginning
  const noGoal = hasGoals ? '' : ' You have no goal yet. Tell me what you want to reach, for example "Goethe B1 by March", and I will make a plan.';
  const gap = home.gaps[0];
  const next = nextMilestone(home);

  const recommend = (intro) => {
    // With a plan, the session is always the next milestone: the same one the Home page shows as "Next up".
    if (next) {
      const s = next.session;
      const counted = next.total && ['words', 'lessons'].includes(next.unit) ? `${next.have} of ${next.total} ${next.unit}` : next.total && next.unit === 'answers' ? `${next.have} of the last ${next.total} right` : '';
      const count = counted ? ` ${counted}${next.date ? `, due ${niceDay(next.date)}` : ''}.` : '';
      const sessionLine = `${s.questions} questions on ${s.difficulty === 'easy' ? 'easy' : s.difficulty === 'hard' ? 'hard' : 'medium'} should move it.`;
      return {
        message: join(intro, `${next.title} is next.${count}`, sessionLine, punch(next.title, today)),
        suggestedSession: { milestoneId: next.id, kind: s.kind, level: s.level || next.goal.level, difficulty: s.difficulty, questions: s.questions },
        proposeGoal: null,
        planChanges: null,
        quickReplies: quick.slice(1),
      };
    }
    const suggestedSession = suggestionFor(home, topics, level);
    const why = gap
      ? `Your biggest gap is "${gap.label}": ${gap.pct} % right in ${gap.n} answers.`
      : home.tiles.answered
        ? `You answered ${home.tiles.answered} questions and ${home.tiles.pctRight} % were right. No clear gap yet.`
        : 'You have no answers in the last 30 days, so a short first session shows us where you are.';
    return {
      message: join(intro, why, 'Practise it today.', noGoal.trim(), punch(why, today)),
      suggestedSession,
      proposeGoal: null,
      planChanges: null,
      quickReplies: quick.slice(1),
    };
  };

  if (kind === 'greeting') return recommend(`Hi ${name || 'there'}.`);

  const v2 = home.goals.filter((g) => Number(g.version) === PLAN_VERSION);
  const target = v2.at(-1);
  const t = String(text || '');
  const end = monthEnd(t, today);

  // changing a proposal that is still waiting ("make it 30 minutes", "a month later")
  const waiting = lastProposal(history);
  if (waiting && (minutesIn(t) || end || levelIn(t) || KIND_OF(t))) {
    return proposalAnswer({
      template: KIND_OF(t) || waiting.template,
      level: levelIn(t) || waiting.level,
      endDate: end || waiting.endDate,
      minutesPerDay: minutesIn(t) || waiting.minutesPerDay,
    }, ['Looks good', 'What should I practise today?']);
  }

  // a new goal
  const goalKind = KIND_OF(t);
  const wantsNew = /new goal|set a goal|neues ziel|my goal|goal/i.test(t) && !/rename|call it|move|push|extend/i.test(t);
  if (goalKind && !/weak|gap|worst/i.test(t) && !/rename|call it|move|push|extend/i.test(t)) {
    const level = levelIn(t);
    if (!level && goalKind !== 'exam') {
      return {
        message: 'Which level do you want to work on: A1, A2 or B1?', suggestedSession: null, proposeGoal: null, planChanges: null, quickReplies: ['A1', 'A2', 'B1'],
      };
    }
    return proposalAnswer({
      template: goalKind, level: level || 'B1', endDate: end || null, minutesPerDay: minutesIn(t) || 20,
    }, ['30 minutes a day instead', 'What should I practise today?']);
  }
  if (wantsNew) {
    return {
      message: 'Tell me what you want to reach and by when. For example: "Goethe B1 by March", "A1 vocabulary" or "A2 grammar".',
      suggestedSession: null,
      proposeGoal: null,
      planChanges: null,
      quickReplies: ['Goethe B1 by March', 'A1 vocabulary', 'A2 grammar'],
    };
  }

  // changing a goal the student has: rename, new end date, new time per day
  const rename = t.match(/\b(?:rename|call)\b.*?\b(?:to|as)\s+["“']?([^"”']{2,40}?)["”']?\s*$/i)
    || t.match(/\bcall (?:it|my goal|this)\s+["“']?([^"”']{2,40}?)["”']?\s*$/i);
  const asksDate = end && /move|push|extend|later|end date|until|postpone/i.test(t);
  const asksMinutes = minutesIn(t) && /day|daily|plan|time/i.test(t);
  if (/move my goal date|goal date|end date/i.test(t) && !end && target) {
    return target.template === 'exam' || target.isExam
      ? { message: 'The exam date does not move. I can give your plan less time per day or leave something out instead. Which one?', suggestedSession: null, proposeGoal: null, planChanges: null, quickReplies: ['I have less time, redo my plan'] }
      : { message: 'To which month? For example "move it to June".', suggestedSession: null, proposeGoal: null, planChanges: null, quickReplies: [] };
  }
  if (rename || asksDate || asksMinutes || wordsAny(t, /re-?plan|redo my plan|busy|less time/i)) {
    if (!target) {
      return {
        message: 'I do not see a goal to change yet. Tell me what you want to reach, for example "Goethe B1 by March".', suggestedSession: null, proposeGoal: null, planChanges: null, quickReplies: ['Goethe B1 by March', 'A1 vocabulary'],
      };
    }
    // "less time, redo my plan" without a number: one step down from the pace of the plan
    const lessTime = !asksMinutes && wordsAny(t, /re-?plan|redo my plan|busy|less time/i);
    const lower = [15, 20, 30, 45].filter((x) => x < (target.pace?.minutesPerDay || 20)).at(-1) || 15;
    const planChanges = {
      goalId: target.id,
      label: rename ? rename[1].trim() : null,
      endDate: asksDate && target.template !== 'exam' ? end : null,
      minutesPerDay: asksMinutes ? minutesIn(t) : lessTime ? lower : null,
      cut: [],
    };
    const bits = [];
    if (planChanges.label) bits.push(`call it "${planChanges.label}"`);
    if (planChanges.endDate) bits.push(`move the end date to ${niceDay(planChanges.endDate)}`);
    if (planChanges.minutesPerDay) bits.push(`plan with ${planChanges.minutesPerDay} minutes a day`);
    if (asksDate && target.template === 'exam') bits.push('keep the exam date (it does not move)');
    if (!planChanges.label && !planChanges.endDate && !planChanges.minutesPerDay) {
      return { message: 'Tell me what to change: the name, the end date or the minutes per day.', suggestedSession: null, proposeGoal: null, planChanges: null, quickReplies: ['30 minutes a day'] };
    }
    return {
      message: join(`For "${target.title}" I would ${bits.join(' and ')}.`, 'Look at the before and after below and tap Apply if it is right.', punch(bits.join(), today)),
      suggestedSession: null,
      proposeGoal: null,
      planChanges,
      quickReplies: ['What should I practise today?'],
    };
  }

  if (wordsAny(text, /weak|gap|worst|mistake|problem/i)) {
    if (next && !home.gaps.length) return recommend('No clear gaps yet.');
    const lines = home.gaps.slice(0, 3).map((x) => `"${x.label}" (${x.pct} %)`);
    return {
      message: lines.length
        ? join(`Your weakest spots in the last 30 days: ${lines.join(', ')}.`, next ? `Your next milestone, ${next.title}, is the best place to work on them.` : 'Start with the first one.', punch('weak', today))
        : 'I see no clear gaps yet. Answer a few more questions and I can tell you more.',
      suggestedSession: next ? recommend('').suggestedSession : lines.length ? suggestionFor(home, topics, level) : null,
      proposeGoal: null,
      planChanges: null,
      quickReplies: quick.slice(1),
    };
  }

  return recommend('');
}
