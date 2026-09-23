/**
 * SprintEightPanel — S8 : PREMIER TEST TERRAIN
 * 9 steps (0-8):
 *   0. CE QUE TU AVAIS PRÉPARÉ (read-only depuis S7/S6)
 *   1. CE QUE TU AS TESTÉ (date, canal, contexte, interaction réelle confirmée)
 *   2. AVEC QUI (type de personne, correspond à la cible ?)
 *   3. CE QUE TU AS PRÉSENTÉ (phrase d'offre utilisée, pitch, prix présenté ?)
 *   4. CE QUI S'EST PASSÉ (réaction initiale, questions, objections, compris/incompris)
 *   5. SES MOTS EXACTS (verbatims)
 *   6. CE QUE TU EN COMPRENDS (interprétation + outcome)
 *   7. CE QUI RESTE À VÉRIFIER
 *   8. SOUMETTRE MON TEST TERRAIN
 */
import { useState, useEffect, useCallback } from 'react';
import styles from './SprintEightPanel.module.css';

const VALID_OUTCOMES = [
  { value: 'wants_more_info', label: 'Veut plus d\'informations' },
  { value: 'interested_no_commitment', label: 'Intéressée, pas encore engagée' },
  { value: 'declined', label: 'A décliné' },
  { value: 'unclear', label: 'Réaction peu claire' },
  { value: 'follow_up_requested', label: 'Relance demandée' },
  { value: 'call_booked', label: 'Appel booké' },
  { value: 'purchase', label: 'Achat' },
  { value: 'other', label: 'Autre' },
];

const TARGET_MATCH_OPTIONS = [
  { value: 'yes', label: 'Oui, ça correspond' },
  { value: 'no', label: 'Non, hors cible' },
  { value: 'uncertain', label: 'Incertain·e' },
];

const STEPS = [
  'CE QUE TU AVAIS PRÉPARÉ',
  'CE QUE TU AS TESTÉ',
  'AVEC QUI',
  'CE QUE TU AS PRÉSENTÉ',
  'CE QUI S\'EST PASSÉ',
  'SES MOTS EXACTS',
  'CE QUE TU EN COMPRENDS',
  'CE QUI RESTE À VÉRIFIER',
  'SOUMETTRE',
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
export function SprintEightPanel({ sprint, onMissionUpdate }) {
  const [step, setStep] = useState(0);

  const [s8, setS8] = useState(null);
  const [s7Ref, setS7Ref] = useState(null);
  const [s6Ref, setS6Ref] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [submitError, setSubmitError] = useState(null);
  const [saveMsg, setSaveMsg] = useState('');

  // Step 1 — test context
  const [testDate, setTestDate] = useState('');
  const [testChannel, setTestChannel] = useState('');
  const [realInteractionConfirmed, setRealInteractionConfirmed] = useState(false);
  const [contextNote, setContextNote] = useState('');

  // Step 2 — who
  const [personType, setPersonType] = useState('');
  const [targetMatch, setTargetMatch] = useState('');

  // Step 3 — presented
  const [offerSentenceUsed, setOfferSentenceUsed] = useState('');
  const [pitchUsed, setPitchUsed] = useState('');
  const [pricePresented, setPricePresented] = useState(false);
  const [priceAmount, setPriceAmount] = useState('');
  const [callToActionUsed, setCallToActionUsed] = useState('');

  // Step 4 — observed reaction
  const [initialReaction, setInitialReaction] = useState('');
  const [questionsAsked, setQuestionsAsked] = useState('');
  const [objections, setObjections] = useState('');
  const [understood, setUnderstood] = useState('');
  const [misunderstood, setMisunderstood] = useState('');

  // Step 5 — verbatims
  const [verbatimInput, setVerbatimInput] = useState('');
  const [verbatims, setVerbatims] = useState([]);

  // Step 6 — interpretation + outcome
  const [outcomeType, setOutcomeType] = useState('');
  const [outcomeNote, setOutcomeNote] = useState('');
  const [whatILearned, setWhatILearned] = useState('');
  const [whatSurprisedMe, setWhatSurprisedMe] = useState('');
  const [whatToAdjust, setWhatToAdjust] = useState('');

  // Step 7 — to verify
  const [nextToVerify, setNextToVerify] = useState('');
  const [facts, setFacts] = useState('');
  const [factsAck, setFactsAck] = useState(false);
  const [assumptions, setAssumptions] = useState('');
  const [assumptionsAck, setAssumptionsAck] = useState(false);
  const [toVerify, setToVerify] = useState('');
  const [toVerifyAck, setToVerifyAck] = useState(false);
  const [synthesis, setSynthesis] = useState('');

  const submitted = s8?.status === 'submitted';

  /* ── Load ─────────────────────────────────────────────────────── */
  useEffect(() => {
    setLoading(true);
    fetch('/api/s8/field-test', { credentials: 'include' })
      .then(r => r.ok ? r.json() : r.json().then(b => Promise.reject(b.error ?? 'Erreur chargement S8')))
      .then(body => {
        setS7Ref(body.s7_ref ?? null);
        setS6Ref(body.s6_ref ?? null);
        const src = body.s8 ?? body.prefill ?? {};
        setS8(body.s8);

        const tc = src.test_context ?? {};
        setTestDate(tc.date ?? '');
        setTestChannel(tc.channel ?? '');
        setRealInteractionConfirmed(tc.real_interaction_confirmed ?? false);
        setContextNote(tc.context_note ?? '');
        setPersonType(tc.person_type ?? '');
        setTargetMatch(tc.target_match ?? '');

        const pr = src.presented ?? {};
        setOfferSentenceUsed(pr.offer_sentence_used ?? '');
        setPitchUsed(pr.pitch_used ?? '');
        setPricePresented(pr.price_presented ?? false);
        setPriceAmount(pr.price_amount != null ? String(pr.price_amount) : '');
        setCallToActionUsed(pr.call_to_action_used ?? '');

        const or = src.observed_reaction ?? {};
        setInitialReaction(or.initial_reaction ?? '');
        setQuestionsAsked(or.questions_asked ?? '');
        setObjections(or.objections ?? '');
        setUnderstood(or.understood ?? '');
        setMisunderstood(or.misunderstood ?? '');

        setVerbatims(src.verbatims ?? []);

        const out = src.outcome ?? {};
        setOutcomeType(out.type ?? '');
        setOutcomeNote(out.note ?? '');

        const interp = src.interpretation ?? {};
        setWhatILearned(interp.what_i_learned ?? '');
        setWhatSurprisedMe(interp.what_surprised_me ?? '');
        setWhatToAdjust(interp.what_to_adjust ?? '');

        setNextToVerify(src.next_to_verify ?? '');

        const ep = src.epistemic ?? {};
        setFacts(ep.facts ?? '');
        setFactsAck(ep.facts_acknowledged ?? false);
        setAssumptions(ep.assumptions ?? '');
        setAssumptionsAck(ep.assumptions_acknowledged ?? false);
        setToVerify(ep.to_verify ?? '');
        setToVerifyAck(ep.to_verify_acknowledged ?? false);
        setSynthesis(src.synthesis ?? '');
      })
      .catch(e => setError(typeof e === 'string' ? e : 'Erreur chargement S8'))
      .finally(() => setLoading(false));
  }, []);

  /* ── Build payload ───────────────────────────────────────────── */
  function buildPayload() {
    return {
      test_context: {
        date: testDate,
        channel: testChannel,
        person_type: personType,
        target_match: targetMatch || null,
        context_note: contextNote,
        real_interaction_confirmed: realInteractionConfirmed,
      },
      presented: {
        offer_sentence_used: offerSentenceUsed,
        pitch_used: pitchUsed,
        price_presented: pricePresented,
        price_amount: priceAmount ? Number(priceAmount) : null,
        call_to_action_used: callToActionUsed,
      },
      observed_reaction: {
        initial_reaction: initialReaction,
        questions_asked: questionsAsked,
        objections,
        understood,
        misunderstood,
        interest_shown: null,
      },
      verbatims,
      outcome: { type: outcomeType || null, note: outcomeNote },
      interpretation: {
        what_i_learned: whatILearned,
        what_surprised_me: whatSurprisedMe,
        what_to_adjust: whatToAdjust,
      },
      next_to_verify: nextToVerify,
      epistemic: {
        facts,
        facts_acknowledged: factsAck,
        assumptions,
        assumptions_acknowledged: assumptionsAck,
        to_verify: toVerify,
        to_verify_acknowledged: toVerifyAck,
      },
      synthesis,
    };
  }

  /* ── Save ─────────────────────────────────────────────────────── */
  const save = useCallback(async () => {
    if (submitted) return;
    setSaving(true);
    setSaveMsg('');
    try {
      const r = await fetch('/api/s8/field-test', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload()),
      });
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        setSaveMsg(b.error ?? 'Erreur sauvegarde');
      } else {
        const body = await r.json();
        setS8(body.s8);
        setSaveMsg('Sauvegardé');
        setTimeout(() => setSaveMsg(''), 2000);
      }
    } catch {
      setSaveMsg('Erreur réseau');
    } finally {
      setSaving(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitted, testDate, testChannel, realInteractionConfirmed, contextNote, personType, targetMatch,
      offerSentenceUsed, pitchUsed, pricePresented, priceAmount, callToActionUsed,
      initialReaction, questionsAsked, objections, understood, misunderstood,
      verbatims, outcomeType, outcomeNote, whatILearned, whatSurprisedMe, whatToAdjust,
      nextToVerify, facts, factsAck, assumptions, assumptionsAck, toVerify, toVerifyAck, synthesis]);

  /* ── Submit ───────────────────────────────────────────────────── */
  async function handleSubmit() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await fetch('/api/s8/field-test', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload()),
      });
      const r = await fetch('/api/s8/field-test/submit', {
        method: 'POST',
        credentials: 'include',
      });
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        setSubmitError(b.error ?? 'Erreur lors de la soumission');
      } else {
        setS8(prev => ({ ...(prev ?? {}), status: 'submitted' }));
        if (onMissionUpdate) onMissionUpdate();
      }
    } catch {
      setSubmitError('Erreur réseau');
    } finally {
      setSubmitting(false);
    }
  }

  /* ── Add verbatim ─────────────────────────────────────────────── */
  function addVerbatim() {
    const v = verbatimInput.trim();
    if (!v) return;
    setVerbatims(prev => [...prev, v]);
    setVerbatimInput('');
  }

  function removeVerbatim(i) {
    setVerbatims(prev => prev.filter((_, idx) => idx !== i));
  }

  /* ── Render ───────────────────────────────────────────────────── */
  if (loading) return <div className={styles.loading}>Chargement du Sprint 8…</div>;
  if (error) return <div className={styles.errorBanner}>{error}</div>;

  if (submitted) {
    return (
      <div className={styles.submittedState}>
        <div className={styles.submittedIcon}>✓</div>
        <h3 className={styles.submittedTitle}>Test Terrain documenté</h3>
        <p className={styles.submittedMsg}>
          Ton Premier Test Terrain est documenté. La prochaine étape sera d'analyser ce que ce test t'apprend et de décider de la suite.
        </p>
        {outcomeType === 'declined' && (
          <p className={styles.outcomeNote}>
            Un refus n'est pas un échec. C'est une donnée terrain précieuse.
          </p>
        )}
        {outcomeType === 'purchase' && (
          <p className={styles.outcomeNote}>
            Un achat est un signal positif. Il ne valide pas encore ton marché — la prochaine étape est de vérifier si ce signal se confirme.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      {/* Step nav */}
      <div className={styles.stepNav} role="tablist">
        {STEPS.map((label, i) => (
          <button
            key={i}
            role="tab"
            aria-selected={step === i}
            className={`${styles.stepBtn} ${step === i ? styles.stepActive : ''}`}
            onClick={() => setStep(i)}
          >
            <span className={styles.stepNum}>{i}</span>
            <span className={styles.stepLabel}>{label}</span>
          </button>
        ))}
      </div>

      <div className={styles.stepBody}>

        {/* Step 0 — CE QUE TU AVAIS PRÉPARÉ */}
        {step === 0 && (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Ce que tu avais préparé</h3>
            <p className={styles.sectionHint}>Ces éléments proviennent de ta Présentation Terrain (Sprint 7). Ils sont en lecture seule.</p>
            {s7Ref ? (
              <div className={styles.readOnlyBox}>
                {s7Ref.offer_sentence_formulation && (
                  <div className={styles.refBlock}>
                    <span className={styles.refLabel}>Phrase d'offre préparée (S7)</span>
                    <p className={styles.refValue}>{s7Ref.offer_sentence_formulation}</p>
                  </div>
                )}
                {s7Ref.pitch_call_to_action && (
                  <div className={styles.refBlock}>
                    <span className={styles.refLabel}>Appel à action préparé (S7)</span>
                    <p className={styles.refValue}>{s7Ref.pitch_call_to_action}</p>
                  </div>
                )}
                {s6Ref?.pricing_amount && (
                  <div className={styles.refBlock}>
                    <span className={styles.refLabel}>Prix hypothèse (S6)</span>
                    <p className={styles.refValue}>{s6Ref.pricing_amount} €</p>
                  </div>
                )}
              </div>
            ) : (
              <p className={styles.noRef}>Aucune référence S7 chargée.</p>
            )}
            <button className={styles.nextBtn} onClick={() => setStep(1)}>Suivant →</button>
          </section>
        )}

        {/* Step 1 — CE QUE TU AS TESTÉ */}
        {step === 1 && (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Ce que tu as testé</h3>

            <div className={styles.confirmBox}>
              <label className={styles.checkLabel}>
                <input
                  type="checkbox"
                  checked={realInteractionConfirmed}
                  onChange={e => setRealInteractionConfirmed(e.target.checked)}
                />
                <span>Ce test a eu lieu avec une vraie personne — pas une simulation COPILOTE.</span>
              </label>
              {!realInteractionConfirmed && (
                <p className={styles.fieldWarning}>
                  La simulation COPILOTE est un exercice de préparation. Elle ne remplace pas une interaction avec une vraie personne.
                </p>
              )}
            </div>

            <label className={styles.fieldLabel}>Date du test</label>
            <input
              type="date"
              className={styles.input}
              value={testDate}
              onChange={e => setTestDate(e.target.value)}
            />

            <label className={styles.fieldLabel}>Canal / contexte</label>
            <p className={styles.fieldHint}>Où et comment la rencontre a eu lieu (en personne, visio, message, événement…)</p>
            <input
              type="text"
              className={styles.input}
              placeholder="Ex : Café, visio LinkedIn, événement réseau…"
              value={testChannel}
              onChange={e => setTestChannel(e.target.value)}
            />

            <label className={styles.fieldLabel}>Note de contexte (optionnel)</label>
            <textarea
              className={styles.textarea}
              rows={2}
              placeholder="Circonstances particulières, ambiance, durée…"
              value={contextNote}
              onChange={e => setContextNote(e.target.value)}
            />

            <div className={styles.navRow}>
              <button className={styles.prevBtn} onClick={() => setStep(0)}>← Précédent</button>
              <button className={styles.saveBtn} onClick={save} disabled={saving}>
                {saving ? 'Sauvegarde…' : 'Sauvegarder'}
              </button>
              <button className={styles.nextBtn} onClick={() => setStep(2)}>Suivant →</button>
            </div>
            {saveMsg && <p className={styles.saveMsg}>{saveMsg}</p>}
          </section>
        )}

        {/* Step 2 — AVEC QUI */}
        {step === 2 && (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Avec qui</h3>

            <label className={styles.fieldLabel}>Type de personne rencontrée *</label>
            <p className={styles.fieldHint}>Décris qui était cette personne (profil, situation, contexte)</p>
            <textarea
              className={styles.textarea}
              rows={3}
              placeholder="Ex : Femme, 42 ans, salariée en reconversion depuis 1 an, secteur RH…"
              value={personType}
              onChange={e => setPersonType(e.target.value)}
            />

            <label className={styles.fieldLabel}>Correspond à ta cible test ? *</label>
            <div className={styles.radioGroup}>
              {TARGET_MATCH_OPTIONS.map(opt => (
                <label key={opt.value} className={styles.radioLabel}>
                  <input
                    type="radio"
                    name="targetMatch"
                    value={opt.value}
                    checked={targetMatch === opt.value}
                    onChange={() => setTargetMatch(opt.value)}
                  />
                  {opt.label}
                </label>
              ))}
            </div>

            <div className={styles.navRow}>
              <button className={styles.prevBtn} onClick={() => setStep(1)}>← Précédent</button>
              <button className={styles.saveBtn} onClick={save} disabled={saving}>
                {saving ? 'Sauvegarde…' : 'Sauvegarder'}
              </button>
              <button className={styles.nextBtn} onClick={() => setStep(3)}>Suivant →</button>
            </div>
            {saveMsg && <p className={styles.saveMsg}>{saveMsg}</p>}
          </section>
        )}

        {/* Step 3 — CE QUE TU AS PRÉSENTÉ */}
        {step === 3 && (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Ce que tu as présenté</h3>

            <label className={styles.fieldLabel}>Phrase d'offre utilisée *</label>
            <p className={styles.fieldHint}>Quelle formulation as-tu réellement utilisée ? (peut différer de celle préparée)</p>
            <textarea
              className={styles.textarea}
              rows={3}
              placeholder="La phrase exacte que tu as utilisée…"
              value={offerSentenceUsed}
              onChange={e => setOfferSentenceUsed(e.target.value)}
            />

            <label className={styles.fieldLabel}>Pitch utilisé (optionnel)</label>
            <textarea
              className={styles.textarea}
              rows={4}
              placeholder="Le pitch tel que tu l'as réellement dit…"
              value={pitchUsed}
              onChange={e => setPitchUsed(e.target.value)}
            />

            <div className={styles.checkRow}>
              <label className={styles.checkLabel}>
                <input
                  type="checkbox"
                  checked={pricePresented}
                  onChange={e => setPricePresented(e.target.checked)}
                />
                <span>J'ai mentionné un prix</span>
              </label>
            </div>
            {pricePresented && (
              <div className={styles.inlineField}>
                <label className={styles.fieldLabel}>Montant présenté (€)</label>
                <input
                  type="number"
                  className={styles.inputSmall}
                  min={0}
                  value={priceAmount}
                  onChange={e => setPriceAmount(e.target.value)}
                />
              </div>
            )}

            <label className={styles.fieldLabel}>Appel à action utilisé</label>
            <input
              type="text"
              className={styles.input}
              placeholder="Ex : Je t'envoie un message cette semaine…"
              value={callToActionUsed}
              onChange={e => setCallToActionUsed(e.target.value)}
            />

            <div className={styles.navRow}>
              <button className={styles.prevBtn} onClick={() => setStep(2)}>← Précédent</button>
              <button className={styles.saveBtn} onClick={save} disabled={saving}>
                {saving ? 'Sauvegarde…' : 'Sauvegarder'}
              </button>
              <button className={styles.nextBtn} onClick={() => setStep(4)}>Suivant →</button>
            </div>
            {saveMsg && <p className={styles.saveMsg}>{saveMsg}</p>}
          </section>
        )}

        {/* Step 4 — CE QUI S'EST PASSÉ */}
        {step === 4 && (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Ce qui s'est passé</h3>
            <p className={styles.sectionHint}>Décris ce que tu as observé — pas ce que tu en penses. Les faits d'abord.</p>

            <label className={styles.fieldLabel}>Réaction initiale *</label>
            <p className={styles.fieldHint}>Qu'est-ce que la personne a fait ou dit en premier ?</p>
            <textarea
              className={styles.textarea}
              rows={3}
              placeholder="Ex : Elle a hoché la tête, a demandé 'c'est pour qui ça ?'…"
              value={initialReaction}
              onChange={e => setInitialReaction(e.target.value)}
            />

            <label className={styles.fieldLabel}>Questions posées (optionnel)</label>
            <textarea
              className={styles.textarea}
              rows={2}
              placeholder="Quelles questions a-t-elle posées ?"
              value={questionsAsked}
              onChange={e => setQuestionsAsked(e.target.value)}
            />

            <label className={styles.fieldLabel}>Objections / résistances (optionnel)</label>
            <textarea
              className={styles.textarea}
              rows={2}
              placeholder="Qu'est-ce qui a bloqué ou freiné ?"
              value={objections}
              onChange={e => setObjections(e.target.value)}
            />

            <label className={styles.fieldLabel}>Ce qui a été compris (optionnel)</label>
            <textarea
              className={styles.textarea}
              rows={2}
              placeholder="Qu'est-ce qui semblait clair pour elle ?"
              value={understood}
              onChange={e => setUnderstood(e.target.value)}
            />

            <label className={styles.fieldLabel}>Ce qui n'a pas été compris (optionnel)</label>
            <textarea
              className={styles.textarea}
              rows={2}
              placeholder="Qu'est-ce qui semblait confus ou mal compris ?"
              value={misunderstood}
              onChange={e => setMisunderstood(e.target.value)}
            />

            <div className={styles.navRow}>
              <button className={styles.prevBtn} onClick={() => setStep(3)}>← Précédent</button>
              <button className={styles.saveBtn} onClick={save} disabled={saving}>
                {saving ? 'Sauvegarde…' : 'Sauvegarder'}
              </button>
              <button className={styles.nextBtn} onClick={() => setStep(5)}>Suivant →</button>
            </div>
            {saveMsg && <p className={styles.saveMsg}>{saveMsg}</p>}
          </section>
        )}

        {/* Step 5 — SES MOTS EXACTS */}
        {step === 5 && (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Ses mots exacts</h3>
            <p className={styles.sectionHint}>
              Note ici les phrases exactes que la personne a dites. Les verbatims sont les données les plus précieuses du test terrain.
            </p>

            <div className={styles.verbatimAdd}>
              <textarea
                className={styles.textarea}
                rows={2}
                placeholder='Ex : "Je me demandais justement comment faire ça…"'
                value={verbatimInput}
                onChange={e => setVerbatimInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) addVerbatim(); }}
              />
              <button className={styles.addVerbatimBtn} onClick={addVerbatim} disabled={!verbatimInput.trim()}>
                Ajouter
              </button>
            </div>

            {verbatims.length > 0 && (
              <ul className={styles.verbatimList}>
                {verbatims.map((v, i) => (
                  <li key={i} className={styles.verbatimItem}>
                    <span className={styles.verbatimQuote}>"{v}"</span>
                    <button className={styles.removeVerbatimBtn} onClick={() => removeVerbatim(i)} aria-label="Supprimer">×</button>
                  </li>
                ))}
              </ul>
            )}
            {verbatims.length === 0 && (
              <p className={styles.noVerbatims}>Aucun verbatim ajouté pour l'instant.</p>
            )}

            <div className={styles.navRow}>
              <button className={styles.prevBtn} onClick={() => setStep(4)}>← Précédent</button>
              <button className={styles.saveBtn} onClick={save} disabled={saving}>
                {saving ? 'Sauvegarde…' : 'Sauvegarder'}
              </button>
              <button className={styles.nextBtn} onClick={() => setStep(6)}>Suivant →</button>
            </div>
            {saveMsg && <p className={styles.saveMsg}>{saveMsg}</p>}
          </section>
        )}

        {/* Step 6 — CE QUE TU EN COMPRENDS */}
        {step === 6 && (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Ce que tu en comprends</h3>
            <p className={styles.sectionHint}>Tu passes maintenant des faits observés à ton interprétation. Rappelle-toi : c'est une hypothèse, pas une certitude.</p>

            <label className={styles.fieldLabel}>Outcome du test *</label>
            <div className={styles.radioGroup}>
              {VALID_OUTCOMES.map(opt => (
                <label key={opt.value} className={styles.radioLabel}>
                  <input
                    type="radio"
                    name="outcome"
                    value={opt.value}
                    checked={outcomeType === opt.value}
                    onChange={() => setOutcomeType(opt.value)}
                  />
                  {opt.label}
                </label>
              ))}
            </div>

            {outcomeType === 'declined' && (
              <div className={styles.outcomeHint}>
                Un refus n'est pas un échec. C'est une donnée. La question est : qu'est-ce que ce refus t'apprend ?
              </div>
            )}
            {outcomeType === 'purchase' && (
              <div className={styles.outcomeHint}>
                C'est un signal positif. Un achat unique ne valide pas ton marché. La prochaine étape est de voir si ce signal se confirme.
              </div>
            )}

            <label className={styles.fieldLabel}>Note sur l'outcome (optionnel)</label>
            <textarea
              className={styles.textarea}
              rows={2}
              placeholder="Précisions sur ce qui s'est passé…"
              value={outcomeNote}
              onChange={e => setOutcomeNote(e.target.value)}
            />

            <label className={styles.fieldLabel}>Ce que tu penses avoir appris *</label>
            <textarea
              className={styles.textarea}
              rows={3}
              placeholder="Qu'est-ce que ce test t'a appris sur ton offre, ta cible, ton pitch ?"
              value={whatILearned}
              onChange={e => setWhatILearned(e.target.value)}
            />

            <label className={styles.fieldLabel}>Ce qui t'a surpris (optionnel)</label>
            <textarea
              className={styles.textarea}
              rows={2}
              placeholder="Y a-t-il eu une réaction inattendue ?"
              value={whatSurprisedMe}
              onChange={e => setWhatSurprisedMe(e.target.value)}
            />

            <label className={styles.fieldLabel}>Ce que tu ajusterais (optionnel)</label>
            <textarea
              className={styles.textarea}
              rows={2}
              placeholder="Si tu refaisais ce test demain, qu'est-ce que tu changerais ?"
              value={whatToAdjust}
              onChange={e => setWhatToAdjust(e.target.value)}
            />

            <div className={styles.navRow}>
              <button className={styles.prevBtn} onClick={() => setStep(5)}>← Précédent</button>
              <button className={styles.saveBtn} onClick={save} disabled={saving}>
                {saving ? 'Sauvegarde…' : 'Sauvegarder'}
              </button>
              <button className={styles.nextBtn} onClick={() => setStep(7)}>Suivant →</button>
            </div>
            {saveMsg && <p className={styles.saveMsg}>{saveMsg}</p>}
          </section>
        )}

        {/* Step 7 — CE QUI RESTE À VÉRIFIER */}
        {step === 7 && (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Ce qui reste à vérifier</h3>

            <label className={styles.fieldLabel}>Ce que tu dois vérifier ensuite *</label>
            <p className={styles.fieldHint}>Un test terrain ne te donne pas une vérité. Il te donne une information de plus pour mieux décider.</p>
            <textarea
              className={styles.textarea}
              rows={3}
              placeholder="Quelle est la prochaine question que tu dois tester sur le terrain ?"
              value={nextToVerify}
              onChange={e => setNextToVerify(e.target.value)}
            />

            <div className={styles.epistemicSection}>
              <h4 className={styles.epistemicTitle}>Bilan épistémique</h4>
              <p className={styles.epistemicHint}>Ce que tu sais, ce que tu supposes, ce que tu dois encore vérifier.</p>

              <AcknowledgeField
                label="Ce que je sais (faits vérifiés)"
                hint="Qu'est-ce que ce test t'a confirmé comme fait réel ?"
                value={facts}
                acknowledged={factsAck}
                onValue={setFacts}
                onAck={() => setFactsAck(true)}
                onUnack={() => setFactsAck(false)}
                placeholder="Ex : La personne a bien compris de quoi il s'agissait…"
              />

              <AcknowledgeField
                label="Ce que je suppose"
                hint="Quelles interprétations fais-tu qui restent des hypothèses ?"
                value={assumptions}
                acknowledged={assumptionsAck}
                onValue={setAssumptions}
                onAck={() => setAssumptionsAck(true)}
                onUnack={() => setAssumptionsAck(false)}
                placeholder="Ex : Je suppose que le prix était trop élevé…"
              />

              <AcknowledgeField
                label="Ce que je dois encore vérifier"
                hint="Quelles questions ce test a-t-il soulevé sans y répondre ?"
                value={toVerify}
                acknowledged={toVerifyAck}
                onValue={setToVerify}
                onAck={() => setToVerifyAck(true)}
                onUnack={() => setToVerifyAck(false)}
                placeholder="Ex : Est-ce que d'autres personnes réagiraient de la même façon ?"
              />
            </div>

            <label className={styles.fieldLabel}>Synthèse (optionnel)</label>
            <textarea
              className={styles.textarea}
              rows={3}
              placeholder="En une ou deux phrases, qu'est-ce que ce test t'a appris ?"
              value={synthesis}
              onChange={e => setSynthesis(e.target.value)}
            />

            <div className={styles.navRow}>
              <button className={styles.prevBtn} onClick={() => setStep(6)}>← Précédent</button>
              <button className={styles.saveBtn} onClick={save} disabled={saving}>
                {saving ? 'Sauvegarde…' : 'Sauvegarder'}
              </button>
              <button className={styles.nextBtn} onClick={() => setStep(8)}>Suivant →</button>
            </div>
            {saveMsg && <p className={styles.saveMsg}>{saveMsg}</p>}
          </section>
        )}

        {/* Step 8 — SOUMETTRE */}
        {step === 8 && (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Soumettre mon Test Terrain</h3>
            <p className={styles.sectionHint}>
              Tu vas documenter officiellement ton Premier Test Terrain.
            </p>

            <div className={styles.submitChecklist}>
              <div className={`${styles.checkItem} ${realInteractionConfirmed ? styles.checkItemMet : styles.checkItemMissing}`}>
                <span>{realInteractionConfirmed ? '✓' : '○'}</span>
                Test avec une vraie personne confirmé
              </div>
              <div className={`${styles.checkItem} ${testDate ? styles.checkItemMet : styles.checkItemMissing}`}>
                <span>{testDate ? '✓' : '○'}</span>
                Date du test renseignée
              </div>
              <div className={`${styles.checkItem} ${personType ? styles.checkItemMet : styles.checkItemMissing}`}>
                <span>{personType ? '✓' : '○'}</span>
                Type de personne décrit
              </div>
              <div className={`${styles.checkItem} ${targetMatch ? styles.checkItemMet : styles.checkItemMissing}`}>
                <span>{targetMatch ? '✓' : '○'}</span>
                Correspondance cible renseignée
              </div>
              <div className={`${styles.checkItem} ${offerSentenceUsed ? styles.checkItemMet : styles.checkItemMissing}`}>
                <span>{offerSentenceUsed ? '✓' : '○'}</span>
                Phrase d'offre utilisée renseignée
              </div>
              <div className={`${styles.checkItem} ${initialReaction ? styles.checkItemMet : styles.checkItemMissing}`}>
                <span>{initialReaction ? '✓' : '○'}</span>
                Réaction initiale documentée
              </div>
              <div className={`${styles.checkItem} ${outcomeType ? styles.checkItemMet : styles.checkItemMissing}`}>
                <span>{outcomeType ? '✓' : '○'}</span>
                Outcome sélectionné
              </div>
              <div className={`${styles.checkItem} ${whatILearned ? styles.checkItemMet : styles.checkItemMissing}`}>
                <span>{whatILearned ? '✓' : '○'}</span>
                Ce que tu as appris renseigné
              </div>
              <div className={`${styles.checkItem} ${nextToVerify ? styles.checkItemMet : styles.checkItemMissing}`}>
                <span>{nextToVerify ? '✓' : '○'}</span>
                Prochaine vérification renseignée
              </div>
            </div>

            {submitError && (
              <div className={styles.submitError}>{submitError}</div>
            )}

            <button
              className={styles.submitBtn}
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? 'Soumission en cours…' : 'SOUMETTRE MON TEST TERRAIN →'}
            </button>

            <p className={styles.submitDisclaimer}>
              Un test terrain ne te donne pas une vérité. Il te donne une information de plus pour mieux décider.
            </p>

            <div className={styles.navRow}>
              <button className={styles.prevBtn} onClick={() => setStep(7)}>← Précédent</button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
