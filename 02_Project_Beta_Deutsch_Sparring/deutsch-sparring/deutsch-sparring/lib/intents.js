// Short chat commands the app understands by itself, so the screen reacts instantly
// (and some of them need no AI call at all). Anything longer goes to the tutor.

const clean = (s) => String(s || '')
  .toLowerCase()
  .replace(/ß/g, 'ss')
  .replace(/[.!?,;:«»„“”"']/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const short = (s, max = 8) => s.split(' ').length <= max;

// → null, or one of:
// { type: 'view', view }            switch the right panel (no AI call)
// { type: 'restart' }               new session, keep the name (no AI call)
// { type: 'changeTopic' }           show the topic list (no AI call)
// { type: 'topicGroup', group }     list grammar / vocabulary topics (no AI call)
// { type: 'difficulty', value | step }  change difficulty (+ tell the tutor)
// { type: 'level', value }          change level (+ tell the tutor)
// { type: 'rule' }                  open the grammar view and ask the tutor
export function detectIntent(text) {
  const s = clean(text);
  if (!s) return null;

  if (/^(neu starten|neustart|neu beginnen|von vorne( beginnen| anfangen)?|restart|start over|start again|new session|neue sitzung)$/.test(s)) {
    return { type: 'restart' };
  }
  if (/^(anderes thema|neues thema|thema wechseln|ein anderes thema|change topic|change the topic|other topic|new topic)( bitte| please)?$/.test(s)) {
    return { type: 'changeTopic' };
  }
  if (/^(grammatik|grammar)$/.test(s)) return { type: 'topicGroup', group: 'Grammatik' };
  if (/^(wortschatz|vocabulary|vokabeln|words)$/.test(s)) return { type: 'topicGroup', group: 'Wortschatz' };

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

  if (/^(erklär|erklaer|explain)( mir)?( bitte)? (die |the )?(regel|rule)( bitte| please)?$/.test(s)) return { type: 'rule' };

  if (short(s, 5)) {
    if (/^(bitte )?(mach(e)? es |etwas |ein bisschen |noch )?(schwieriger|schwerer|harder|more difficult)( machen)?( bitte| please)?$|^make it harder( please)?$/.test(s)) {
      return { type: 'difficulty', step: 1 };
    }
    if (/^(bitte )?(mach(e)? es |etwas |ein bisschen |noch )?(leichter|einfacher|easier)( machen)?( bitte| please)?$|^make it easier( please)?$/.test(s)) {
      return { type: 'difficulty', step: -1 };
    }
    const d = s.match(/^(stufe |schwierigkeit |difficulty |level )?(leicht|easy|mittel|medium|schwer|hard)$/);
    if (d) return { type: 'difficulty', value: { leicht: 'easy', easy: 'easy', mittel: 'medium', medium: 'medium', schwer: 'hard', hard: 'hard' }[d[2]] };
    const l = s.match(/^(niveau |level |stufe )?(a1|a2|b1)$/);
    if (l) return { type: 'level', value: l[2].toUpperCase() };
  }
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
