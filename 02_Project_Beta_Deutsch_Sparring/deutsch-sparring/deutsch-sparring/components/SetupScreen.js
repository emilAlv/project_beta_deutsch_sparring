'use client';

// The setup screen before each Sparring session. Everything chosen here stays FIXED until the
// session ends. It starts prefilled with the last session's settings.

import { useMemo, useState } from 'react';
import { t, dirKey } from '../lib/ui-text';
import { wordsNeeded } from '../lib/scores';
import {
  MODES, modeOf, LEVELS, DIFFICULTIES, QUESTION_STEPS, SOURCES, DIRECTIONS, VARIANTS, GRAMMAR_POINTS,
  withSentences, sessionSettings, DEFAULT_SETUP,
} from '../lib/session-settings';
import { Check } from './icons';

const isGrammarTopic = (x) => x.type !== 'Wortschatz' && x.id !== 'free';
// words of a vocabulary topic for the chosen level and source (older servers: the total)
const countOf = (topic, level, source) => topic?.counts?.[level]?.[source] ?? topic?.count ?? 0;

// Arrow keys move between the buttons of a radio group
function arrowKeys(options, value, onChange) {
  return (e) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const next = options[(options.indexOf(value) + step + options.length) % options.length];
    onChange(next);
    e.currentTarget.querySelectorAll('button')[options.indexOf(next)]?.focus();
  };
}

function Segmented({ label, options, value, onChange, render }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label} onKeyDown={arrowKeys(options, value, onChange)}>
      {options.map((o, i) => (
        <button
          key={o}
          type="button"
          role="radio"
          aria-checked={value === o}
          tabIndex={value === o || (!options.includes(value) && i === 0) ? 0 : -1}
          className={value === o ? 'on' : ''}
          onClick={() => onChange(o)}
        >
          {render ? render(o) : o}
        </button>
      ))}
    </div>
  );
}

// a row of chips where exactly one is chosen (topic, section, list)
function ChoiceChips({ label, items, value, onChange }) {
  return (
    <div className="chips" role="radiogroup" aria-label={label}>
      {items.map((it) => (
        <button
          key={it.id ?? 'all'}
          type="button"
          role="radio"
          aria-checked={value === it.id}
          className={`chip setup-chip${value === it.id ? ' on' : ''}`}
          title={it.title}
          onClick={() => onChange(it.id)}
        >
          {it.label}
          {it.count != null && <span className="chip-count">{it.count}</span>}
        </button>
      ))}
    </div>
  );
}

function Section({ title, children, help }) {
  return (
    <section className="setup-section">
      <h2 className="setup-h">{title}</h2>
      {children}
      {help && <p className="setup-help">{help}</p>}
    </section>
  );
}

export default function SetupScreen({ topics, initial, onStart, onCancel, cancelLabel, error }) {
  const [form, setForm] = useState(initial);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const vocab = form.kind === 'vocab';
  const mode = modeOf(form);

  const grammarTopics = useMemo(() => topics.filter((x) => isGrammarTopic(x) && (x.levels || []).includes(form.level)), [topics, form.level]);
  const curriculumTopics = grammarTopics.filter((x) => x.curriculum);
  const lessonTopics = grammarTopics.filter((x) => !x.curriculum);
  const allSections = useMemo(() => topics.filter((x) => x.type === 'Wortschatz' && !x.parent), [topics]);
  const sections = allSections.filter((x) => countOf(x, form.level, form.source) > 0);

  // the choice that is really used: a remembered choice that no longer fits falls back to the first
  const grammarTopic = grammarTopics.find((x) => x.id === form.grammarTopic) || grammarTopics[0] || null;
  const section = sections.find((x) => x.id === form.section) || sections[0] || null;
  const lists = section ? topics.filter((x) => x.parent === section.id && countOf(x, form.level, form.source) > 0) : [];
  const list = lists.find((x) => x.id === form.list) || null;
  const vocabTopic = list || section;
  const topic = vocab ? vocabTopic : grammarTopic;

  const available = countOf(vocabTopic, form.level, form.source);
  const needed = wordsNeeded(form.questions, withSentences(form));
  const effective = { ...form, grammarTopic: grammarTopic?.id || null, section: section?.id || null, list: list?.id || null };
  const topicLabel = !topic ? '' : vocab && list ? `${section.short} › ${list.short}` : topic.short;

  const summary = [
    t(`kind_${mode}`),
    topicLabel || t('setupChooseTopic'),
    form.level,
    t(`diff_${form.difficulty}`),
    t('questionsN', { n: form.questions }),
    vocab ? t(`dirShort_${dirKey(form.direction)}`) : null,
    t(`variantShort_${form.variant}`),
  ].filter(Boolean).join(' · ');

  // Grammar · Vocabulary (flashcards only = the word session with the sentence tasks off) · Vocabulary + grammar
  function chooseMode(m) {
    if (m === 'grammar') set({ kind: 'grammar' });
    else if (m === 'words') set({ kind: 'vocab', grammar: [] });
    else set({ kind: 'vocab', grammar: withSentences({ kind: 'vocab', grammar: form.grammar }) ? form.grammar : DEFAULT_SETUP.grammar });
  }

  // at least one sentence task stays on here: to have none, choose "Vocabulary"
  function toggleGrammar(g) {
    const grammar = form.grammar.includes(g) ? form.grammar.filter((x) => x !== g) : GRAMMAR_POINTS.filter((x) => x === g || form.grammar.includes(x));
    if (withSentences({ kind: 'vocab', grammar })) set({ grammar });
  }

  function start() {
    if (!topic) return;
    onStart(effective, sessionSettings(effective, topicLabel));
  }

  return (
    <div className="setup-page">
      <div className="setup-column">
        {onCancel && (
          <button type="button" className="text-button setup-back" onClick={onCancel}>{t(cancelLabel || 'setupBack')}</button>
        )}
        <h1 className="setup-title">{t('setupTitle')}</h1>
        <p className="setup-sub">{t('setupSubtitle')}</p>

        <div className="card setup-card">
          <Section title={t('setupKind')}>
            <div className="kind-options" role="radiogroup" aria-label={t('setupKind')} onKeyDown={arrowKeys(MODES, mode, chooseMode)}>
              {MODES.map((k) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={mode === k}
                  tabIndex={mode === k ? 0 : -1}
                  className={`kind-option${mode === k ? ' on' : ''}`}
                  onClick={() => chooseMode(k)}
                >
                  <span className="kind-name">
                    {t(`kind_${k}`)}
                    {mode === k && <Check size={16} strokeWidth={2.4} />}
                  </span>
                  <span className="kind-help">{t(`kindHelp_${k}`)}</span>
                </button>
              ))}
            </div>
          </Section>

          <Section title={t('setupLevelPace')} help={t(`diffHelp_${form.difficulty}`)}>
            <div className="setup-row">
              <div className="setup-field">
                <p className="caps">{t('level')}</p>
                <Segmented label={t('level')} options={LEVELS} value={form.level} onChange={(v) => set({ level: v })} />
              </div>
              <div className="setup-field">
                <p className="caps">{t('difficulty')}</p>
                <Segmented label={t('difficulty')} options={DIFFICULTIES} value={form.difficulty} onChange={(v) => set({ difficulty: v })} render={(d) => t(`diff_${d}`)} />
              </div>
              <div className="setup-field wide">
                <p className="caps">{t('setupQuestions')}</p>
                <Segmented label={t('setupQuestions')} options={QUESTION_STEPS} value={form.questions} onChange={(v) => set({ questions: v })} />
              </div>
            </div>
          </Section>

          <Section title={t('setupTopic')}>
            {vocab ? (
              sections.length ? (
                <>
                  <p className="caps">{t('setupSection')}</p>
                  <ChoiceChips
                    label={t('setupSection')}
                    items={sections.map((x) => ({ id: x.id, label: x.short, count: countOf(x, form.level, form.source) }))}
                    value={section?.id}
                    onChange={(id) => set({ section: id, list: null })}
                  />
                  {lists.length > 1 && (
                    <>
                      <p className="caps">{t('setupList')}</p>
                      <ChoiceChips
                        label={t('setupList')}
                        items={[
                          { id: null, label: t('setupAllLists'), count: countOf(section, form.level, form.source) },
                          ...lists.map((x) => ({ id: x.id, label: x.short, count: countOf(x, form.level, form.source) })),
                        ]}
                        value={list?.id ?? null}
                        onChange={(id) => set({ list: id })}
                      />
                    </>
                  )}
                  <p className="setup-help">
                    {available >= needed ? t('setupWordsNote', { n: needed, total: available }) : t('setupWordsFew', { total: available })}
                  </p>
                </>
              ) : <p className="setup-help">{t('setupNoWords')}</p>
            ) : grammarTopics.length ? (
              <>
                {curriculumTopics.length > 0 && (
                  <ChoiceChips
                    label={t('setupTopic')}
                    items={curriculumTopics.map((x) => ({ id: x.id, label: x.short, title: x.titleEn }))}
                    value={grammarTopic?.id}
                    onChange={(id) => set({ grammarTopic: id })}
                  />
                )}
                {lessonTopics.length > 0 && (
                  <>
                    <p className="caps">{t('setupMoreLessons')}</p>
                    <ChoiceChips
                      label={t('setupMoreLessons')}
                      items={lessonTopics.map((x) => ({ id: x.id, label: x.short }))}
                      value={grammarTopic?.id}
                      onChange={(id) => set({ grammarTopic: id })}
                    />
                  </>
                )}
                <p className="setup-help">{t('setupGrammarForLevel', { level: form.level })}</p>
              </>
            ) : <p className="setup-help">{t('setupNoGrammar')}</p>}
          </Section>

          {vocab && (
            <>
              <Section title={t('setupSource')}>
                <Segmented label={t('setupSource')} options={SOURCES} value={form.source} onChange={(v) => set({ source: v })} render={(s) => t(`source_${s}`)} />
              </Section>

              <Section title={t('setupFlashcards')} help={t('refLang')}>
                <Segmented label={t('setupFlashcards')} options={DIRECTIONS} value={form.direction} onChange={(v) => set({ direction: v })} render={(d) => t(`dir_${dirKey(d)}`)} />
              </Section>

              {mode === 'vocab' && (
              <Section title={t('setupGrammar')} help={t('setupGrammarHelp')}>
                <div className="chips" role="group" aria-label={t('setupGrammar')}>
                  {GRAMMAR_POINTS.map((g) => (
                    <button
                      key={g}
                      type="button"
                      aria-pressed={form.grammar.includes(g)}
                      className={`chip setup-chip${form.grammar.includes(g) ? ' on' : ''}`}
                      onClick={() => toggleGrammar(g)}
                    >
                      {form.grammar.includes(g) && <Check size={14} strokeWidth={2.4} />}
                      {t(`gp_${g}`)}
                    </button>
                  ))}
                </div>
              </Section>
              )}
            </>
          )}

          <Section title={t('setupVariant')} help={t(`variantExamples_${form.variant}`)}>
            <Segmented label={t('setupVariant')} options={VARIANTS} value={form.variant} onChange={(v) => set({ variant: v })} render={(v) => t(`variant_${v}`)} />
          </Section>
        </div>
      </div>

      <div className="setup-bar">
        <div className="setup-bar-inner">
          <div className="setup-summary">
            <p className="caps">{t('setupBarLabel')}</p>
            <p className="setup-summary-line" title={summary}>{summary}</p>
            {error && <p className="setup-error" role="alert">{error}</p>}
          </div>
          {onCancel && <button type="button" className="button-outline" onClick={onCancel}>{t('setupCancel')}</button>}
          <button type="button" className="button-primary" onClick={start} disabled={!topic}>{t('setupStart')}</button>
        </div>
      </div>
    </div>
  );
}
