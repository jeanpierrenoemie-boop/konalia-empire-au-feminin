/**
 * SprintNinePanel — S9 : APPRENDRE DU TERRAIN ET DÉCIDER DU PROCHAIN TEST
 * 8 steps (0-7):
 *   0. TON TEST TERRAIN (read-only depuis S8)
 *   1. CE QUI S'EST RÉELLEMENT PASSÉ
 *   2. SIGNAL OU HYPOTHÈSE ? (classifier les observations)
 *   3. CE QUE TU GARDES
 *   4. CE QUE TU VEUX VÉRIFIER (hypothèse prioritaire)
 *   5. TON PROCHAIN TEST
 *   6. JE SAIS / JE SUPPOSE / JE DOIS VÉRIFIER
 *   7. SYNTHÈSE ET SOUMISSION
 */
import { useState, useEffect, useCallback } from 'react';
import styles from './SprintNinePanel.module.css';

const OBS_TYPES = [
  { value: 'observation', label: 'Observation factuelle' },
  { value: 'hypothesis', label: 'Hypothèse' },
  { value: 'signal_to_confirm', label: 'Signal à confirmer' },
  { value: 'unknown', label: 'Incertain' },
];

const STEPS = [
  'TON TEST TERRAIN',
  'CE QUI S\'EST PASSÉ',
  'SIGNAL OU HYPOTHÈSE ?',
  'CE QUE TU GARDES',
  'HYPOTHÈSE PRIORITAIRE',
  'PROCHAIN TEST',
  'JE SAIS / JE SUPPOSE',
  'SYNTHÈSE',
];

/* ── AcknowledgeField ────────────────────────────────────────────── */
function AcknowledgeField({ label, hint, value, acknowledged, onValue, onAck, onUnack, disabled, placeholder }) {
  const treated = !!(value?.trim()) || acknowledged;
  return (
    <div className={`${styles.ackField} ${treated ? styles.ackFieldTreated : ''}`}>
      <div className={styles.ackFieldHeader}>
        <span className={styles.ackFieldLabel}>{label}</span>
        {treated && <span className={styles.ackCheck}>✓</span>}
      </div>
      {hint && <p className={styles.fieldHint}>{hint}</p>}
      {!acknowledged ? (
        <>
          <textarea
            className={styles.textarea}
            rows={3}
            placeholder={placeholder ?? 'Complète ce champ…'}
            value={value ?? ''}
            onChange={e => onValue(e.target.value)}
            disabled={disabled}
          />
          {!value?.trim() && !disabled && (
            <button className={styles.ackBtn} type="button" onClick={onAck}>
              Rien à ajouter pour l'instant
            </button>
          )}
        </>
      ) : (
        <div className={styles.ackAcknowledged}>
          <span>Rien à ajouter pour l'instant.</span>
          {!disabled && (
            <button className={styles.ackUndoBtn} type="button" onClick={onUnack}>Modifier</button>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Main component ─────────────────────────────────────────────── */
export function SprintNinePanel({ sprint, onMissionUpdate }) {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  const [s8Ref, setS8Ref] = useState(null);
  const [s9Id, setS9Id] = useState(null);
  const [form, setForm] = useState({
    observations: [],
    learnings: { what_really_happened: '', what_surprised: '', what_remains_unknown: '' },
    keep: [],
    hypothesis_to_test: { formulation: '', category: '', why_priority: '' },
    next_test: {
      question: '', target_person: '', element_tested: '',
      what_to_present: '', data_to_observe: '', completion_criteria: '',
      next_action: '', planned_date: '',
    },
    epistemic: {
      facts: '', facts_acknowledged: false,
      assumptions: '', assumptions_acknowledged: false,
      to_verify: '', to_verify_acknowledged: false,
    },
    synthesis: '',
  });

  /* ── Load ─────────────────────────────────────────────────────── */
  useEffect(() => {
    fetch('/api/s9/learning-review', { credentials: 'include' })
      .then(r => r.json())
      .then(body => {
        if (body.error) { setError(body.error); return; }
        setS8Ref(body.s8_ref ?? null);
        const src = body.s9 ?? body.prefill;
        if (src) {
          setS9Id(body.s9?.id ?? null);
          setForm({
            observations: src.observations ?? [],
            learnings: src.learnings ?? { what_really_happened: '', what_surprised: '', what_remains_unknown: '' },
            keep: src.keep ?? [],
            hypothesis_to_test: src.hypothesis_to_test ?? { formulation: '', category: '', why_priority: '' },
            next_test: src.next_test ?? { question: '', target_person: '', element_tested: '', what_to_present: '', data_to_observe: '', completion_criteria: '', next_action: '', planned_date: '' },
            epistemic: src.epistemic ?? { facts: '', facts_acknowledged: false, assumptions: '', assumptions_acknowledged: false, to_verify: '', to_verify_acknowledged: false },
            synthesis: src.synthesis ?? '',
          });
          if (src.status === 'submitted') setSubmitted(true);
        }
      })
      .catch(() => setError('Erreur réseau'))
      .finally(() => setLoading(false));
  }, []);

  /* ── Autosave ─────────────────────────────────────────────────── */
  const save = useCallback(async (patch) => {
    if (submitted) return;
    setSaving(true);
    try {
      const r = await fetch('/api/s9/learning-review', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (r.ok) {
        const body = await r.json();
        if (body.s9?.id && !s9Id) setS9Id(body.s9.id);
      }
    } finally {
      setSaving(false);
    }
  }, [submitted, s9Id]);

  function updateForm(patch) {
    const next = { ...form, ...patch };
    setForm(next);
    save(patch);
  }

  /* ── Submit ───────────────────────────────────────────────────── */
  async function handleSubmit() {
    setSubmitError(null);
    setSaving(true);
    try {
      // Save latest state first
      await save(form);
      const r = await fetch('/api/s9/learning-review/submit', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const body = await r.json();
      if (!r.ok) {
        setSubmitError(body.error ?? 'Erreur lors de la soumission');
      } else {
        setSubmitted(true);
        if (onMissionUpdate) onMissionUpdate();
      }
    } catch {
      setSubmitError('Erreur réseau');
    } finally {
      setSaving(false);
    }
  }

  /* ── Observation helpers ──────────────────────────────────────── */
  function addObs() {
    updateForm({ observations: [...form.observations, { fact: '', type: 'observation' }] });
  }
  function updateObs(i, patch) {
    const next = form.observations.map((o, idx) => idx === i ? { ...o, ...patch } : o);
    updateForm({ observations: next });
  }
  function removeObs(i) {
    updateForm({ observations: form.observations.filter((_, idx) => idx !== i) });
  }

  /* ── Keep helpers ─────────────────────────────────────────────── */
  function addKeep() {
    updateForm({ keep: [...form.keep, { element: '', reason: '' }] });
  }
  function updateKeep(i, patch) {
    const next = form.keep.map((k, idx) => idx === i ? { ...k, ...patch } : k);
    updateForm({ keep: next });
  }
  function removeKeep(i) {
    updateForm({ keep: form.keep.filter((_, idx) => idx !== i) });
  }

  /* ── Render ───────────────────────────────────────────────────── */
  if (loading) return <div className={styles.loading}>Chargement…</div>;
  if (error) return <div className={styles.errorMsg}>{error}</div>;

  if (submitted) {
    return (
      <div className={styles.panel}>
        <div className={styles.successBanner}>
          Ton analyse terrain est documentée.
          <div className={styles.successSub}>
            La prochaine étape sera de réaliser le test que tu viens de préparer.
          </div>
        </div>
      </div>
    );
  }

  const isReadOnly = submitted;

  return (
    <div className={styles.panel}>
      {/* Step nav */}
      <nav className={styles.stepNav}>
        {STEPS.map((label, i) => (
          <button
            key={i}
            className={`${styles.stepBtn} ${i === step ? styles.stepBtnActive : ''}`}
            onClick={() => setStep(i)}
            type="button"
          >
            {label}
          </button>
        ))}
      </nav>

      {saving && <div className={styles.savingIndicator}>Enregistrement…</div>}

      <div className={styles.stepBody}>

        {/* ── STEP 0: TON TEST TERRAIN (read-only depuis S8) ── */}
        {step === 0 && (
          <>
            <p className={styles.stepTitle}>{STEPS[0]}</p>
            <p className={styles.stepSubtitle}>Voici ce qui s'est passé lors de ton test terrain S8.</p>
            {s8Ref ? (
              <div className={styles.refPanel}>
                <p className={styles.refPanelTitle}>Résumé du test terrain S8</p>
                {s8Ref.test_context?.date && (
                  <div className={styles.refItem}>
                    <div className={styles.refItemLabel}>Date</div>
                    <div className={styles.refItemValue}>{s8Ref.test_context.date}</div>
                  </div>
                )}
                {s8Ref.test_context?.person_type && (
                  <div className={styles.refItem}>
                    <div className={styles.refItemLabel}>Avec qui</div>
                    <div className={styles.refItemValue}>{s8Ref.test_context.person_type}</div>
                  </div>
                )}
                {s8Ref.presented?.offer_sentence_used && (
                  <div className={styles.refItem}>
                    <div className={styles.refItemLabel}>Phrase d'offre utilisée</div>
                    <div className={styles.refItemValue}>{s8Ref.presented.offer_sentence_used}</div>
                  </div>
                )}
                {s8Ref.outcome_type && (
                  <div className={styles.refItem}>
                    <div className={styles.refItemLabel}>Outcome</div>
                    <div className={styles.refItemValue}>{s8Ref.outcome_type}{s8Ref.outcome_note ? ` — ${s8Ref.outcome_note}` : ''}</div>
                  </div>
                )}
                {s8Ref.what_i_learned && (
                  <div className={styles.refItem}>
                    <div className={styles.refItemLabel}>Ce que j'ai appris (S8)</div>
                    <div className={styles.refItemValue}>{s8Ref.what_i_learned}</div>
                  </div>
                )}
                {s8Ref.next_to_verify && (
                  <div className={styles.refItem}>
                    <div className={styles.refItemLabel}>À vérifier ensuite (S8)</div>
                    <div className={styles.refItemValue}>{s8Ref.next_to_verify}</div>
                  </div>
                )}
                {s8Ref.verbatims?.length > 0 && (
                  <div className={styles.refItem}>
                    <div className={styles.refItemLabel}>Verbatims</div>
                    {s8Ref.verbatims.map((v, i) => (
                      <div key={i} className={styles.refItemValue}>"{v}"</div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className={styles.errorMsg}>Aucune donnée S8 disponible.</div>
            )}
          </>
        )}

        {/* ── STEP 1: CE QUI S'EST RÉELLEMENT PASSÉ ── */}
        {step === 1 && (
          <>
            <p className={styles.stepTitle}>{STEPS[1]}</p>
            <p className={styles.stepSubtitle}>Décris ce qui s'est réellement passé — sans interpréter.</p>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Ce qui s'est réellement passé *</label>
              <p className={styles.fieldHint}>Les faits bruts. Ce que tu as vu, entendu, observé.</p>
              <textarea
                className={styles.textarea}
                rows={4}
                value={form.learnings.what_really_happened}
                onChange={e => updateForm({ learnings: { ...form.learnings, what_really_happened: e.target.value } })}
                disabled={isReadOnly}
                placeholder="Ce que j'ai observé concrètement lors du test…"
              />
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Ce qui m'a surpris</label>
              <textarea
                className={styles.textarea}
                rows={3}
                value={form.learnings.what_surprised}
                onChange={e => updateForm({ learnings: { ...form.learnings, what_surprised: e.target.value } })}
                disabled={isReadOnly}
                placeholder="Ce à quoi je ne m'attendais pas…"
              />
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Ce qui reste inconnu</label>
              <textarea
                className={styles.textarea}
                rows={3}
                value={form.learnings.what_remains_unknown}
                onChange={e => updateForm({ learnings: { ...form.learnings, what_remains_unknown: e.target.value } })}
                disabled={isReadOnly}
                placeholder="Ce que je ne sais toujours pas après ce test…"
              />
            </div>
          </>
        )}

        {/* ── STEP 2: SIGNAL OU HYPOTHÈSE ? ── */}
        {step === 2 && (
          <>
            <p className={styles.stepTitle}>{STEPS[2]}</p>
            <p className={styles.stepSubtitle}>Classe chaque observation : est-ce un fait, une hypothèse, un signal à confirmer, ou quelque chose d'incertain ?</p>
            {form.observations.map((obs, i) => (
              <div key={i} className={styles.obsCard}>
                <textarea
                  className={styles.textarea}
                  rows={2}
                  value={obs.fact}
                  onChange={e => updateObs(i, { fact: e.target.value })}
                  disabled={isReadOnly}
                  placeholder="Décris ce que tu as observé ou retenu…"
                />
                <div className={styles.obsTypeRow}>
                  {OBS_TYPES.map(t => (
                    <button
                      key={t.value}
                      type="button"
                      className={`${styles.obsTypeBtn} ${obs.type === t.value ? styles.obsTypeBtnActive : ''}`}
                      onClick={() => !isReadOnly && updateObs(i, { type: t.value })}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                {!isReadOnly && (
                  <button className={styles.obsRemoveBtn} type="button" onClick={() => removeObs(i)}>
                    Supprimer
                  </button>
                )}
              </div>
            ))}
            {!isReadOnly && (
              <button className={styles.addBtn} type="button" onClick={addObs}>
                + Ajouter une observation
              </button>
            )}
          </>
        )}

        {/* ── STEP 3: CE QUE TU GARDES ── */}
        {step === 3 && (
          <>
            <p className={styles.stepTitle}>{STEPS[3]}</p>
            <p className={styles.stepSubtitle}>Quels éléments de ton approche fonctionnent et méritent d'être conservés ?</p>
            {form.keep.map((k, i) => (
              <div key={i} className={styles.keepCard}>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Élément gardé *</label>
                  <input
                    className={styles.input}
                    value={k.element}
                    onChange={e => updateKeep(i, { element: e.target.value })}
                    disabled={isReadOnly}
                    placeholder="Ce que je garde tel quel…"
                  />
                </div>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Pourquoi</label>
                  <input
                    className={styles.input}
                    value={k.reason}
                    onChange={e => updateKeep(i, { reason: e.target.value })}
                    disabled={isReadOnly}
                    placeholder="Parce que…"
                  />
                </div>
                {!isReadOnly && (
                  <button className={styles.obsRemoveBtn} type="button" onClick={() => removeKeep(i)}>
                    Supprimer
                  </button>
                )}
              </div>
            ))}
            {!isReadOnly && (
              <button className={styles.addBtn} type="button" onClick={addKeep}>
                + Ajouter un élément
              </button>
            )}
          </>
        )}

        {/* ── STEP 4: HYPOTHÈSE PRIORITAIRE ── */}
        {step === 4 && (
          <>
            <p className={styles.stepTitle}>{STEPS[4]}</p>
            <p className={styles.stepSubtitle}>Quelle est l'hypothèse la plus importante à tester ensuite ? Une seule.</p>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Formulation de l'hypothèse *</label>
              <p className={styles.fieldHint}>Je suppose que… / Mon hypothèse est que…</p>
              <textarea
                className={styles.textarea}
                rows={3}
                value={form.hypothesis_to_test.formulation}
                onChange={e => updateForm({ hypothesis_to_test: { ...form.hypothesis_to_test, formulation: e.target.value } })}
                disabled={isReadOnly}
                placeholder="Je suppose que les femmes en reconversion ont besoin de…"
              />
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Catégorie</label>
              <input
                className={styles.input}
                value={form.hypothesis_to_test.category}
                onChange={e => updateForm({ hypothesis_to_test: { ...form.hypothesis_to_test, category: e.target.value } })}
                disabled={isReadOnly}
                placeholder="Prix / Format / Cible / Différenciation…"
              />
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Pourquoi cette hypothèse en priorité</label>
              <textarea
                className={styles.textarea}
                rows={2}
                value={form.hypothesis_to_test.why_priority}
                onChange={e => updateForm({ hypothesis_to_test: { ...form.hypothesis_to_test, why_priority: e.target.value } })}
                disabled={isReadOnly}
                placeholder="Parce que si elle est vraie / fausse, ça changerait…"
              />
            </div>
          </>
        )}

        {/* ── STEP 5: PROCHAIN TEST ── */}
        {step === 5 && (
          <>
            <p className={styles.stepTitle}>{STEPS[5]}</p>
            <p className={styles.stepSubtitle}>Prépare ton prochain test terrain. Sois précis·e.</p>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Question du test *</label>
              <textarea
                className={styles.textarea}
                rows={2}
                value={form.next_test.question}
                onChange={e => updateForm({ next_test: { ...form.next_test, question: e.target.value } })}
                disabled={isReadOnly}
                placeholder="Est-ce que les femmes salariées en reconversion seraient prêtes à payer X pour…"
              />
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>À qui vas-tu parler ? *</label>
              <input
                className={styles.input}
                value={form.next_test.target_person}
                onChange={e => updateForm({ next_test: { ...form.next_test, target_person: e.target.value } })}
                disabled={isReadOnly}
                placeholder="Type de personne cible…"
              />
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Élément testé</label>
              <input
                className={styles.input}
                value={form.next_test.element_tested}
                onChange={e => updateForm({ next_test: { ...form.next_test, element_tested: e.target.value } })}
                disabled={isReadOnly}
                placeholder="Prix / Phrase d'offre / Format…"
              />
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Ce que tu vas présenter</label>
              <textarea
                className={styles.textarea}
                rows={2}
                value={form.next_test.what_to_present}
                onChange={e => updateForm({ next_test: { ...form.next_test, what_to_present: e.target.value } })}
                disabled={isReadOnly}
                placeholder="La phrase d'offre / le pitch / le prix…"
              />
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Quelle donnée tu veux observer *</label>
              <textarea
                className={styles.textarea}
                rows={2}
                value={form.next_test.data_to_observe}
                onChange={e => updateForm({ next_test: { ...form.next_test, data_to_observe: e.target.value } })}
                disabled={isReadOnly}
                placeholder="La réaction à la phrase d'offre / le niveau d'intérêt / les questions posées…"
              />
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Critères de fin du test</label>
              <input
                className={styles.input}
                value={form.next_test.completion_criteria}
                onChange={e => updateForm({ next_test: { ...form.next_test, completion_criteria: e.target.value } })}
                disabled={isReadOnly}
                placeholder="Après X conversations / si j'obtiens Y…"
              />
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Prochaine action concrète *</label>
              <input
                className={styles.input}
                value={form.next_test.next_action}
                onChange={e => updateForm({ next_test: { ...form.next_test, next_action: e.target.value } })}
                disabled={isReadOnly}
                placeholder="Contacter X personnes ce weekend / Envoyer un message sur LinkedIn…"
              />
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Date prévue</label>
              <input
                className={styles.input}
                type="date"
                value={form.next_test.planned_date}
                onChange={e => updateForm({ next_test: { ...form.next_test, planned_date: e.target.value } })}
                disabled={isReadOnly}
              />
            </div>
          </>
        )}

        {/* ── STEP 6: JE SAIS / JE SUPPOSE / JE DOIS VÉRIFIER ── */}
        {step === 6 && (
          <>
            <p className={styles.stepTitle}>{STEPS[6]}</p>
            <p className={styles.stepSubtitle}>Distingue ce que tu sais des faits, de tes suppositions, et de ce que tu dois encore vérifier.</p>
            <AcknowledgeField
              label="Ce que je sais (faits vérifiés)"
              hint="Ce qui a été confirmé lors de ce test."
              value={form.epistemic.facts}
              acknowledged={form.epistemic.facts_acknowledged}
              onValue={v => updateForm({ epistemic: { ...form.epistemic, facts: v } })}
              onAck={() => updateForm({ epistemic: { ...form.epistemic, facts_acknowledged: true } })}
              onUnack={() => updateForm({ epistemic: { ...form.epistemic, facts_acknowledged: false } })}
              disabled={isReadOnly}
              placeholder="Faits confirmés lors du test…"
            />
            <AcknowledgeField
              label="Ce que je suppose"
              hint="Tes interprétations — pas encore vérifiées."
              value={form.epistemic.assumptions}
              acknowledged={form.epistemic.assumptions_acknowledged}
              onValue={v => updateForm({ epistemic: { ...form.epistemic, assumptions: v } })}
              onAck={() => updateForm({ epistemic: { ...form.epistemic, assumptions_acknowledged: true } })}
              onUnack={() => updateForm({ epistemic: { ...form.epistemic, assumptions_acknowledged: false } })}
              disabled={isReadOnly}
              placeholder="Je suppose que…"
            />
            <AcknowledgeField
              label="Ce que je dois encore vérifier"
              hint="Les questions que ce test n'a pas encore répondues."
              value={form.epistemic.to_verify}
              acknowledged={form.epistemic.to_verify_acknowledged}
              onValue={v => updateForm({ epistemic: { ...form.epistemic, to_verify: v } })}
              onAck={() => updateForm({ epistemic: { ...form.epistemic, to_verify_acknowledged: true } })}
              onUnack={() => updateForm({ epistemic: { ...form.epistemic, to_verify_acknowledged: false } })}
              disabled={isReadOnly}
              placeholder="Je dois encore vérifier…"
            />
          </>
        )}

        {/* ── STEP 7: SYNTHÈSE ET SOUMISSION ── */}
        {step === 7 && (
          <>
            <p className={styles.stepTitle}>{STEPS[7]}</p>
            <p className={styles.stepSubtitle}>
              "Ton objectif n'est pas d'avoir raison après un test. Ton objectif est de savoir quoi vérifier ensuite."
            </p>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Synthèse</label>
              <p className={styles.fieldHint}>En une ou deux phrases : qu'as-tu appris et quelle est ta prochaine direction ?</p>
              <textarea
                className={styles.textarea}
                rows={4}
                value={form.synthesis}
                onChange={e => updateForm({ synthesis: e.target.value })}
                disabled={isReadOnly}
                placeholder="Ce test m'a appris que… Ma prochaine étape est de vérifier…"
              />
            </div>
            {submitError && <div className={styles.errorMsg}>{submitError}</div>}
            <button
              className={styles.submitBtn}
              type="button"
              onClick={handleSubmit}
              disabled={saving || isReadOnly}
            >
              SOUMETTRE MON ANALYSE TERRAIN
            </button>
          </>
        )}

        {/* Nav */}
        <div className={styles.navRow}>
          {step > 0 && (
            <button className={styles.btnBack} type="button" onClick={() => setStep(s => s - 1)}>
              ← Précédent
            </button>
          )}
          {step < STEPS.length - 1 && (
            <button className={styles.btnNext} type="button" onClick={() => setStep(s => s + 1)}>
              Suivant →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
