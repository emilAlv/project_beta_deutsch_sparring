// MOCK=1: a scripted tutor that answers in the same JSON shape as the real one, without AI.
// It plays the "Umzug" role-play (8 tasks, Wechselpräpositionen) and understands the main
// commands, so every part of the screen can be tested locally:
//   onboarding → topic → right / wrong answers → hint, rule, skip → easier / harder, level
//   → "show me progress" → end of session. Extra test words: "langsam" (slow answer),
//   "kaputt" (broken JSON), "rohtext" (plain text instead of JSON), "absturz" (server error).

import { ModelError } from './gemini';

const SPEAKER = 'Dein Freund Marco';
const SCENARIO = 'Umzug';
const THEME = 'Marco hilft dir beim Umzug. Du sagst ihm, wohin die Möbel kommen.';

const TASKS = [
  {
    line: 'Hallo! Ich bin da. Wo stehen die Kisten jetzt?',
    lineHard: 'So, da bin ich! Sag mal, wo hast du die ganzen Kisten hingestellt – wo stehen die jetzt?',
    hint: 'Antworte mit in + der Flur',
    easy: '(im Flur oder in den Flur?)',
    choices: ['Die Kisten stehen im Flur.', 'Die Kisten stehen in den Flur.'],
    expect: /\b(im|in dem) (flur|gang)\b/,
    wrong: /\bin (den|der|das|die) (flur|gang)\b/,
    fix: 'im Flur',
    canonical: 'Die Kisten stehen im Flur.',
    rule: 'Wo? → Dativ',
    explanation: 'stehen = Position: Wo? → Dativ. in + dem = im.',
  },
  {
    line: 'Gut. Und der Teppich? Wohin legst du ihn?',
    lineHard: 'Perfekt. Und den Teppich da – wohin legst du den?',
    hint: 'Antworte mit vor + das Sofa',
    easy: '(vor das Sofa oder vor dem Sofa?)',
    choices: ['Ich lege den Teppich vor das Sofa.', 'Ich lege den Teppich vor dem Sofa.'],
    expect: /\bvor (das|s) sofa|\bvors sofa/,
    wrong: /\bvor (dem|den|der) sofa/,
    fix: 'vor das Sofa',
    canonical: 'Ich lege den Teppich vor das Sofa.',
    rule: 'Wohin? → Akkusativ',
    explanation: 'legen zeigt eine Bewegung: Wohin? → Akkusativ.',
  },
  {
    line: 'Und das Sofa? Wohin stellen wir es?',
    lineHard: 'Uff, das Sofa ist schwer! Wohin stellen wir das?',
    hint: 'Antworte mit an + die Wand',
    easy: '(an die Wand oder an der Wand?)',
    choices: ['Wir stellen das Sofa an die Wand.', 'Wir stellen das Sofa an der Wand.'],
    expect: /\ban die wand/,
    wrong: /\ban (der|den|dem) wand/,
    fix: 'an die Wand',
    canonical: 'Wir stellen das Sofa an die Wand.',
    rule: 'Wohin? → Akkusativ',
    explanation: 'stellen zeigt eine Bewegung: Wohin? → Akkusativ. *an der Wand* wäre die Position (Wo?).',
  },
  {
    line: 'Super. Und die Lampe? Wo hängt sie jetzt?',
    lineHard: 'Schau mal nach oben – wo hängt die Lampe jetzt eigentlich?',
    hint: 'Diesmal: Wo? Tipp: über + der Esstisch',
    easy: '(über dem Esstisch oder über den Esstisch?)',
    choices: ['Die Lampe hängt über dem Esstisch.', 'Die Lampe hängt über den Esstisch.'],
    expect: /(?<![a-zäöü])über dem esstisch/,
    wrong: /(?<![a-zäöü])über (den|der|das) esstisch/,
    fix: 'über dem Esstisch',
    canonical: 'Die Lampe hängt über dem Esstisch.',
    rule: 'Wo? → Dativ',
    explanation: 'hängen ohne Objekt ist eine Position: Wo? → Dativ.',
  },
  {
    line: 'Und das Bild von deiner Familie? Wohin hängst du es?',
    lineHard: 'Das Familienbild ist so schön! Wohin hängst du es?',
    hint: 'Antworte mit über + das Bett',
    easy: '(über das Bett oder über dem Bett?)',
    choices: ['Ich hänge das Bild über das Bett.', 'Ich hänge das Bild über dem Bett.'],
    expect: /(?<![a-zäöü])über (das|s) bett|(?<![a-zäöü])übers bett/,
    wrong: /(?<![a-zäöü])über (dem|den|der) bett/,
    fix: 'über das Bett',
    canonical: 'Ich hänge das Bild über das Bett.',
    rule: 'Wohin? → Akkusativ',
    explanation: 'hängen mit Objekt zeigt eine Bewegung: Wohin? → Akkusativ.',
  },
  {
    line: 'Hm, wo liegt eigentlich mein Handy?',
    lineHard: 'Moment, ich finde mein Handy nicht mehr. Hast du gesehen, wo es liegt?',
    hint: 'Antworte mit auf + der Tisch',
    easy: '(auf dem Tisch oder auf den Tisch?)',
    choices: ['Dein Handy liegt auf dem Tisch.', 'Dein Handy liegt auf den Tisch.'],
    expect: /\bauf dem tisch/,
    wrong: /\bauf (den|der|das) tisch/,
    fix: 'auf dem Tisch',
    canonical: 'Dein Handy liegt auf dem Tisch.',
    rule: 'Wo? → Dativ',
    explanation: 'liegen = Position: Wo? → Dativ.',
  },
  {
    line: 'Und die Pflanzen? Wohin stellen wir sie?',
    lineHard: 'Die Pflanzen brauchen Sonne. Wohin stellen wir die am besten?',
    hint: 'Antworte mit auf + der Balkon',
    easy: '(auf den Balkon oder auf dem Balkon?)',
    choices: ['Wir stellen die Pflanzen auf den Balkon.', 'Wir stellen die Pflanzen auf dem Balkon.'],
    expect: /\bauf den balkon/,
    wrong: /\bauf (dem|der|das) balkon/,
    fix: 'auf den Balkon',
    canonical: 'Wir stellen die Pflanzen auf den Balkon.',
    rule: 'Wohin? → Akkusativ',
    explanation: 'stellen = Bewegung: Wohin? → Akkusativ. der Balkon → den Balkon.',
  },
  {
    line: 'Und wo sitzt die Katze schon wieder?',
    lineHard: 'Ha, schau dir die Katze an! Wo sitzt die schon wieder?',
    hint: 'Antworte mit auf + das Sofa',
    easy: '(auf dem Sofa oder auf das Sofa?)',
    choices: ['Die Katze sitzt auf dem Sofa.', 'Die Katze sitzt auf das Sofa.'],
    expect: /\bauf dem sofa/,
    wrong: /\bauf (das|den|der) sofa|\baufs sofa/,
    fix: 'auf dem Sofa',
    canonical: 'Die Katze sitzt auf dem Sofa.',
    rule: 'Wo? → Dativ',
    explanation: 'sitzen = Position: Wo? → Dativ.',
  },
];
const TOTAL = TASKS.length;

const GRAMMAR_FOCUS = {
  title: 'Wechselpräpositionen',
  rule: 'an, auf, hinter, in, neben, über, unter, vor, zwischen: Wo? (Position) → Dativ. Wohin? (Bewegung, Ziel) → Akkusativ.',
  boxes: [
    { label: 'Wo?', value: 'Dativ', note: 'Position: liegen, stehen, hängen, sitzen' },
    { label: 'Wohin?', value: 'Akkusativ', note: 'Bewegung: legen, stellen, hängen, setzen' },
  ],
  watchOut: '«hängen» geht beides: Ich hänge das Bild an die Wand (Wohin?). Das Bild hängt an der Wand (Wo?).',
};

const STEP = { easy: 'Leicht', medium: 'Mittel', hard: 'Schwer' };
const ORDER = ['easy', 'medium', 'hard'];

const norm = (s) => String(s || '').toLowerCase().replace(/ß/g, 'ss').replace(/ue/g, 'ü').replace(/\s+/g, ' ');

function exerciseFor(n, difficulty, hintOverride) {
  const t = TASKS[n - 1];
  return {
    number: n,
    total: TOTAL,
    speaker: SPEAKER,
    line: difficulty === 'hard' ? t.lineHard : t.line,
    hint: hintOverride ?? (difficulty === 'hard' ? null : difficulty === 'easy' ? t.easy : t.hint),
    type: 'Rollenspiel',
  };
}

function check(task, answer) {
  const a = norm(answer);
  if (task.expect.test(a)) return { correct: true, corrected: answer.trim(), changedWords: [] };
  const raw = answer.trim();
  // replace the wrong phrase inside the student's own sentence, keep the rest
  const m = norm(raw).match(task.wrong);
  if (m && norm(raw).length === raw.toLowerCase().length) {
    const fixed = raw.slice(0, m.index) + task.fix + raw.slice(m.index + m[0].length);
    return { correct: false, corrected: fixed.charAt(0).toUpperCase() + fixed.slice(1), changedWords: [task.fix] };
  }
  return { correct: false, corrected: task.canonical, changedWords: [task.fix] };
}

export async function mockReply({ text, settings, session, progress, topicId }) {
  const say = norm(text);
  if (/langsam|slow/.test(say)) await new Promise((r) => setTimeout(r, 4000));
  if (/kaputt|broken/.test(say)) return '{"message": "Das ist absichtlich kaputtes JSON, damit du die Fehlerbehandlung testen kannst", "feedback": {"forNumber": 2, "corr';
  if (/rohtext|raw text/.test(say)) return 'Das ist eine Antwort ohne JSON. Die App zeigt sie als normale Nachricht.';
  if (/absturz|crash/.test(say)) throw new ModelError('Simulierter Fehler (Demo-Modus)', 502);

  let difficulty = settings.difficulty;
  let level = settings.level;
  const n = session.exerciseNumber || 0;
  const out = {
    message: '',
    feedback: null,
    exercise: null,
    options: [],
    panelView: null,
    grammarFocus: null,
    session: {
      topicId: topicId || null,
      topicName: null,
      scenario: topicId ? SCENARIO : null,
      theme: topicId ? THEME : null,
      level: null,
      difficulty: null,
      finished: false,
    },
  };
  const finish = () => {
    out.session.level = level;
    out.session.difficulty = STEP[difficulty];
    // on "Leicht" the answer choices appear as tappable options
    if (difficulty === 'easy' && out.exercise) out.options = TASKS[out.exercise.number - 1].choices;
    return JSON.stringify(out);
  };
  const repeat = () => {
    if (n) out.exercise = exerciseFor(n, difficulty);
  };

  // 1) commands that work any time
  if (/fortschritt|lücken|progress|gaps/.test(say)) {
    out.message = 'Gern! Rechts siehst du jetzt deinen Fortschritt und deine Lücken.';
    out.panelView = 'progress';
    return finish();
  }
  if (/überblick|glance|overview/.test(say)) {
    out.message = 'Hier ist dein Überblick.';
    out.panelView = 'glance';
    return finish();
  }
  if (/\b(a1|a2|b1)\b/.test(say) && say.length < 25) {
    level = say.match(/\b(a1|a2|b1)\b/)[1].toUpperCase();
    out.message = `Alles klar, wir üben jetzt auf Niveau **${level}**.`;
    repeat();
    return finish();
  }
  if (/schwierig|harder|schwerer/.test(say)) {
    difficulty = ORDER[Math.min(2, ORDER.indexOf(difficulty) + 1)];
    out.message = difficulty === 'hard'
      ? 'Okay, jetzt wird es schwieriger: keine Tipps mehr und ganze Sätze, bitte!'
      : 'Okay, ein bisschen schwieriger.';
    repeat();
    return finish();
  }
  if (/leichter|easier|einfacher/.test(say)) {
    difficulty = ORDER[Math.max(0, ORDER.indexOf(difficulty) - 1)];
    out.message = difficulty === 'easy'
      ? 'Kein Problem, jetzt mit mehr Hilfe. Du kannst auch eine Antwort antippen.'
      : 'Okay, ein bisschen leichter.';
    repeat();
    return finish();
  }

  // 2) no open task (new topic, "Nochmal", after the end) → start the role-play
  if (!n || /nochmal|again|rollenspiel|role-play|roleplay/.test(say)) {
    if (/schwer|hard/.test(say)) difficulty = 'hard';
    else if (/leicht|easy/.test(say)) difficulty = 'easy';
    else if (/mittel|medium/.test(say)) difficulty = 'medium';
    out.session.topicId = topicId || 'lektion-01-dativ-akkusativ';
    out.session.scenario = SCENARIO;
    out.session.theme = THEME;
    out.message = n || session.started
      ? 'Neue Runde! Marco steht wieder mit den Kisten vor der Tür.'
      : 'Sehr gern! Wir machen ein Rollenspiel: Du ziehst in eine neue Wohnung und dein Freund Marco hilft dir. Sag ihm, wo die Möbel hinkommen. (Demo-Modus)';
    out.grammarFocus = GRAMMAR_FOCUS;
    out.exercise = exerciseFor(1, difficulty);
    return finish();
  }

  // 3) help with the open task
  const task = TASKS[n - 1];
  if (/regel|rule|erklär|explain|grammar|grammatik/.test(say)) {
    out.message = 'Die Regel: Bei den Wechselpräpositionen fragst du **Wo?** (Position) → Dativ oder **Wohin?** (Bewegung) → Akkusativ.';
    out.grammarFocus = GRAMMAR_FOCUS;
    out.panelView = 'grammar';
    repeat();
    return finish();
  }
  if (/\b(tipp|hint)\b/.test(say)) {
    out.message = `Hier ein Tipp: Frag dich «${task.rule.split(' ')[0]}» – das entscheidet den Kasus.`;
    out.exercise = exerciseFor(n, difficulty, `${task.hint} ${task.easy}`);
    return finish();
  }
  if (/überspring|skip/.test(say)) {
    out.message = `Kein Problem. Eine Lösung wäre: **${task.canonical}**`;
    if (n < TOTAL) out.exercise = exerciseFor(n + 1, difficulty);
    else out.session.finished = true;
    return finish();
  }
  if (/fehler|mistake/.test(say)) {
    out.message = 'Gute Idee! Wir üben genau die Regel, bei der du Fehler gemacht hast. Weiter geht’s:';
    repeat();
    return finish();
  }

  // 4) an answer to the open task
  const result = check(task, text);
  out.feedback = {
    forNumber: n,
    correct: result.correct,
    studentAnswer: text.trim(),
    corrected: result.corrected,
    changedWords: result.changedWords,
    explanation: result.correct ? `Genau: ${task.explanation}` : task.explanation,
    rule: task.rule,
    errorType: result.correct ? null : 'Kasus',
  };
  if (n >= TOTAL) {
    const correct = progress.correct + (result.correct ? 1 : 0);
    out.message = `Geschafft! Du hast ${correct} von ${progress.answered + 1} Aufgaben richtig gelöst.`;
    out.session.finished = true;
    out.options = ['Nochmal', 'Schwieriger', 'Anderes Thema'];
    return finish();
  }
  out.message = result.correct
    ? ['Super, genau richtig!', 'Perfekt!', 'Sehr gut!'][n % 3]
    : 'Fast perfekt! Ein natürlicher Satz, nur eine kleine Änderung:';
  out.exercise = exerciseFor(n + 1, difficulty);
  return finish();
}
