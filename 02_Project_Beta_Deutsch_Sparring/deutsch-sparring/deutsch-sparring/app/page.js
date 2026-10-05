'use client';

import { useEffect, useRef, useState } from 'react';

const store = {
  get(k) { try { return localStorage.getItem(k) || ''; } catch { return ''; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};

// Tiny formatter: escape HTML, then **bold**, *italic*, and colour ✔ / ✘ lines.
function format(text) {
  const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/^(✔.*)$/gm, '<span class="ok">$1</span>')
    .replace(/^(✘.*)$/gm, '<span class="no">$1</span>');
}

export default function Home() {
  const [ready, setReady] = useState(false);
  const [name, setName] = useState('');
  const [nameDraft, setNameDraft] = useState('');
  const [code, setCode] = useState('');
  const [needsCode, setNeedsCode] = useState(false);
  const [topics, setTopics] = useState([]);
  const [mode, setMode] = useState('Gemischt');
  const [count, setCount] = useState(5);
  const [topic, setTopic] = useState(null);
  const [messages, setMessages] = useState([]); // {role:'user'|'assistant', text, hidden?}
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef(null);

  useEffect(() => {
    setName(store.get('ds_name'));
    setNameDraft(store.get('ds_name'));
    setCode(store.get('ds_code'));
    fetch('/api/topics')
      .then((r) => r.json())
      .then((d) => { setTopics(d.topics || []); setNeedsCode(!!d.needsCode); })
      .catch(() => setError('Themen konnten nicht geladen werden.'))
      .finally(() => setReady(true));
  }, []);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, busy]);

  async function send(history, t = topic) {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name, topicId: t.id, mode, count, classCode: code,
          messages: history.map(({ role, text }) => ({ role, text })),
        }),
      });
      // Vercel can answer with an HTML error page (e.g. on a timeout), so never assume JSON.
      const raw = await res.text();
      let data;
      try { data = JSON.parse(raw); } catch { data = { error: `Unerwartete Antwort vom Server (${res.status}). Bitte versuche es nochmal.` }; }
      if (!res.ok || data.error) {
        if (data.code === 'bad_code') { store.del('ds_code'); setCode(''); setTopic(null); }
        throw new Error(data.error || 'Fehler');
      }
      setMessages([...history, { role: 'assistant', text: data.reply }]);
    } catch (e) {
      setMessages(history);
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function startTopic(t) {
    setTopic(t);
    const first = {
      role: 'user', hidden: true,
      text: `Start: Thema "${t.title}", Modus ${mode}, ${count} Aufgaben. Bitte begrüsse mich kurz und gib mir Aufgabe 1.`,
    };
    setMessages([first]);
    send([first], t);
  }

  function submit(e, override) {
    e?.preventDefault();
    const text = (override ?? input).trim();
    if (!text || busy) return;
    const history = [...messages, { role: 'user', text }];
    setMessages(history);
    setInput('');
    send(history);
  }

  function saveName(e) {
    e.preventDefault();
    const n = nameDraft.trim();
    if (!n) return;
    store.set('ds_name', n);
    if (code) store.set('ds_code', code);
    setName(n);
  }

  const header = (
    <header>
      <div className="brand"><span className="flag" aria-hidden="true" />Deutsch Sparring</div>
      {name && (
        topic
          ? <button className="link" onClick={() => { setTopic(null); setMessages([]); setError(''); }}>← Anderes Thema</button>
          : <button className="link" onClick={() => { store.del('ds_name'); setName(''); }}>Nicht {name}?</button>
      )}
    </header>
  );

  if (!ready) return <main className="wrap">{header}</main>;

  // 1) Name (+ class code)
  if (!name || (needsCode && !code)) {
    return (
      <main className="wrap">
        {header}
        <form className="card stack" onSubmit={saveName}>
          <div>
            <h1>Willkommen!</h1>
            <p className="sub">Dein Sparringspartner für B1-Deutsch, nach <em>Schritte plus Neu</em>.</p>
          </div>
          <label className="stack">
            Wie heisst du?
            <input type="text" value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} placeholder="z. B. Emilio" autoFocus maxLength={40} />
          </label>
          {needsCode && (
            <label className="stack">
              Klassen-Code
              <input type="password" value={code} onChange={(e) => setCode(e.target.value)} placeholder="vom Kurs" />
            </label>
          )}
          <button className="primary" disabled={!nameDraft.trim() || (needsCode && !code)}>Los geht&apos;s</button>
          {error && <p className="err">{error}</p>}
          <p className="note">Kostenlose KI (Google Gemini): Bitte keine persönlichen Daten eingeben. Gemacht für unseren Deutschkurs.</p>
        </form>
      </main>
    );
  }

  // 2) Topic menu
  if (!topic) {
    const groups = ['Grammatik', 'Wortschatz', 'Gemischt']
      .map((g) => [g, topics.filter((t) => t.type === g)])
      .filter(([, list]) => list.length);
    return (
      <main className="wrap">
        {header}
        <section className="card">
          <h1>Hallo {name}! Was möchtest du heute üben?</h1>
          <p className="sub">Wähle ein Thema aus dem Kurs.</p>

          <h2>Modus</h2>
          <div className="chips">
            {['Gemischt', 'Grammatik', 'Wortschatz'].map((m) => (
              <button key={m} className={`chip ${mode === m ? 'on' : ''}`} onClick={() => setMode(m)}>{m}</button>
            ))}
          </div>
          <h2>Anzahl Aufgaben</h2>
          <div className="chips">
            {[5, 10].map((n) => (
              <button key={n} className={`chip ${count === n ? 'on' : ''}`} onClick={() => setCount(n)}>{n}</button>
            ))}
          </div>

          {groups.map(([g, list]) => (
            <div key={g}>
              <h2>{g}</h2>
              <div className="topics">
                {list.map((t) => (
                  <button key={t.id} className="topic" onClick={() => startTopic(t)}>
                    <span>{t.title}</span><span className="tag">{t.type}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
          {!topics.length && <p className="err">Noch keine Themen im Ordner /content.</p>}
          {error && <p className="err">{error}</p>}
        </section>
      </main>
    );
  }

  // 3) Chat
  return (
    <main className="wrap">
      {header}
      <div className="topicbar">{topic.title} · {mode} · {count} Aufgaben</div>
      <div className="chat">
        {messages.filter((m) => !m.hidden).map((m, i) => (
          <div key={i} className={`msg ${m.role === 'assistant' ? 'tutor' : 'me'}`}
            dangerouslySetInnerHTML={{ __html: format(m.text) }} />
        ))}
        {busy && <div className="typing">Tutor schreibt …</div>}
        {error && (
          <p className="err">
            {error}{' '}
            {!busy && messages.length > 0 && (
              <button className="link" onClick={() => send(messages)}>Nochmal versuchen</button>
            )}
          </p>
        )}
        <div ref={endRef} />
      </div>
      <div className="composer">
        <div className="quick">
          {['Tipp', 'nochmal', 'schwieriger'].map((q) => (
            <button key={q} className="chip" disabled={busy} onClick={() => submit(null, q)}>{q}</button>
          ))}
        </div>
        <form onSubmit={submit}>
          <textarea
            rows={1}
            value={input}
            placeholder="Deine Antwort …"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) submit(e); }}
            maxLength={1500}
            autoFocus
          />
          <button className="primary" disabled={busy || !input.trim()}>Senden</button>
        </form>
      </div>
    </main>
  );
}
