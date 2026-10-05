// Short chat commands the app understands by itself, so the screen reacts instantly
// (and many of them need no AI call at all). Anything else goes to the tutor.

const clean = (s) => String(s || '')
  .toLowerCase()
  .replace(/ß/g, 'ss')
  .replace(/->|→|>/g, ' to ')
  .replace(/[’']/g, '') // "I'm done" → "im done", "let's" → "lets"
  .replace(/[.!?,;:«»„“”"()]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const words = (s) => s.split(' ').length;
const short = (s, max = 8) => words(s) <= max;
const POLITE = '( bitte| please| jetzt| now| für heute| fuer heute| for today)*';

export const QUESTION_MIN = 10;
export const QUESTION_MAX = 50;

// → null, or one of:
// { type: 'stop' }                   end the session now, show the summary (no AI call)
// { type: 'again' }                  same topic again, new round
// { type: 'restart' }                new session, keep the name (no AI call)
// { type: 'changeTopic' }            show the topic list (no AI call)
// { type: 'topicGroup', group }      list grammar / vocabulary topics (no AI call)
// { type: 'view', view }             switch the right panel (no AI call)
// { type: 'questions', value }       questions per session (10–50)
// { type: 'direction', value }       flashcards: 'en-de' | 'de-en' | 'mixed'
// { type: 'sentences', value }       flashcards: add sentence building (true/false)
// { type: 'difficulty', value | step }
// { type: 'level', value }
// { type: 'rule' }                   open the grammar view and ask the tutor
// { type: 'skip' }                   skip the open question (+ ask the tutor for the next one)
// open = a question is waiting for an answer: then single words that could be an answer
// ("fertig", "Ende", "schwer", "easy" …) are NOT taken as commands.
export function detectIntent(text, { open = false } = {}) {
  const s = clean(text);
  if (!s) return null;

  const stopWords = open
    ? 'stopp?|stoppen|aufhören|aufhoeren|hör auf|hoer auf|genug|das reicht|schluss|ich bin fertig|beenden|sitzung beenden|end session|end the session|quit|im done|i am done|thats enough|i want to stop|lets stop|wir hören auf|wir hoeren auf'
    : 'stopp?|stoppen|aufhören|aufhoeren|hör auf|hoer auf|genug|das reicht|reicht|schluss|fertig|ich bin fertig|beenden|sitzung beenden|ende|end session|end the session|end|quit|im done|i am done|done|thats enough|enough|i want to stop|lets stop|wir hören auf|wir hoeren auf|pause';
  if (short(s, 7) && new RegExp(`^(ich (will|möchte|moechte) )?(jetzt )?(${stopWords})${POLITE}$`).test(s)) {
    return { type: 'stop' };
  }
  if (new RegExp(`^(nochmal|noch ?mal|noch einmal|noch eine runde|neue runde|nochmals|again|one more round|another round|same topic again|gleiches thema( nochmal)?|repeat the session)${POLITE}$`).test(s)) {
    return { type: 'again' };
  }
  if (/^(neu starten|neustart|neu beginnen|von vorne( beginnen| anfangen)?|restart|start over|start again|new session|neue sitzung)$/.test(s)) {
    return { type: 'restart' };
  }
  if (new RegExp(`^(anderes thema|neues thema|thema wechseln|ein anderes thema|change topic|change the topic|other topic|new topic|another topic)${POLITE}$`).test(s)) {
    return { type: 'changeTopic' };
  }
  if (/^(grammatik|grammar)$/.test(s)) return { type: 'topicGroup', group: 'Grammatik' };
  if (/^(wortschatz|vocabulary|vokabeln|vocab|words|wörter|woerter)$/.test(s)) return { type: 'topicGroup', group: 'Wortschatz' };

  // "Zeig mir Fortschritt & Lücken" / "show me the grammar focus" – but not an answer that
  // happens to contain the word ("Ich mache Fortschritte"): a show-verb or only the view name.
  const asksToSee = /^(zeig|zeige|show|öffne|oeffne|open|see|ich (will|möchte|moechte)|can i see|kann ich)\b/.test(s);
  if (short(s)) {
    const view = /(fortschritt|lücken|luecken|progress|gaps)/.test(s) ? 'progress'
      : /(grammatik ?-? ?fokus|grammar ?focus)/.test(s) ? 'grammar'
        : /(überblick|ueberblick|at a glance|glance|overview)/.test(s) ? 'glance' : null;
    const onlyName = /^(den |die |das |the |my |mein(en)? )?(fortschritt( (und|&) lücken)?|progress( (and|&) gaps)?|lücken|gaps|grammatik ?-? ?fokus|grammar ?focus|überblick|at a glance|overview)$/.test(s);
    if (view && (asksToSee || onlyName)) return { type: 'view', view };
  }

  // "20 Fragen", "30 questions", "Anzahl 40", "I want 25 questions"
  if (short(s, 7)) {
    const q = s.match(/(\d{1,3}) ?(fragen|frage|aufgaben|aufgabe|questions|question|cards|karten|übungen|uebungen|tasks|wörter|woerter|words)\b/)
      || s.match(/^(anzahl|questions|fragen|aufgaben) (\d{1,3})$/);
    if (q) {
      const n = Number(q[1].match(/\d/) ? q[1] : q[2]);
      return { type: 'questions', value: Math.max(QUESTION_MIN, Math.min(QUESTION_MAX, n)) };
    }
  }

  // flashcard direction and sentence building
  if (short(s, 8)) {
    const toDe = /\b(english|englisch|en) +(to|nach|zu|ins|into) +(german|deutsch|de)\b/.test(s);
    const toEn = /\b(german|deutsch|de) +(to|nach|zu|ins|into) +(english|englisch|en)\b/.test(s);
    if (toDe && !toEn) return { type: 'direction', value: 'en-de' };
    if (toEn && !toDe) return { type: 'direction', value: 'de-en' };
    if (/^(beide richtungen|both directions|gemischt|mixed|mix)( bitte| please)?$/.test(s)) return { type: 'direction', value: 'mixed' };
    if (/(mit sätzen|mit saetzen|with sentences|add sentences|sätze dazu|saetze dazu|sentences too|plus sätze|plus sentences|sentence building|satzbau)/.test(s)) {
      return { type: 'sentences', value: true };
    }
    if (/(ohne sätze|ohne saetze|without sentences|no sentences|words only|nur wörter|nur woerter|only words|keine sätze|keine saetze)/.test(s)) {
      return { type: 'sentences', value: false };
    }
  }

  if (/^(erklär|erklaer|explain)( mir)?( bitte)? (die |the )?(regel|rule)( bitte| please)?$/.test(s)) return { type: 'rule' };
  if (new RegExp(`^(überspringen|ueberspringen|überspring|skip|skip this one|skip it|weiter zur nächsten|nächste frage|naechste frage|next question|pass)${POLITE}$`).test(s)) {
    return { type: 'skip' };
  }

  if (short(s, 5)) {
    if (/^(bitte )?(mach(e)? es |etwas |ein bisschen |noch )?(schwieriger|schwerer|harder|more difficult)( machen)?( bitte| please)?$|^make it harder( please)?$/.test(s)) {
      return { type: 'difficulty', step: 1 };
    }
    if (/^(bitte )?(mach(e)? es |etwas |ein bisschen |noch )?(leichter|einfacher|easier)( machen)?( bitte| please)?$|^make it easier( please)?$/.test(s)) {
      return { type: 'difficulty', step: -1 };
    }
    const d = s.match(/^(stufe |schwierigkeit |difficulty |level )?(leicht|easy|mittel|medium|schwer|hard)$/);
    if (d && (d[1] || !open)) return { type: 'difficulty', value: { leicht: 'easy', easy: 'easy', mittel: 'medium', medium: 'medium', schwer: 'hard', hard: 'hard' }[d[2]] };
    const l = s.match(/^(niveau |level |stufe )?(a1|a2|b1)$/);
    if (l) return { type: 'level', value: l[2].toUpperCase() };
  }
  return null;
}

// "Ich möchte jetzt lieber Wohnen üben" → { topicId } ; "Lass uns Wortschatz machen" → { group }
// Only short messages that clearly ask to practise something else, so answers ("Wir wohnen
// dort", "Ich möchte in einer Wohnung wohnen") are never taken for a topic wish. While a
// question is open, an explicit switch word is required.
const NOT_LETTER = '(?<![a-zäöü])';
const END = '(?![a-zäöü])';
const SWITCH = new RegExp(`${NOT_LETTER}(üben|ueben|lernen|practi[sc]e|learn|study|wechseln|switch|thema|topic|lass uns|let'?s|können wir|koennen wir|instead|stattdessen)${END}`);
const WANT = new RegExp(`${NOT_LETTER}(ich (will|möchte|moechte)|i want|i'd like|machen|lieber)${END}`);

export function detectTopicWish(text, topics, { open = false } = {}) {
  const s = clean(text);
  if (!s || !short(s, open ? 7 : 9)) return null;
  if (!SWITCH.test(s) && (open || !WANT.test(s))) return null;
  const hit = topics.find((t) => {
    const name = clean(t.short);
    return name.length >= 4 && (s.includes(name) || name.split(' ').filter((w) => w.length >= 5).some((w) => s.includes(w)));
  });
  if (hit) return { topicId: hit.id };
  if (new RegExp(`${NOT_LETTER}(grammatik|grammar)${END}`).test(s)) return { group: 'Grammatik' };
  if (new RegExp(`${NOT_LETTER}(wortschatz|vocabulary|vokabeln|vocab|wörter|woerter|flashcards|karteikarten)${END}`).test(s)) return { group: 'Wortschatz' };
  return null;
}

// "Ich heisse Emilio." → "Emilio"
export function extractName(text) {
  const s = String(text || '')
    .trim()
    .replace(/^(hallo|hi|hey|grüezi|gruezi|hoi|salü|guten tag)[,!.\s]+/i, '')
    .replace(/^(ich heisse|ich heiße|ich bin|mein name ist|man nennt mich|i am|i'm|im|my name is|call me)\s+/i, '')
    .replace(/[.!?,;:"«»„“]/g, ' ')
    .trim();
  const name = s.split(/\s+/).slice(0, 2).join(' ').slice(0, 40);
  if (!name || !/\p{L}/u.test(name)) return '';
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || parts[0]?.[1] || '')).toUpperCase();
}
