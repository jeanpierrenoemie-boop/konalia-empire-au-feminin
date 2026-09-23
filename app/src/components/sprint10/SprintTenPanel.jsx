/**
 * SprintTenPanel — S10 : PROPOSER & OBSERVER
 * 7 steps (0-6):
 *   0. CE QUE TON DERNIER TEST T'A APPRIS (read-only depuis S9)
 *   1. TON HYPOTHÈSE
 *   2. CE QUE TU VAS CHANGER (variable testée)
 *   3. CE QUE TU VAS GARDER (constantes)
 *   4. AVEC QUI & COMMENT (plan de test)
 *   5. CE QUE TU VAS OBSERVER
 *   6. JE SAIS / JE SUPPOSE / SYNTHÈSE & SOUMISSION
 */
import { useState, useEffect, useCallback } from 'react';
import styles from './SprintTenPanel.module.css';

const VARIABLE_CATEGORIES = [
  { value: 'cible', label: 'Cible' },
  { value: 'probleme', label: 'Problème' },
  { value: 'formulation', label: 'Formulation' },
  { value: 'proposition', label: 'Proposition' },
  { value: 'resultat', label: 'Résultat attendu' },
  { value: 'prix', label: 'Prix' },
  { value: 'cta', label: 'Appel à l\'action' },
  { value: 'canal', label: 'Canal' },
  { value: 'objection', label: 'Objection' },
  { value: 'autre', label: 'Autre' },
];

const STEPS = [
  'TON DERNIER TEST',
  'TON HYPOTHÈSE',
  'CE QUE TU CHANGES',
  'CE QUE TU GARDES',
  'PLAN DE TEST',
  'CE QUE TU OBSERVES',
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

/* ── ConstantTag ─────────────────────────────────────────────────── */
function ConstantTag({ value, onRemove, disabled }) {
  return (
    <span className={styles.tag}>
      {value}
      {!disabled && (
        <button type="button" className={styles.tagRemove} onClick={onRemove} aria-label="Supprimer">×</button>
      )}
    </span>
  );
}

/* ── Main component ─────────────────────────────────────────────── */
export function SprintTenPanel({ sprint, onMissionUpdate }) {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  // Source data from S9
  const [s9Refs, setS9Refs] = useState(null);

  // Form state
  const [hypothesis, setHypothesis] = useState('');
  const [variableUnderTest, setVariableUnderTest] = useState('');
  const [variableCategory, setVariableCategory] = useState('');
  const [constants, setConstants] = useState([]);
  const [constantInput, setConstantInput] = useState('');
  const [targetPerson, setTargetPerson] = useState('');
  const [messageOrOffer, setMessageOrOffer] = useState('');
  const [channel, setChannel] = useState('');
  const [mainQuestion, setMainQuestion] = useState('');
  const [dataToObserve, setDataToObserve] = useState('');
  const [expectedAction, setExpectedAction] = useState('');
  const [completionCriterion, setCompletionCriterion] = useState('');
  const [whatIWillLookAt, setWhatIWillLookAt] = useState('');
  const [facts, setFacts] = useState('');
  const [factsAck, setFactsAck] = useState(false);
  const [assumptions, setAssumptions] = useState('');
  const [assumptionsAck, setAssumptionsAck] = useState(false);
  const [toVerify, setToVerify] = useState('');
  const [toVerifyAck, setToVerifyAck] = useState(false);
  const [synthesis, setSynthesis] = useState('');

  const isDisabled = submitted;

  const buildBody = useCallback(() => ({
    iteration: {
      hypothesis,
      variable_under_test: variableUnderTest,
      variable_category: variableCategory || null,
      constants,
    },
    test_plan: { target_person: targetPerson, message_or_offer: messageOrOffer, channel, main_question: mainQuestion },
    observation_criteria: { data_to_observe: dataToObserve, expected_action: expectedAction, completion_criterion: completionCriterion },
    decision_criteria: { what_i_will_look_at: whatIWillLookAt },
    epistemic: { facts, facts_acknowledged: factsAck, assumptions, assumptions_acknowledged: assumptionsAck, to_verify: toVerify, to_verify_acknowledged: toVerifyAck },
    synthesis,
  }), [hypothesis, variableUnderTest, variableCategory, constants, targetPerson, messageOrOffer, channel, mainQuestion, dataToObserve, expectedAction, completionCriterion, whatIWillLookAt, facts, factsAck, assumptions, assumptionsAck, toVerify, toVerifyAck, synthesis]);

  useEffect(() => {
    fetch('/api/s10/iteration-plan', { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); return; }
        setS9Refs(data.s9_refs ?? null);
        const s10 = data.s10;
        if (s10) {
          const it = s10.iteration ?? {};
          setHypothesis(it.hypothesis ?? '');
          setVariableUnderTest(it.variable_under_test ?? '');
          setVariableCategory(it.variable_category ?? '');
          setConstants(it.constants ?? []);
          const tp = s10.test_plan ?? {};
          setTargetPerson(tp.target_person ?? '');
          setMessageOrOffer(tp.message_or_offer ?? '');
          setChannel(tp.channel ?? '');
          setMainQuestion(tp.main_question ?? '');
          const oc = s10.observation_criteria ?? {};
          setDataToObserve(oc.data_to_observe ?? '');
          setExpectedAction(oc.expected_action ?? '');
          setCompletionCriterion(oc.completion_criterion ?? '');
          const dc = s10.decision_criteria ?? {};
          setWhatIWillLookAt(dc.what_i_will_look_at ?? '');
          const ep = s10.epistemic ?? {};
          setFacts(ep.facts ?? '');
          setFactsAck(ep.facts_acknowledged ?? false);
          setAssumptions(ep.assumptions ?? '');
          setAssumptionsAck(ep.assumptions_acknowledged ?? false);
          setToVerify(ep.to_verify ?? '');
          setToVerifyAck(ep.to_verify_acknowledged ?? false);
          setSynthesis(s10.synthesis ?? '');
          setSubmitted(s10.status === 'submitted');
          // Prefill from S9 if hypothesis is empty
          if (!it.hypothesis?.trim() && data.s9_refs?.priority_hypothesis) {
            setHypothesis(data.s9_refs.priority_hypothesis);
          }
        } else if (data.s9_refs?.priority_hypothesis) {
          setHypothesis(data.s9_refs.priority_hypothesis);
        }
      })
      .catch(() => setError('Impossible de charger le plan d\'itération.'))
      .finally(() => setLoading(false));
  }, []);

  const save = useCallback(async () => {
    if (isDisabled) return;
    setSaving(true);
    try {
      await fetch('/api/s10/iteration-plan', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildBody()),
      });
    } catch {}
    setSaving(false);
  }, [isDisabled, buildBody]);

  const handleSubmit = async () => {
    setSubmitError(null);
    try {
      const r = await fetch('/api/s10/iteration-plan/submit', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await r.json();
      if (!r.ok) { setSubmitError(data.error ?? 'Erreur lors de la soumission.'); return; }
      setSubmitted(true);
      onMissionUpdate?.();
    } catch {
      setSubmitError('Erreur réseau. Réessaie.');
    }
  };

  const addConstant = () => {
    const v = constantInput.trim();
    if (v && !constants.includes(v)) setConstants(prev => [...prev, v]);
    setConstantInput('');
  };

  if (loading) return <div className={styles.loading}>Chargement…</div>;
  if (error) return <div className={styles.errorBox}>{error}</div>;

  return (
    <div className={styles.panel}>
      {/* Progress bar */}
      <div className={styles.progressBar}>
        {STEPS.map((label, i) => (
          <button
            key={i}
            className={`${styles.stepBtn} ${i === step ? styles.stepActive : i < step ? styles.stepDone : ''}`}
            onClick={() => setStep(i)}
            type="button"
          >
            <span className={styles.stepNum}>{i + 1}</span>
            <span className={styles.stepLabel}>{label}</span>
          </button>
        ))}
      </div>

      <div className={styles.content}>

        {/* Step 0: Source from S9 */}
        {step === 0 && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Ce que ton dernier test t'a appris</h2>
            <p className={styles.sectionHint}>Ces informations viennent de ton analyse S9. Elles te servent de point de départ.</p>
            {s9Refs ? (
              <div className={styles.sourceCard}>
                {s9Refs.priority_hypothesis && (
                  <div className={styles.sourceRow}>
                    <span className={styles.sourceLabel}>Hypothèse prioritaire (S9)</span>
                    <span className={styles.sourceValue}>{s9Refs.priority_hypothesis}</span>
                  </div>
                )}
                {s9Refs.next_test_question && (
                  <div className={styles.sourceRow}>
                    <span className={styles.sourceLabel}>Question du prochain test (S9)</span>
                    <span className={styles.sourceValue}>{s9Refs.next_test_question}</span>
                  </div>
                )}
                {s9Refs.next_test_target && (
                  <div className={styles.sourceRow}>
                    <span className={styles.sourceLabel}>Cible prévue (S9)</span>
                    <span className={styles.sourceValue}>{s9Refs.next_test_target}</span>
                  </div>
                )}
                {s9Refs.next_test_action && (
                  <div className={styles.sourceRow}>
                    <span className={styles.sourceLabel}>Action prévue (S9)</span>
                    <span className={styles.sourceValue}>{s9Refs.next_test_action}</span>
                  </div>
                )}
              </div>
            ) : (
              <p className={styles.emptyNote}>Aucune référence S9 disponible.</p>
            )}
            <div className={styles.doctrineBox}>
              <strong>Méthode S10 :</strong>
              <p>TESTER → OBSERVER → ANALYSER → AJUSTER UNE VARIABLE → RETESTER</p>
              <p className={styles.doctrineNote}>Pas : TESTER → PANIQUER → TOUT CHANGER.</p>
            </div>
          </section>
        )}

        {/* Step 1: Hypothesis */}
        {step === 1 && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Ton hypothèse</h2>
            <p className={styles.sectionHint}>
              Formule précisément ce que tu veux tester. Une hypothèse est une supposition que tu peux confirmer ou infirmer avec une observation réelle.
            </p>
            <label className={styles.label}>
              Mon hypothèse pour ce test
              <textarea
                className={styles.textarea}
                rows={4}
                placeholder="Ex : Je pense que les entrepreneurs freelance en reconversion ont du mal à expliquer leur offre à leurs anciens collègues, pas seulement à de nouveaux prospects."
                value={hypothesis}
                onChange={e => setHypothesis(e.target.value)}
                onBlur={save}
                disabled={isDisabled}
              />
            </label>
            <div className={styles.epNote}>
              Une hypothèse ≠ une certitude. Elle est là pour être testée, pas défendue.
            </div>
          </section>
        )}

        {/* Step 2: Variable under test */}
        {step === 2 && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Ce que tu vas changer</h2>
            <p className={styles.sectionHint}>
              Identifie UNE seule variable. Si tu changes plusieurs choses à la fois, tu ne pourras pas savoir ce qui a fonctionné.
            </p>
            <label className={styles.label}>
              Variable principale testée
              <textarea
                className={styles.textarea}
                rows={3}
                placeholder="Ex : La formulation de la proposition de valeur — je vais utiliser les mots exacts de mes cibles au lieu de mon jargon."
                value={variableUnderTest}
                onChange={e => setVariableUnderTest(e.target.value)}
                onBlur={save}
                disabled={isDisabled}
              />
            </label>
            <label className={styles.label}>
              Catégorie
              <select
                className={styles.select}
                value={variableCategory}
                onChange={e => { setVariableCategory(e.target.value); }}
                onBlur={save}
                disabled={isDisabled}
              >
                <option value="">— Sélectionner —</option>
                {VARIABLE_CATEGORIES.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </label>
            <div className={styles.epNote}>
              Une seule variable te permet de comprendre ce qui change réellement entre deux tests.
            </div>
          </section>
        )}

        {/* Step 3: Constants */}
        {step === 3 && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Ce que tu vas garder</h2>
            <p className={styles.sectionHint}>
              Liste les éléments que tu NE changes pas dans ce test. Cela rend la comparaison possible.
            </p>
            <div className={styles.tagsContainer}>
              {constants.map((c, i) => (
                <ConstantTag
                  key={i}
                  value={c}
                  disabled={isDisabled}
                  onRemove={() => { setConstants(prev => prev.filter((_, j) => j !== i)); setTimeout(save, 0); }}
                />
              ))}
            </div>
            {!isDisabled && (
              <div className={styles.tagInput}>
                <input
                  className={styles.input}
                  placeholder="Ex : La cible, le prix, le canal…"
                  value={constantInput}
                  onChange={e => setConstantInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addConstant(); } }}
                />
                <button type="button" className={styles.addBtn} onClick={() => { addConstant(); setTimeout(save, 0); }}>
                  Ajouter
                </button>
              </div>
            )}
            <div className={styles.epNote}>
              Ce que tu gardes constant te permet de comprendre ce qui a réellement changé.
            </div>
          </section>
        )}

        {/* Step 4: Test plan */}
        {step === 4 && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Plan de test</h2>
            <p className={styles.sectionHint}>
              Prépare le contexte concret de ton prochain test.
            </p>
            <label className={styles.label}>
              Avec qui tu vas tester
              <textarea
                className={styles.textarea}
                rows={2}
                placeholder="Décris la personne : profil, situation, comment tu vas l'approcher"
                value={targetPerson}
                onChange={e => setTargetPerson(e.target.value)}
                onBlur={save}
                disabled={isDisabled}
              />
            </label>
            <label className={styles.label}>
              Message ou offre présentée
              <textarea
                className={styles.textarea}
                rows={3}
                placeholder="Résume ce que tu vas proposer ou dire"
                value={messageOrOffer}
                onChange={e => setMessageOrOffer(e.target.value)}
                onBlur={save}
                disabled={isDisabled}
              />
            </label>
            <label className={styles.label}>
              Canal
              <input
                className={styles.input}
                placeholder="Ex : café, LinkedIn, téléphone, email…"
                value={channel}
                onChange={e => setChannel(e.target.value)}
                onBlur={save}
                disabled={isDisabled}
              />
            </label>
            <label className={styles.label}>
              Question principale que tu veux explorer
              <textarea
                className={styles.textarea}
                rows={2}
                placeholder="Ex : Est-ce que la personne comprend en quoi mon offre est différente de ce qu'elle fait déjà ?"
                value={mainQuestion}
                onChange={e => setMainQuestion(e.target.value)}
                onBlur={save}
                disabled={isDisabled}
              />
            </label>
          </section>
        )}

        {/* Step 5: Observation criteria */}
        {step === 5 && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Ce que tu vas observer</h2>
            <p className={styles.sectionHint}>
              Définis à l'avance ce que tu vas regarder. Un critère de test réalisé n'est pas un objectif de vente.
            </p>
            <label className={styles.label}>
              Donnée à observer
              <textarea
                className={styles.textarea}
                rows={3}
                placeholder="Ex : Comment la personne réagit quand je lui présente la nouvelle formulation — est-ce qu'elle pose des questions ou est-ce qu'elle change de sujet ?"
                value={dataToObserve}
                onChange={e => setDataToObserve(e.target.value)}
                onBlur={save}
                disabled={isDisabled}
              />
            </label>
            <label className={styles.label}>
              Action attendue ou observable (optionnelle)
              <textarea
                className={styles.textarea}
                rows={2}
                placeholder="Ex : Demande d'information supplémentaire, prise de RDV, silence, objection…"
                value={expectedAction}
                onChange={e => setExpectedAction(e.target.value)}
                onBlur={save}
                disabled={isDisabled}
              />
            </label>
            <label className={styles.label}>
              Critère de test réalisé
              <textarea
                className={styles.textarea}
                rows={2}
                placeholder="Ex : J'ai présenté la nouvelle formulation à une personne correspondant à ma cible et documenté sa réaction."
                value={completionCriterion}
                onChange={e => setCompletionCriterion(e.target.value)}
                onBlur={save}
                disabled={isDisabled}
              />
            </label>
            <label className={styles.label}>
              Ce que je vais regarder pour décider de la suite
              <textarea
                className={styles.textarea}
                rows={2}
                placeholder="Ex : Si la personne demande à en savoir plus sans que je force, c'est un signal que la formulation fonctionne."
                value={whatIWillLookAt}
                onChange={e => setWhatIWillLookAt(e.target.value)}
                onBlur={save}
                disabled={isDisabled}
              />
            </label>
            <div className={styles.epNote}>
              Exemple acceptable : "J'ai présenté l'offre et documenté la réaction."<br />
              Exemple interdit comme condition obligatoire : "Elle a acheté."
            </div>
          </section>
        )}

        {/* Step 6: Epistemic + synthesis + submit */}
        {step === 6 && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Je sais / Je suppose / Je dois vérifier</h2>
            <AcknowledgeField
              label="Ce que je sais (faits)"
              hint="Observations réelles déjà recueillies, pertinentes pour ce test."
              value={facts}
              acknowledged={factsAck}
              onValue={v => setFacts(v)}
              onAck={() => { setFactsAck(true); setTimeout(save, 0); }}
              onUnack={() => { setFactsAck(false); setTimeout(save, 0); }}
              disabled={isDisabled}
              placeholder="Ce que j'ai réellement observé, entendu ou constaté…"
            />
            <AcknowledgeField
              label="Mes suppositions"
              hint="Ce que tu crois vrai mais qui n'a pas encore été testé."
              value={assumptions}
              acknowledged={assumptionsAck}
              onValue={v => setAssumptions(v)}
              onAck={() => { setAssumptionsAck(true); setTimeout(save, 0); }}
              onUnack={() => { setAssumptionsAck(false); setTimeout(save, 0); }}
              disabled={isDisabled}
              placeholder="Ce que je suppose sans preuve pour l'instant…"
            />
            <AcknowledgeField
              label="Ce que je dois encore vérifier"
              hint="Questions ouvertes que ce test ou les suivants devront répondre."
              value={toVerify}
              acknowledged={toVerifyAck}
              onValue={v => setToVerify(v)}
              onAck={() => { setToVerifyAck(true); setTimeout(save, 0); }}
              onUnack={() => { setToVerifyAck(false); setTimeout(save, 0); }}
              disabled={isDisabled}
              placeholder="Questions encore ouvertes…"
            />

            <div className={styles.epNote}>
              Répétition d'un signal ≠ preuve absolue. Absence de signal ≠ preuve d'absence.
              Achat ≠ validation générale du marché. Refus ≠ échec du projet.
            </div>

            <label className={styles.label} style={{ marginTop: '1.5rem' }}>
              Synthèse (optionnelle)
              <textarea
                className={styles.textarea}
                rows={3}
                placeholder="En une phrase, ce que tu veux tester et ce que tu vas observer…"
                value={synthesis}
                onChange={e => setSynthesis(e.target.value)}
                onBlur={save}
                disabled={isDisabled}
              />
            </label>

            {!submitted ? (
              <div className={styles.submitArea}>
                {submitError && <p className={styles.submitError}>{submitError}</p>}
                <button
                  type="button"
                  className={styles.submitBtn}
                  onClick={handleSubmit}
                  disabled={saving}
                >
                  {saving ? 'Enregistrement…' : 'Soumettre mon plan d\'itération'}
                </button>
                <p className={styles.submitNote}>
                  Ton plan sera enregistré. Tu peux le retravailler avant de soumettre.
                </p>
              </div>
            ) : (
              <div className={styles.successBox}>
                <span className={styles.successIcon}>✓</span>
                <span>Plan d'itération soumis. Prochain test préparé.</span>
              </div>
            )}
          </section>
        )}

      </div>

      {/* Navigation */}
      <div className={styles.nav}>
        <button
          type="button"
          className={styles.navBtn}
          onClick={() => setStep(s => Math.max(0, s - 1))}
          disabled={step === 0}
        >
          ← Précédent
        </button>
        {saving && <span className={styles.savingLabel}>Enregistrement…</span>}
        <button
          type="button"
          className={styles.navBtn}
          onClick={() => { save(); setStep(s => Math.min(STEPS.length - 1, s + 1)); }}
          disabled={step === STEPS.length - 1}
        >
          Suivant →
        </button>
      </div>
    </div>
  );
}
