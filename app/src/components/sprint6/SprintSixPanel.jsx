/**
 * SprintSixPanel — S6 : TON OFFRE MINIMUM TESTABLE
 * 12 steps: Sources | Pour qui | Problème | Résultat | Proposition |
 *           Inclus | Comment | Prix | Test Client Demain | Épistémique | Synthèse | Valider
 */
import { useState, useEffect, useCallback } from 'react';
import styles from './SprintSixPanel.module.css';

const CLIENT_TOMORROW_OPTIONS = [
  { value: 'yes', label: 'Oui — je pourrais contacter quelqu\'un demain' },
  { value: 'not_yet', label: 'Pas encore — il manque quelque chose' },
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
            onBlur={onAck ? undefined : undefined}
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
export function SprintSixPanel({ sprint, onMissionUpdate }) {
  const [step, setStep] = useState(0);

  const [s6, setS6] = useState(null);
  const [directionRef, setDirectionRef] = useState(null);
  const [s5Ref, setS5Ref] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [submitError, setSubmitError] = useState(null);
  const [saveMsg, setSaveMsg] = useState('');

  // Step 1 — audience
  const [audience, setAudience] = useState('');

  // Step 2 — problem
  const [problem, setProblem] = useState('');

  // Step 3 — desired result
  const [desiredResult, setDesiredResult] = useState('');

  // Step 4 — proposition
  const [propType, setPropType] = useState('');
  const [propDescription, setPropDescription] = useState('');

  // Step 5 — included
  const [included, setIncluded] = useState(['']);

  // Step 6 — delivery
  const [deliveryDuration, setDeliveryDuration] = useState('');
  const [deliveryModality, setDeliveryModality] = useState('');
  const [deliverySteps, setDeliverySteps] = useState('');

  // Step 7 — pricing
  const [pricingAmount, setPricingAmount] = useState('');
  const [pricingCurrency, setPricingCurrency] = useState('EUR');
  const [pricingModel, setPricingModel] = useState('');
  const [pricingRationale, setPricingRationale] = useState('');

  // Step 8 — client tomorrow
  const [clientAnswer, setClientAnswer] = useState(null);
  const [clientMissing, setClientMissing] = useState([]);
  const [clientNote, setClientNote] = useState('');

  // Step 9 — epistemic
  const [epFacts, setEpFacts] = useState('');
  const [epFactsAck, setEpFactsAck] = useState(false);
  const [epAssumptions, setEpAssumptions] = useState('');
  const [epAssumptionsAck, setEpAssumptionsAck] = useState(false);
  const [epToVerify, setEpToVerify] = useState('');
  const [epToVerifyAck, setEpToVerifyAck] = useState(false);

  // Step 10 — synthesis
  const [synthesis, setSynthesis] = useState('');

  const submitted = s6?.status === 'submitted';

  const loadState = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/s6/test-offer', { credentials: 'include' });
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        setError(b.error ?? 'Erreur de chargement');
        return;
      }
      const body = await r.json();
      setDirectionRef(body.direction_ref);
      setS5Ref(body.s5_ref ?? null);
      const d = body.s6 ?? body.prefill;
      if (d) {
        setS6(d);
        setAudience(d.audience?.formulation ?? '');
        setProblem(d.problem?.formulation ?? '');
        setDesiredResult(d.desired_result?.formulation ?? '');
        setPropType(d.proposition?.type ?? '');
        setPropDescription(d.proposition?.description ?? '');
        setIncluded(d.included?.length > 0 ? d.included : ['']);
        setDeliveryDuration(d.delivery?.duration ?? '');
        setDeliveryModality(d.delivery?.modality ?? '');
        setDeliverySteps(d.delivery?.steps ?? '');
        setPricingAmount(d.pricing?.amount !== null && d.pricing?.amount !== undefined ? String(d.pricing.amount) : '');
        setPricingCurrency(d.pricing?.currency ?? 'EUR');
        setPricingModel(d.pricing?.model ?? '');
        setPricingRationale(d.pricing?.rationale ?? '');
        setClientAnswer(d.client_tomorrow_test?.answer ?? null);
        setClientMissing(d.client_tomorrow_test?.missing ?? []);
        setClientNote(d.client_tomorrow_test?.note ?? '');
        setEpFacts(d.epistemic?.facts ?? '');
        setEpFactsAck(d.epistemic?.facts_acknowledged ?? false);
        setEpAssumptions(d.epistemic?.assumptions ?? '');
        setEpAssumptionsAck(d.epistemic?.assumptions_acknowledged ?? false);
        setEpToVerify(d.epistemic?.to_verify ?? '');
        setEpToVerifyAck(d.epistemic?.to_verify_acknowledged ?? false);
        setSynthesis(d.synthesis ?? '');
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadState(); }, [loadState]);

  function buildPayload() {
    return {
      audience: { formulation: audience },
      problem: { formulation: problem },
      desired_result: { formulation: desiredResult },
      proposition: { type: propType, description: propDescription },
      included: included.filter(i => i?.trim()),
      delivery: { duration: deliveryDuration, modality: deliveryModality, steps: deliverySteps },
      pricing: {
        amount: pricingAmount !== '' ? pricingAmount : null,
        currency: pricingCurrency,
        model: pricingModel,
        rationale: pricingRationale,
        status: 'hypothesis',
      },
      client_tomorrow_test: {
        answer: clientAnswer,
        missing: clientMissing,
        note: clientNote,
      },
      epistemic: {
        facts: epFacts,
        facts_acknowledged: epFactsAck,
        assumptions: epAssumptions,
        assumptions_acknowledged: epAssumptionsAck,
        to_verify: epToVerify,
        to_verify_acknowledged: epToVerifyAck,
      },
      synthesis,
    };
  }

  async function saveDraft() {
    if (submitted) return;
    setSaving(true);
    setError(null);
    try {
      const r = await fetch('/api/s6/test-offer', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload()),
      });
      const body = await r.json();
      if (!r.ok) { setError(body.error ?? 'Erreur lors de la sauvegarde'); return; }
      setS6(body.s6);
      setSaveMsg('Sauvegardé');
      setTimeout(() => setSaveMsg(''), 2000);
    } catch {
      setError('Erreur réseau');
    } finally {
      setSaving(false);
    }
  }

  async function submitForm() {
    setSubmitError(null);
    setSubmitting(true);
    try {
      await saveDraft();
      const r = await fetch('/api/s6/test-offer/submit', {
        method: 'POST',
        credentials: 'include',
      });
      const body = await r.json();
      if (!r.ok) { setSubmitError(body.error ?? 'Erreur lors de la soumission'); return; }
      await loadState();
      if (onMissionUpdate) onMissionUpdate();
    } catch {
      setSubmitError('Erreur réseau');
    } finally {
      setSubmitting(false);
    }
  }

  // Completeness checks (mirror backend)
  const step1Complete = audience.trim().length > 0;
  const step2Complete = problem.trim().length > 0;
  const step3Complete = desiredResult.trim().length > 0;
  const step4Complete = propDescription.trim().length > 0;
  const step5Complete = included.filter(i => i?.trim()).length > 0;
  const step6Complete = deliveryDuration.trim() || deliveryModality.trim() || deliverySteps.trim();
  const step7Complete = pricingAmount !== '' && pricingAmount !== null;
  const step8Complete = clientAnswer === 'yes' ||
    (clientAnswer === 'not_yet' && (clientMissing.length > 0 || clientNote.trim()));
  const step9Complete = (epFacts.trim() || epFactsAck) && (epAssumptions.trim() || epAssumptionsAck) && (epToVerify.trim() || epToVerifyAck);
  const canSubmit = step1Complete && step2Complete && step3Complete && step4Complete &&
    step5Complete && step6Complete && step7Complete && step8Complete && step9Complete;

  if (loading) return <div className={styles.loading}>Chargement…</div>;

  if (submitted) {
    return (
      <div className={styles.submittedState}>
        <div className={styles.submittedHeader}>
          <span className={styles.submittedIcon}>✓</span>
          <h3 className={styles.submittedTitle}>OFFRE MINIMUM TESTABLE SOUMISE</h3>
        </div>
        <div className={styles.submittedCard}>
          <div className={styles.submittedField}>
            <span className={styles.submittedFieldLabel}>POUR QUI</span>
            <span className={styles.submittedFieldValue}>{audience || '—'}</span>
          </div>
          <div className={styles.submittedField}>
            <span className={styles.submittedFieldLabel}>CE QUE JE PROPOSE</span>
            <span className={styles.submittedFieldValue}>{propDescription || '—'}</span>
          </div>
          <div className={styles.submittedField}>
            <span className={styles.submittedFieldLabel}>PRIX TESTÉ</span>
            <span className={styles.submittedFieldValue}>
              {pricingAmount ? `${pricingAmount} ${pricingCurrency}` : '—'}
              <span className={styles.hypothesisBadge} style={{ marginLeft: '0.5rem' }}>Hypothèse</span>
            </span>
          </div>
        </div>
        <div className={styles.submittedFooter}>
          <span className={styles.submittedBadge}>Offre Test V1 — Sprint 6</span>
        </div>
      </div>
    );
  }

  const STEPS = [
    '0 · Sources',
    '1 · Pour qui ?',
    '2 · Quel problème ?',
    '3 · Quel résultat ?',
    '4 · Que proposes-tu ?',
    '5 · Inclus',
    '6 · Comment ça se passe ?',
    '7 · Prix à tester',
    '8 · Test Client Demain',
    '9 · Épistémique',
    '10 · Synthèse',
    '11 · Valider',
  ];

  const stepDoneMap = {
    1: step1Complete, 2: step2Complete, 3: step3Complete,
    4: step4Complete, 5: step5Complete, 6: step6Complete,
    7: step7Complete, 8: step8Complete, 9: step9Complete,
  };

  return (
    <div className={styles.panel}>
      <div className={styles.stepNav}>
        {STEPS.map((label, i) => (
          <button
            key={i}
            className={`${styles.stepBtn} ${step === i ? styles.stepActive : ''} ${stepDoneMap[i] ? styles.stepDone : ''}`}
            onClick={() => setStep(i)}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>

      {error && <p className={styles.errorMsg}>{error}</p>}

      {/* Step 0: Sources (read-only) */}
      {step === 0 && (
        <div className={styles.stepBody}>
          <div className={styles.sectionHeader}>
            <h3 className={styles.sectionTitle}>CE QUE TU AS DÉJÀ DÉCIDÉ</h3>
            <p className={styles.sectionIntro}>
              Ta Direction S4 et ta Cible Test S5 sont les bases de ton Offre Test. Tu ne les modifies pas ici.
            </p>
          </div>
          {directionRef && (
            <div className={styles.sourceBanner}>
              <span className={styles.sourceBannerLabel}>Direction active (S4)</span>
              <span className={styles.sourceBannerValue}>{directionRef.formulation || '(non disponible)'}</span>
              <div className={styles.sourceMeta}>
                {directionRef.person && <span className={styles.sourceMetaItem}><strong>Pour qui :</strong> {directionRef.person}</span>}
                {directionRef.problem && <span className={styles.sourceMetaItem}><strong>Problème exploré :</strong> {directionRef.problem}</span>}
              </div>
            </div>
          )}
          {s5Ref && (
            <div className={styles.sourceBanner}>
              <span className={styles.sourceBannerLabel}>Cible Test & Problème (S5)</span>
              {s5Ref.target_who && <span className={styles.sourceBannerValue}><strong>Cible :</strong> {s5Ref.target_who}</span>}
              <div className={styles.sourceMeta}>
                {s5Ref.problem_situation && <span className={styles.sourceMetaItem}><strong>Problème :</strong> {s5Ref.problem_situation}</span>}
              </div>
            </div>
          )}
          <div className={styles.stepNavBtns}>
            <span />
            <button className={styles.nextBtn} type="button" onClick={() => setStep(1)}>Suivant →</button>
          </div>
        </div>
      )}

      {/* Step 1: Pour qui */}
      {step === 1 && (
        <div className={styles.stepBody}>
          <div className={styles.sectionHeader}>
            <h3 className={styles.sectionTitle}>POUR QUI EST TON OFFRE TEST ?</h3>
            <p className={styles.sectionIntro}>Décris précisément la personne pour qui tu construis cette offre.</p>
          </div>
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Ta cible test</label>
            <textarea
              className={styles.textarea}
              rows={3}
              placeholder="Ex : Femmes salariées 35-50 ans en reconversion, qui ont un projet en tête mais ne savent pas par où commencer…"
              value={audience}
              onChange={e => setAudience(e.target.value)}
              onBlur={saveDraft}
              disabled={submitted}
            />
          </div>
          <div className={styles.saveIndicator}>{saving ? 'Sauvegarde…' : saveMsg}</div>
          <div className={styles.stepNavBtns}>
            <button className={styles.prevBtn} type="button" onClick={() => setStep(0)}>← Précédent</button>
            <button className={styles.nextBtn} type="button" onClick={() => setStep(2)}>Suivant →</button>
          </div>
        </div>
      )}

      {/* Step 2: Problème */}
      {step === 2 && (
        <div className={styles.stepBody}>
          <div className={styles.sectionHeader}>
            <h3 className={styles.sectionTitle}>QUEL PROBLÈME TON OFFRE TEST ADRESSE-T-ELLE ?</h3>
            <p className={styles.sectionIntro}>Formule le problème central que tu veux résoudre pour cette personne.</p>
          </div>
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Le problème</label>
            <textarea
              className={styles.textarea}
              rows={3}
              placeholder="Ex : Elles ne savent pas par où commencer pour structurer leur projet en parallèle de leur emploi…"
              value={problem}
              onChange={e => setProblem(e.target.value)}
              onBlur={saveDraft}
              disabled={submitted}
            />
          </div>
          <div className={styles.saveIndicator}>{saving ? 'Sauvegarde…' : saveMsg}</div>
          <div className={styles.stepNavBtns}>
            <button className={styles.prevBtn} type="button" onClick={() => setStep(1)}>← Précédent</button>
            <button className={styles.nextBtn} type="button" onClick={() => setStep(3)}>Suivant →</button>
          </div>
        </div>
      )}

      {/* Step 3: Résultat */}
      {step === 3 && (
        <div className={styles.stepBody}>
          <div className={styles.sectionHeader}>
            <h3 className={styles.sectionTitle}>QUEL RÉSULTAT TON OFFRE TEST PROMET-ELLE ?</h3>
            <p className={styles.sectionIntro}>Qu'est-ce que ta cliente obtiendra concrètement à l'issue de cette offre ?</p>
          </div>
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Résultat souhaité pour ta cliente</label>
            <textarea
              className={styles.textarea}
              rows={3}
              placeholder="Ex : Elle aura identifié sa piste prioritaire et ses 3 premières actions concrètes…"
              value={desiredResult}
              onChange={e => setDesiredResult(e.target.value)}
              onBlur={saveDraft}
              disabled={submitted}
            />
          </div>
          <div className={styles.saveIndicator}>{saving ? 'Sauvegarde…' : saveMsg}</div>
          <div className={styles.stepNavBtns}>
            <button className={styles.prevBtn} type="button" onClick={() => setStep(2)}>← Précédent</button>
            <button className={styles.nextBtn} type="button" onClick={() => setStep(4)}>Suivant →</button>
          </div>
        </div>
      )}

      {/* Step 4: Proposition */}
      {step === 4 && (
        <div className={styles.stepBody}>
          <div className={styles.sectionHeader}>
            <h3 className={styles.sectionTitle}>QU'EST-CE QUE TU PROPOSES CONCRÈTEMENT ?</h3>
            <p className={styles.sectionIntro}>Décris le format de ton offre (session, programme, atelier, coaching, etc.) et ce qu'elle apporte.</p>
          </div>
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Type d'offre (optionnel)</label>
            <input
              className={styles.input}
              type="text"
              placeholder="Ex : Accompagnement individuel, atelier de groupe, formation…"
              value={propType}
              onChange={e => setPropType(e.target.value)}
              onBlur={saveDraft}
              disabled={submitted}
            />
          </div>
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Description de ta proposition</label>
            <textarea
              className={styles.textarea}
              rows={4}
              placeholder="Ex : 3 séances individuelles de 90 min pour explorer, prioriser et lancer le premier test de ton projet…"
              value={propDescription}
              onChange={e => setPropDescription(e.target.value)}
              onBlur={saveDraft}
              disabled={submitted}
            />
          </div>
          <div className={styles.saveIndicator}>{saving ? 'Sauvegarde…' : saveMsg}</div>
          <div className={styles.stepNavBtns}>
            <button className={styles.prevBtn} type="button" onClick={() => setStep(3)}>← Précédent</button>
            <button className={styles.nextBtn} type="button" onClick={() => setStep(5)}>Suivant →</button>
          </div>
        </div>
      )}

      {/* Step 5: Inclus */}
      {step === 5 && (
        <div className={styles.stepBody}>
          <div className={styles.sectionHeader}>
            <h3 className={styles.sectionTitle}>QU'EST-CE QUI EST INCLUS DANS TON OFFRE TEST ?</h3>
            <p className={styles.sectionIntro}>Liste les éléments concrets inclus (séances, outils, supports, accès…).</p>
          </div>
          <div className={styles.includedList}>
            {included.map((item, i) => (
              <div key={i} className={styles.includedRow}>
                <input
                  className={styles.includedInput}
                  type="text"
                  placeholder={`Élément ${i + 1}…`}
                  value={item}
                  onChange={e => {
                    const copy = [...included];
                    copy[i] = e.target.value;
                    setIncluded(copy);
                  }}
                  onBlur={saveDraft}
                  disabled={submitted}
                />
                {!submitted && included.length > 1 && (
                  <button
                    className={styles.removeBtn}
                    type="button"
                    onClick={() => setIncluded(included.filter((_, j) => j !== i))}
                    aria-label="Retirer"
                  >×</button>
                )}
              </div>
            ))}
          </div>
          {!submitted && (
            <button
              className={styles.addBtn}
              type="button"
              onClick={() => setIncluded([...included, ''])}
            >+ Ajouter un élément</button>
          )}
          <div className={styles.saveIndicator}>{saving ? 'Sauvegarde…' : saveMsg}</div>
          <div className={styles.stepNavBtns}>
            <button className={styles.prevBtn} type="button" onClick={() => setStep(4)}>← Précédent</button>
            <button className={styles.nextBtn} type="button" onClick={() => setStep(6)}>Suivant →</button>
          </div>
        </div>
      )}

      {/* Step 6: Livraison */}
      {step === 6 && (
        <div className={styles.stepBody}>
          <div className={styles.sectionHeader}>
            <h3 className={styles.sectionTitle}>COMMENT ÇA SE PASSE ?</h3>
            <p className={styles.sectionIntro}>Décris le déroulé concret de ton Offre Test (durée, modalité, étapes).</p>
          </div>
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Durée</label>
            <input
              className={styles.input}
              type="text"
              placeholder="Ex : 3 semaines, 4 sessions de 90 min…"
              value={deliveryDuration}
              onChange={e => setDeliveryDuration(e.target.value)}
              onBlur={saveDraft}
              disabled={submitted}
            />
          </div>
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Modalité</label>
            <input
              className={styles.input}
              type="text"
              placeholder="Ex : Visio Zoom, présentiel, asynchrone…"
              value={deliveryModality}
              onChange={e => setDeliveryModality(e.target.value)}
              onBlur={saveDraft}
              disabled={submitted}
            />
          </div>
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Étapes (optionnel)</label>
            <textarea
              className={styles.textarea}
              rows={3}
              placeholder="Décris les grandes étapes si utile…"
              value={deliverySteps}
              onChange={e => setDeliverySteps(e.target.value)}
              onBlur={saveDraft}
              disabled={submitted}
            />
          </div>
          <div className={styles.saveIndicator}>{saving ? 'Sauvegarde…' : saveMsg}</div>
          <div className={styles.stepNavBtns}>
            <button className={styles.prevBtn} type="button" onClick={() => setStep(5)}>← Précédent</button>
            <button className={styles.nextBtn} type="button" onClick={() => setStep(7)}>Suivant →</button>
          </div>
        </div>
      )}

      {/* Step 7: Prix */}
      {step === 7 && (
        <div className={styles.stepBody}>
          <div className={styles.sectionHeader}>
            <h3 className={styles.sectionTitle}>QUEL PRIX VAS-TU TESTER ?</h3>
            <p className={styles.sectionIntro}>
              Il n'existe pas de prix parfait à découvrir mentalement. Formule une hypothèse tarifaire à confronter au terrain.
            </p>
          </div>
          <div className={styles.pricingRow}>
            <div className={styles.pricingAmountGroup}>
              <label className={styles.fieldLabel}>Montant</label>
              <input
                className={styles.input}
                type="text"
                placeholder="Ex : 450"
                value={pricingAmount}
                onChange={e => setPricingAmount(e.target.value)}
                onBlur={saveDraft}
                disabled={submitted}
              />
            </div>
            <div className={styles.pricingCurrencyGroup}>
              <label className={styles.fieldLabel}>Devise</label>
              <input
                className={styles.input}
                type="text"
                placeholder="EUR"
                value={pricingCurrency}
                onChange={e => setPricingCurrency(e.target.value)}
                onBlur={saveDraft}
                disabled={submitted}
              />
            </div>
            <div className={styles.pricingModelGroup}>
              <label className={styles.fieldLabel}>Modèle tarifaire (optionnel)</label>
              <input
                className={styles.input}
                type="text"
                placeholder="Ex : forfait, à la séance, abonnement…"
                value={pricingModel}
                onChange={e => setPricingModel(e.target.value)}
                onBlur={saveDraft}
                disabled={submitted}
              />
            </div>
          </div>
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Raisonnement tarifaire (optionnel)</label>
            <textarea
              className={styles.textarea}
              rows={2}
              placeholder="Pourquoi ce prix ? Sur quoi est-il basé ?"
              value={pricingRationale}
              onChange={e => setPricingRationale(e.target.value)}
              onBlur={saveDraft}
              disabled={submitted}
            />
          </div>
          <div className={styles.hypothesisBadge}>Ce prix est une hypothèse commerciale à tester</div>
          <div className={styles.saveIndicator}>{saving ? 'Sauvegarde…' : saveMsg}</div>
          <div className={styles.stepNavBtns}>
            <button className={styles.prevBtn} type="button" onClick={() => setStep(6)}>← Précédent</button>
            <button className={styles.nextBtn} type="button" onClick={() => setStep(8)}>Suivant →</button>
          </div>
        </div>
      )}

      {/* Step 8: Test Client Demain */}
      {step === 8 && (
        <div className={styles.stepBody}>
          <div className={styles.sectionHeader}>
            <h3 className={styles.sectionTitle}>TEST CLIENT DEMAIN</h3>
            <p className={styles.sectionIntro}>
              Si tu devais contacter une vraie cliente avec cette offre demain — est-ce possible ?
            </p>
          </div>
          <div className={styles.radioGroup}>
            {CLIENT_TOMORROW_OPTIONS.map(opt => (
              <label key={opt.value} className={styles.radioLabel}>
                <input
                  type="radio"
                  name="clientTomorrow"
                  value={opt.value}
                  checked={clientAnswer === opt.value}
                  onChange={() => { setClientAnswer(opt.value); }}
                  onBlur={saveDraft}
                  disabled={submitted}
                />
                {opt.label}
              </label>
            ))}
          </div>
          {clientAnswer === 'not_yet' && (
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Ce qui manque encore</label>
              <p className={styles.fieldHint}>Identifie ce qui t'empêche de contacter une cliente demain.</p>
              <textarea
                className={styles.textarea}
                rows={3}
                placeholder="Ex : Je n'ai pas encore de document de présentation, je ne sais pas comment aborder le sujet…"
                value={clientNote}
                onChange={e => setClientNote(e.target.value)}
                onBlur={saveDraft}
                disabled={submitted}
              />
            </div>
          )}
          <div className={styles.saveIndicator}>{saving ? 'Sauvegarde…' : saveMsg}</div>
          <div className={styles.stepNavBtns}>
            <button className={styles.prevBtn} type="button" onClick={() => setStep(7)}>← Précédent</button>
            <button className={styles.nextBtn} type="button" onClick={() => setStep(9)}>Suivant →</button>
          </div>
        </div>
      )}

      {/* Step 9: Épistémique */}
      {step === 9 && (
        <div className={styles.stepBody}>
          <div className={styles.sectionHeader}>
            <h3 className={styles.sectionTitle}>JE SAIS / JE SUPPOSE / JE DOIS VÉRIFIER</h3>
            <p className={styles.sectionIntro}>
              Distingue ce que tu sais avec certitude, tes suppositions, et ce que tu dois encore vérifier sur le terrain.
            </p>
          </div>
          <AcknowledgeField
            label="Ce que je sais (faits vérifiés)"
            hint="Informations que tu as vérifiées sur ta cible ou ce problème."
            value={epFacts}
            acknowledged={epFactsAck}
            onValue={v => { setEpFacts(v); }}
            onAck={() => { setEpFactsAck(true); saveDraft(); }}
            onUnack={() => { setEpFactsAck(false); }}
            disabled={submitted}
            placeholder="Ex : J'ai discuté avec 3 femmes qui ont mentionné ce problème…"
          />
          <AcknowledgeField
            label="Ce que je suppose (hypothèses)"
            hint="Ce que tu crois vrai sans l'avoir vérifié."
            value={epAssumptions}
            acknowledged={epAssumptionsAck}
            onValue={v => { setEpAssumptions(v); }}
            onAck={() => { setEpAssumptionsAck(true); saveDraft(); }}
            onUnack={() => { setEpAssumptionsAck(false); }}
            disabled={submitted}
            placeholder="Ex : Je suppose qu'elles seraient prêtes à payer pour un accompagnement structuré…"
          />
          <AcknowledgeField
            label="Ce que je dois vérifier sur le terrain"
            hint="Questions que tu dois soumettre au marché."
            value={epToVerify}
            acknowledged={epToVerifyAck}
            onValue={v => { setEpToVerify(v); }}
            onAck={() => { setEpToVerifyAck(true); saveDraft(); }}
            onUnack={() => { setEpToVerifyAck(false); }}
            disabled={submitted}
            placeholder="Ex : Est-ce que le prix est acceptable ? Est-ce que le format leur convient ?…"
          />
          <div className={styles.saveIndicator}>{saving ? 'Sauvegarde…' : saveMsg}</div>
          <div className={styles.stepNavBtns}>
            <button className={styles.prevBtn} type="button" onClick={() => setStep(8)}>← Précédent</button>
            <button className={styles.nextBtn} type="button" onClick={() => setStep(10)}>Suivant →</button>
          </div>
        </div>
      )}

      {/* Step 10: Synthèse */}
      {step === 10 && (
        <div className={styles.stepBody}>
          <div className={styles.sectionHeader}>
            <h3 className={styles.sectionTitle}>MA SYNTHÈSE</h3>
            <p className={styles.sectionIntro}>En quelques phrases, résume ton Offre Test V1 comme tu l'expliquerais à une cliente potentielle.</p>
          </div>
          <div className={styles.fieldGroup}>
            <textarea
              className={styles.textarea}
              rows={5}
              placeholder="Résume ton offre en langage simple…"
              value={synthesis}
              onChange={e => setSynthesis(e.target.value)}
              onBlur={saveDraft}
              disabled={submitted}
            />
          </div>
          <div className={styles.saveIndicator}>{saving ? 'Sauvegarde…' : saveMsg}</div>
          <div className={styles.stepNavBtns}>
            <button className={styles.prevBtn} type="button" onClick={() => setStep(9)}>← Précédent</button>
            <button className={styles.nextBtn} type="button" onClick={() => setStep(11)}>Suivant →</button>
          </div>
        </div>
      )}

      {/* Step 11: Valider */}
      {step === 11 && (
        <div className={styles.stepBody}>
          <div className={styles.sectionHeader}>
            <h3 className={styles.sectionTitle}>VALIDER MON OFFRE TEST V1</h3>
            <p className={styles.sectionIntro}>
              Ton offre n'a pas besoin d'être parfaite. Elle doit être suffisamment claire pour que le marché puisse te répondre.
            </p>
          </div>
          <div className={styles.ctaSection}>
            <button
              className={styles.submitBtn}
              type="button"
              onClick={submitForm}
              disabled={submitting || !canSubmit}
            >
              {submitting ? 'Soumission…' : 'Valider mon Offre Test V1 →'}
            </button>
            {!canSubmit && (
              <p className={styles.completenessHint}>
                Complète toutes les étapes avant de valider.
              </p>
            )}
            {submitError && <p className={styles.submitError}>{submitError}</p>}
          </div>
          <div className={styles.stepNavBtns}>
            <button className={styles.prevBtn} type="button" onClick={() => setStep(10)}>← Précédent</button>
            <span />
          </div>
        </div>
      )}
    </div>
  );
}
