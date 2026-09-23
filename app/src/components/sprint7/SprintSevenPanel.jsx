/**
 * SprintSevenPanel — S7 : DIRE CE QUE TU VENDS
 * 8 steps: Offre Test V1 (read-only) | Phrase d'offre | Pitch 30-60s |
 *          Test sans notes | Contrôle de compréhension | Épistémique | Synthèse | Valider
 */
import { useState, useEffect, useCallback } from 'react';
import styles from './SprintSevenPanel.module.css';

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
export function SprintSevenPanel({ sprint, onMissionUpdate }) {
  const [step, setStep] = useState(0);

  const [s7, setS7] = useState(null);
  const [s6Ref, setS6Ref] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [submitError, setSubmitError] = useState(null);
  const [saveMsg, setSaveMsg] = useState('');

  // Step 1 — offer sentence
  const [offerWho, setOfferWho] = useState('');
  const [offerResult, setOfferResult] = useState('');
  const [offerProposition, setOfferProposition] = useState('');
  const [offerFormulation, setOfferFormulation] = useState('');

  // Step 2 — pitch
  const [pitchProblem, setPitchProblem] = useState('');
  const [pitchWhoYouAre, setPitchWhoYouAre] = useState('');
  const [pitchWhatPropose, setPitchWhatPropose] = useState('');
  const [pitchExpectedResult, setPitchExpectedResult] = useState('');
  const [pitchCallToAction, setPitchCallToAction] = useState('');
  const [pitchFullText, setPitchFullText] = useState('');

  // Step 3 — without notes
  const [practiced, setPracticed] = useState(false);
  const [practiceNote, setPracticeNote] = useState('');

  // Step 4 — understanding check
  const [naturalVersion, setNaturalVersion] = useState('');

  // Step 5 — epistemic
  const [facts, setFacts] = useState('');
  const [factsAck, setFactsAck] = useState(false);
  const [assumptions, setAssumptions] = useState('');
  const [assumptionsAck, setAssumptionsAck] = useState(false);
  const [toVerify, setToVerify] = useState('');
  const [toVerifyAck, setToVerifyAck] = useState(false);

  // Step 6 — synthesis
  const [synthesis, setSynthesis] = useState('');

  const submitted = s7?.status === 'submitted';

  /* ── Load ─────────────────────────────────────────────────────── */
  useEffect(() => {
    setLoading(true);
    fetch('/api/s7/presentation', { credentials: 'include' })
      .then(r => r.ok ? r.json() : r.json().then(b => Promise.reject(b.error ?? 'Erreur chargement S7')))
      .then(body => {
        setS6Ref(body.s6_ref ?? null);
        const data = body.s7 ?? body.prefill;
        if (data) {
          const os = data.offer_sentence ?? {};
          setOfferWho(os.who ?? '');
          setOfferResult(os.result ?? '');
          setOfferProposition(os.proposition ?? '');
          setOfferFormulation(os.formulation ?? '');
          const p = data.pitch ?? {};
          setPitchProblem(p.problem ?? '');
          setPitchWhoYouAre(p.who_you_are ?? '');
          setPitchWhatPropose(p.what_you_propose ?? '');
          setPitchExpectedResult(p.expected_result ?? '');
          setPitchCallToAction(p.call_to_action ?? '');
          setPitchFullText(p.full_text ?? '');
          const wn = data.without_notes ?? {};
          setPracticed(wn.practiced ?? false);
          setPracticeNote(wn.note ?? '');
          setNaturalVersion(data.understanding_check?.natural_version ?? '');
          const ep = data.epistemic ?? {};
          setFacts(ep.facts ?? '');
          setFactsAck(ep.facts_acknowledged ?? false);
          setAssumptions(ep.assumptions ?? '');
          setAssumptionsAck(ep.assumptions_acknowledged ?? false);
          setToVerify(ep.to_verify ?? '');
          setToVerifyAck(ep.to_verify_acknowledged ?? false);
          setSynthesis(data.synthesis ?? '');
          setS7(body.s7 ?? null);
        }
      })
      .catch(e => setError(typeof e === 'string' ? e : 'Erreur lors du chargement'))
      .finally(() => setLoading(false));
  }, []);

  /* ── Save draft ───────────────────────────────────────────────── */
  const saveDraft = useCallback(async (overrides = {}) => {
    if (submitted) return;
    setSaving(true);
    setSaveMsg('');
    try {
      const payload = {
        offer_sentence: {
          who: offerWho, result: offerResult,
          proposition: offerProposition, formulation: offerFormulation,
        },
        pitch: {
          problem: pitchProblem, who_you_are: pitchWhoYouAre,
          what_you_propose: pitchWhatPropose, expected_result: pitchExpectedResult,
          call_to_action: pitchCallToAction, full_text: pitchFullText,
        },
        without_notes: { practiced, note: practiceNote },
        understanding_check: { natural_version: naturalVersion },
        epistemic: {
          facts, facts_acknowledged: factsAck,
          assumptions, assumptions_acknowledged: assumptionsAck,
          to_verify: toVerify, to_verify_acknowledged: toVerifyAck,
        },
        synthesis,
        ...overrides,
      };
      const r = await fetch('/api/s7/presentation', {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        setSaveMsg(b.error ?? 'Erreur lors de la sauvegarde');
      } else {
        setSaveMsg('Sauvegardé');
        setTimeout(() => setSaveMsg(''), 2000);
      }
    } catch {
      setSaveMsg('Erreur réseau');
    } finally {
      setSaving(false);
    }
  }, [submitted, offerWho, offerResult, offerProposition, offerFormulation,
      pitchProblem, pitchWhoYouAre, pitchWhatPropose, pitchExpectedResult, pitchCallToAction, pitchFullText,
      practiced, practiceNote, naturalVersion,
      facts, factsAck, assumptions, assumptionsAck, toVerify, toVerifyAck, synthesis]);

  /* ── Submit ───────────────────────────────────────────────────── */
  async function handleSubmit() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await saveDraft();
      const r = await fetch('/api/s7/presentation/submit', {
        method: 'POST', credentials: 'include',
      });
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        setSubmitError(b.error ?? 'Erreur lors de la soumission');
      } else {
        setS7(prev => ({ ...prev, status: 'submitted' }));
        if (onMissionUpdate) onMissionUpdate();
      }
    } catch {
      setSubmitError('Erreur réseau');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <p className={styles.loading}>Chargement…</p>;
  if (error) return <p className={styles.errorMsg}>{error}</p>;

  const steps = [
    'MON OFFRE TEST V1',
    'MA PHRASE D\'OFFRE',
    'MON PITCH 30–60 SECONDES',
    'TEST SANS NOTES',
    'CONTRÔLE DE COMPRÉHENSION',
    'JE SAIS / JE SUPPOSE / JE DOIS VÉRIFIER',
    'SYNTHÈSE',
    'VALIDER MA PRÉSENTATION TERRAIN',
  ];

  return (
    <div className={styles.panel}>
      <div className={styles.principleBox}>
        <p className={styles.principleText}>
          "Tu n'as pas besoin d'un pitch parfait. Tu as besoin d'un langage simple, direct, suffisamment clair pour qu'une vraie personne comprenne ce que tu proposes — et puisse te répondre."
        </p>
      </div>

      {/* Step navigation */}
      <div className={styles.stepNav}>
        {steps.map((label, i) => (
          <button
            key={i}
            className={`${styles.stepBtn} ${step === i ? styles.stepActive : ''}`}
            onClick={() => setStep(i)}
          >
            <span className={styles.stepNum}>{i + 1}</span>
            <span className={styles.stepLabel}>{label}</span>
          </button>
        ))}
      </div>

      <div className={styles.stepContent}>

        {/* Step 0 — S6 read-only */}
        {step === 0 && (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Mon Offre Test V1 (Sprint 6)</h3>
            <p className={styles.sectionHint}>Ce que tu as défini en Sprint 6. Ces informations sont en lecture seule.</p>
            {s6Ref ? (
              <div className={styles.s6ReadOnly}>
                {s6Ref.audience && (
                  <div className={styles.readOnlyRow}>
                    <span className={styles.readOnlyLabel}>Pour qui :</span>
                    <span className={styles.readOnlyValue}>{s6Ref.audience}</span>
                  </div>
                )}
                {s6Ref.problem && (
                  <div className={styles.readOnlyRow}>
                    <span className={styles.readOnlyLabel}>Problème :</span>
                    <span className={styles.readOnlyValue}>{s6Ref.problem}</span>
                  </div>
                )}
                {s6Ref.desired_result && (
                  <div className={styles.readOnlyRow}>
                    <span className={styles.readOnlyLabel}>Résultat souhaité :</span>
                    <span className={styles.readOnlyValue}>{s6Ref.desired_result}</span>
                  </div>
                )}
                {s6Ref.proposition && (
                  <div className={styles.readOnlyRow}>
                    <span className={styles.readOnlyLabel}>Proposition :</span>
                    <span className={styles.readOnlyValue}>{s6Ref.proposition}</span>
                  </div>
                )}
                {s6Ref.pricing_amount !== null && s6Ref.pricing_amount !== undefined && (
                  <div className={styles.readOnlyRow}>
                    <span className={styles.readOnlyLabel}>Prix hypothèse :</span>
                    <span className={styles.readOnlyValue}>{s6Ref.pricing_amount} {s6Ref.pricing_model ? `— ${s6Ref.pricing_model}` : ''}</span>
                  </div>
                )}
              </div>
            ) : (
              <p className={styles.noData}>Aucune donnée S6 disponible.</p>
            )}
            <button className={styles.nextBtn} onClick={() => setStep(1)}>Continuer →</button>
          </section>
        )}

        {/* Step 1 — Offer sentence */}
        {step === 1 && (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Ma Phrase d'Offre</h3>
            <p className={styles.sectionHint}>
              "J'aide [QUI] à [RÉSULTAT] grâce à [PROPOSITION]."<br/>
              Compréhensible par quelqu'un qui ne connaît pas le jargon. Ne promets pas un résultat garanti.
            </p>
            <label className={styles.fieldLabel}>Pour qui (QUI)</label>
            <textarea className={styles.textarea} rows={2} disabled={submitted}
              value={offerWho} onChange={e => setOfferWho(e.target.value)}
              placeholder="ex : les managers de 40+ en transition professionnelle" />

            <label className={styles.fieldLabel}>Résultat (RÉSULTAT)</label>
            <textarea className={styles.textarea} rows={2} disabled={submitted}
              value={offerResult} onChange={e => setOfferResult(e.target.value)}
              placeholder="ex : à retrouver de l'élan professionnel" />

            <label className={styles.fieldLabel}>Proposition (PROPOSITION)</label>
            <textarea className={styles.textarea} rows={2} disabled={submitted}
              value={offerProposition} onChange={e => setOfferProposition(e.target.value)}
              placeholder="ex : grâce à un accompagnement en 5 séances" />

            <label className={styles.fieldLabel}>Ta phrase complète *</label>
            <p className={styles.fieldHint}>Écris ta phrase d'offre complète telle que tu la dirais.</p>
            <textarea className={styles.textarea} rows={3} disabled={submitted}
              value={offerFormulation} onChange={e => setOfferFormulation(e.target.value)}
              placeholder={"ex : \"J'aide les managers de 40+ à retrouver de l'élan professionnel grâce à un accompagnement en 5 séances.\""} />

            {!submitted && (
              <button className={styles.saveBtn} onClick={() => saveDraft()} disabled={saving}>
                {saving ? 'Sauvegarde…' : 'Sauvegarder'}
              </button>
            )}
            {saveMsg && <p className={styles.saveMsg}>{saveMsg}</p>}
            <button className={styles.nextBtn} onClick={() => setStep(2)}>Continuer →</button>
          </section>
        )}

        {/* Step 2 — Pitch */}
        {step === 2 && (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Mon Pitch 30–60 Secondes</h3>
            <p className={styles.sectionHint}>
              Structure minimale : Problème → Qui tu es → Ce que tu proposes → Résultat concret → Appel à action.<br/>
              Doit pouvoir être dit à voix haute en 30–60 secondes. Aucune promesse garantie.
            </p>
            <label className={styles.fieldLabel}>Le problème (une phrase) *</label>
            <textarea className={styles.textarea} rows={2} disabled={submitted}
              value={pitchProblem} onChange={e => setPitchProblem(e.target.value)}
              placeholder="ex : Beaucoup de managers en transition ne savent pas comment redonner du sens à leur travail." />

            <label className={styles.fieldLabel}>Qui tu es (une phrase)</label>
            <textarea className={styles.textarea} rows={2} disabled={submitted}
              value={pitchWhoYouAre} onChange={e => setPitchWhoYouAre(e.target.value)}
              placeholder="ex : Je suis coach spécialisée dans les transitions professionnelles." />

            <label className={styles.fieldLabel}>Ce que tu proposes *</label>
            <textarea className={styles.textarea} rows={3} disabled={submitted}
              value={pitchWhatPropose} onChange={e => setPitchWhatPropose(e.target.value)}
              placeholder="ex : Je propose un accompagnement en 5 séances pour identifier ce qui bloque et définir une prochaine étape concrète." />

            <label className={styles.fieldLabel}>Résultat concret attendu *</label>
            <textarea className={styles.textarea} rows={2} disabled={submitted}
              value={pitchExpectedResult} onChange={e => setPitchExpectedResult(e.target.value)}
              placeholder="ex : À l'issue de ces 5 séances, tu as une piste prioritaire et un plan d'action pour les 30 jours suivants." />

            <label className={styles.fieldLabel}>Appel à action *</label>
            <textarea className={styles.textarea} rows={2} disabled={submitted}
              value={pitchCallToAction} onChange={e => setPitchCallToAction(e.target.value)}
              placeholder="ex : Si ça te parle, je suis disponible pour un appel de 20 minutes pour voir si c'est fait pour toi." />

            <label className={styles.fieldLabel}>Ton pitch complet (optionnel)</label>
            <p className={styles.fieldHint}>Rassemble tout en un texte fluide pour t'entraîner.</p>
            <textarea className={styles.textarea} rows={6} disabled={submitted}
              value={pitchFullText} onChange={e => setPitchFullText(e.target.value)}
              placeholder="Écris ton pitch complet ici…" />

            {!submitted && (
              <button className={styles.saveBtn} onClick={() => saveDraft()} disabled={saving}>
                {saving ? 'Sauvegarde…' : 'Sauvegarder'}
              </button>
            )}
            {saveMsg && <p className={styles.saveMsg}>{saveMsg}</p>}
            <button className={styles.nextBtn} onClick={() => setStep(3)}>Continuer →</button>
          </section>
        )}

        {/* Step 3 — Without notes */}
        {step === 3 && (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Test Sans Notes</h3>
            <p className={styles.sectionHint}>
              Entraîne-toi à dire ton pitch sans relire tes notes. Ce n'est pas une évaluation — c'est un exercice de préparation.
            </p>
            <div className={styles.checkboxRow}>
              <label className={`${styles.checkboxLabel} ${submitted ? styles.disabled : ''}`}>
                <input
                  type="checkbox"
                  checked={practiced}
                  onChange={e => {
                    if (!submitted) setPracticed(e.target.checked);
                  }}
                  disabled={submitted}
                />
                <span>J'ai pratiqué mon pitch sans relire mes notes</span>
              </label>
            </div>
            <label className={styles.fieldLabel}>Note (optionnel)</label>
            <textarea className={styles.textarea} rows={3} disabled={submitted}
              value={practiceNote} onChange={e => setPracticeNote(e.target.value)}
              placeholder="Comment ça s'est passé ? Qu'est-ce que tu as remarqué ?" />

            {!submitted && (
              <button className={styles.saveBtn} onClick={() => saveDraft()} disabled={saving}>
                {saving ? 'Sauvegarde…' : 'Sauvegarder'}
              </button>
            )}
            {saveMsg && <p className={styles.saveMsg}>{saveMsg}</p>}
            <button className={styles.nextBtn} onClick={() => setStep(4)}>Continuer →</button>
          </section>
        )}

        {/* Step 4 — Understanding check */}
        {step === 4 && (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Contrôle de Compréhension</h3>
            <p className={styles.sectionHint}>
              Si une inconnue t'arrêtait et te demandait ce que tu fais, que lui dirais-tu ?<br/>
              Ce n'est pas ton pitch — c'est une version naturelle de la même chose.
            </p>
            <label className={styles.fieldLabel}>Ta réponse naturelle *</label>
            <textarea className={styles.textarea} rows={5} disabled={submitted}
              value={naturalVersion} onChange={e => setNaturalVersion(e.target.value)}
              placeholder="Ce que tu dirais spontanément à quelqu'un qui ne te connaît pas…" />

            {!submitted && (
              <button className={styles.saveBtn} onClick={() => saveDraft()} disabled={saving}>
                {saving ? 'Sauvegarde…' : 'Sauvegarder'}
              </button>
            )}
            {saveMsg && <p className={styles.saveMsg}>{saveMsg}</p>}
            <button className={styles.nextBtn} onClick={() => setStep(5)}>Continuer →</button>
          </section>
        )}

        {/* Step 5 — Epistemic */}
        {step === 5 && (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Je Sais / Je Suppose / Je Dois Vérifier</h3>
            <p className={styles.sectionHint}>Distingue ce qui est vérifié, ce qui est supposé, et ce qui reste à tester sur le terrain.</p>

            <AcknowledgeField
              label="Ce que je sais (faits vérifiés)"
              hint="Informations que tu as vérifiées directement."
              value={facts} acknowledged={factsAck} disabled={submitted}
              onValue={setFacts}
              onAck={() => setFactsAck(true)}
              onUnack={() => setFactsAck(false)}
              placeholder="ex : J'ai eu 3 conversations avec des personnes qui ont mentionné ce problème."
            />
            <AcknowledgeField
              label="Ce que je suppose (hypothèses)"
              hint="Hypothèses non encore vérifiées par le terrain."
              value={assumptions} acknowledged={assumptionsAck} disabled={submitted}
              onValue={setAssumptions}
              onAck={() => setAssumptionsAck(true)}
              onUnack={() => setAssumptionsAck(false)}
              placeholder="ex : Je suppose que ce problème est fréquent dans ce groupe."
            />
            <AcknowledgeField
              label="Ce que je dois vérifier"
              hint="Questions à poser au terrain pour valider ou infirmer tes hypothèses."
              value={toVerify} acknowledged={toVerifyAck} disabled={submitted}
              onValue={setToVerify}
              onAck={() => setToVerifyAck(true)}
              onUnack={() => setToVerifyAck(false)}
              placeholder="ex : Est-ce que ma phrase d'offre est compréhensible pour quelqu'un qui ne me connaît pas ?"
            />

            {!submitted && (
              <button className={styles.saveBtn} onClick={() => saveDraft()} disabled={saving}>
                {saving ? 'Sauvegarde…' : 'Sauvegarder'}
              </button>
            )}
            {saveMsg && <p className={styles.saveMsg}>{saveMsg}</p>}
            <button className={styles.nextBtn} onClick={() => setStep(6)}>Continuer →</button>
          </section>
        )}

        {/* Step 6 — Synthesis */}
        {step === 6 && (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Synthèse</h3>
            <p className={styles.sectionHint}>En quelques lignes, résume ce que tu retiens de cet exercice.</p>
            <textarea className={styles.textarea} rows={6} disabled={submitted}
              value={synthesis} onChange={e => setSynthesis(e.target.value)}
              placeholder="Ce que tu retiens, ce que tu veux tester en priorité, ce qui reste ouvert…" />

            {!submitted && (
              <button className={styles.saveBtn} onClick={() => saveDraft()} disabled={saving}>
                {saving ? 'Sauvegarde…' : 'Sauvegarder'}
              </button>
            )}
            {saveMsg && <p className={styles.saveMsg}>{saveMsg}</p>}
            <button className={styles.nextBtn} onClick={() => setStep(7)}>Continuer →</button>
          </section>
        )}

        {/* Step 7 — CTA Submit */}
        {step === 7 && (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Valider Ma Présentation Terrain</h3>

            {submitted ? (
              <div className={styles.submittedBox}>
                <p className={styles.submittedTitle}>Ta Présentation Terrain existe maintenant.</p>
                <p className={styles.submittedText}>
                  La prochaine étape sera de la confronter à de vraies personnes.
                  Ce que tu as préparé ici n'est pas un pitch parfait — c'est un point de départ pour obtenir des réponses du terrain.
                </p>
              </div>
            ) : (
              <>
                <p className={styles.sectionHint}>
                  Avant de valider, vérifie que tu as rempli tous les éléments. Une fois soumise, cette présentation ne pourra plus être modifiée.
                </p>
                <div className={styles.ctaWarning}>
                  Ce n'est pas une validation commerciale. C'est la fin de la phase DÉFINIR — tu passes maintenant à la confrontation terrain.
                </div>
                <button
                  className={styles.submitBtn}
                  onClick={handleSubmit}
                  disabled={submitting}
                >
                  {submitting ? 'Soumission…' : 'Valider ma Présentation Terrain →'}
                </button>
                {submitError && <p className={styles.errorMsg}>{submitError}</p>}
              </>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
