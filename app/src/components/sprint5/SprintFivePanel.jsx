/**
 * SprintFivePanel — S5 : TA CIBLE & SON PROBLÈME
 * Seven steps: Direction | Cible Test | Test des 5 | Problème | Épistémique | Synthèse | Soumettre
 */
import { useState, useEffect, useCallback } from 'react';
import styles from './SprintFivePanel.module.css';

const FIVE_PERSON_OPTIONS = [
  { value: 'yes', label: 'Oui — je peux facilement citer 5 personnes' },
  { value: 'unsure', label: 'Pas sûre — j\'hésite sur certaines' },
  { value: 'no', label: 'Non — je ne trouve pas 5 personnes facilement' },
];

const DIAGNOSIS_OPTIONS = [
  { value: 'cible_trop_abstraite', label: 'Cible trop abstraite' },
  { value: 'manque_acces_reseau', label: 'Manque d\'accès au réseau' },
  { value: 'cible_trop_large', label: 'Cible trop large' },
  { value: 'probleme_hypothetique', label: 'Problème encore hypothétique' },
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
export function SprintFivePanel({ sprint, onMissionUpdate }) {
  const [step, setStep] = useState(0);

  const [s5, setS5] = useState(null);
  const [directionRef, setDirectionRef] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [submitError, setSubmitError] = useState(null);

  // Target test fields
  const [targetWho, setTargetWho] = useState('');
  const [targetSituation, setTargetSituation] = useState('');
  const [recognitionSignals, setRecognitionSignals] = useState('');
  const [accessPlaces, setAccessPlaces] = useState('');

  // Five person test
  const [fiveAnswer, setFiveAnswer] = useState(null);
  const [fiveDiagnosis, setFiveDiagnosis] = useState([]);
  const [fiveNote, setFiveNote] = useState('');

  // Problem to investigate
  const [probSituation, setProbSituation] = useState('');
  const [probDifficulty, setProbDifficulty] = useState('');
  const [probConsequence, setProbConsequence] = useState('');
  const [probWhyInvestigate, setProbWhyInvestigate] = useState('');

  // Epistemic
  const [epFacts, setEpFacts] = useState('');
  const [epFactsAck, setEpFactsAck] = useState(false);
  const [epAssumptions, setEpAssumptions] = useState('');
  const [epAssumptionsAck, setEpAssumptionsAck] = useState(false);
  const [epToVerify, setEpToVerify] = useState('');
  const [epToVerifyAck, setEpToVerifyAck] = useState(false);

  // Synthesis
  const [synthesis, setSynthesis] = useState('');

  const submitted = s5?.status === 'submitted';

  const loadState = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/s5/target-problem', { credentials: 'include' });
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        setError(b.error ?? 'Erreur de chargement');
        return;
      }
      const body = await r.json();
      setDirectionRef(body.direction_ref);
      if (body.s5) {
        const d = body.s5;
        setS5(d);
        setTargetWho(d.target_test?.who ?? '');
        setTargetSituation(d.target_test?.situation ?? '');
        setRecognitionSignals(d.target_test?.recognition_signals ?? '');
        setAccessPlaces(d.target_test?.access_places ?? '');
        setFiveAnswer(d.five_person_test?.answer ?? null);
        setFiveDiagnosis(d.five_person_test?.diagnosis ?? []);
        setFiveNote(d.five_person_test?.note ?? '');
        setProbSituation(d.problem_to_investigate?.situation ?? '');
        setProbDifficulty(d.problem_to_investigate?.difficulty ?? '');
        setProbConsequence(d.problem_to_investigate?.consequence ?? '');
        setProbWhyInvestigate(d.problem_to_investigate?.why_investigate ?? '');
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

  async function saveDraft() {
    if (submitted) return;
    setSaving(true);
    setError(null);
    try {
      const r = await fetch('/api/s5/target-problem', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_test: { who: targetWho, situation: targetSituation, recognition_signals: recognitionSignals, access_places: accessPlaces },
          five_person_test: { answer: fiveAnswer, diagnosis: fiveDiagnosis, note: fiveNote },
          problem_to_investigate: { situation: probSituation, difficulty: probDifficulty, consequence: probConsequence, why_investigate: probWhyInvestigate },
          epistemic: { facts: epFacts, facts_acknowledged: epFactsAck, assumptions: epAssumptions, assumptions_acknowledged: epAssumptionsAck, to_verify: epToVerify, to_verify_acknowledged: epToVerifyAck },
          synthesis,
        }),
      });
      const body = await r.json();
      if (!r.ok) { setError(body.error ?? 'Erreur lors de la sauvegarde'); return; }
      setS5(body.s5);
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
      const r = await fetch('/api/s5/target-problem/submit', {
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

  function toggleDiagnosis(val) {
    setFiveDiagnosis(d => d.includes(val) ? d.filter(x => x !== val) : [...d, val]);
  }

  // Completeness checks (mirror backend)
  const step1Complete = targetWho.trim() && targetSituation.trim() && recognitionSignals.trim() && accessPlaces.trim();
  const fiveComplete = ['yes','unsure','no'].includes(fiveAnswer) &&
    (fiveAnswer === 'yes' || fiveDiagnosis.length > 0 || fiveNote.trim());
  const step2Complete = fiveComplete;
  const step3Complete = probSituation.trim() && probDifficulty.trim() && probConsequence.trim() && probWhyInvestigate.trim();
  const step4Complete = (epFacts.trim() || epFactsAck) && (epAssumptions.trim() || epAssumptionsAck) && (epToVerify.trim() || epToVerifyAck);
  const canSubmit = step1Complete && step2Complete && step3Complete && step4Complete;

  if (loading) return <div className={styles.loading}>Chargement…</div>;

  if (submitted) {
    return (
      <div className={styles.submittedState}>
        <div className={styles.submittedHeader}>
          <span className={styles.submittedIcon}>✓</span>
          <h3 className={styles.submittedTitle}>CIBLE TEST SOUMISE POUR INVESTIGATION</h3>
        </div>
        <div className={styles.submittedCard}>
          <div className={styles.submittedField}>
            <span className={styles.submittedFieldLabel}>MA CIBLE TEST</span>
            <span className={styles.submittedFieldValue}>{targetWho || '—'}</span>
          </div>
          <div className={styles.submittedField}>
            <span className={styles.submittedFieldLabel}>SITUATION</span>
            <span className={styles.submittedFieldValue}>{targetSituation || '—'}</span>
          </div>
          <div className={styles.submittedField}>
            <span className={styles.submittedFieldLabel}>PROBLÈME À INVESTIGUER</span>
            <span className={styles.submittedFieldValue}>{probSituation || '—'}</span>
          </div>
        </div>
        <div className={styles.submittedFooter}>
          <span className={styles.submittedBadge}>Cible test — Sprint 5</span>
        </div>
      </div>
    );
  }

  const STEPS = [
    '1 · Ma Direction',
    '2 · Cible Test',
    '3 · Test des 5',
    '4 · Mon Problème',
    '5 · Ce que je sais / suppose / dois vérifier',
    '6 · Ma Synthèse',
    '7 · Valider',
  ];

  return (
    <div className={styles.panel}>
      <div className={styles.stepNav}>
        {STEPS.map((label, i) => (
          <button
            key={i}
            className={`${styles.stepBtn} ${step === i ? styles.stepActive : ''} ${i === 1 && step1Complete ? styles.stepDone : ''} ${i === 2 && step2Complete ? styles.stepDone : ''} ${i === 3 && step3Complete ? styles.stepDone : ''} ${i === 4 && step4Complete ? styles.stepDone : ''}`}
            onClick={() => setStep(i)}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>

      {error && <p className={styles.errorMsg}>{error}</p>}

      {/* Step 0: Ma Direction (read-only) */}
      {step === 0 && (
        <div className={styles.stepBody}>
          <div className={styles.sectionHeader}>
            <h3 className={styles.sectionTitle}>MA DIRECTION (S4)</h3>
            <p className={styles.sectionIntro}>
              Ta Direction est verrouillée depuis le Sprint 4. Elle cadre ta cible test et ton problème à investiguer.
              Tu ne modifies pas la Direction ici — tu l'utilises comme boussole.
            </p>
          </div>
          {directionRef ? (
            <div className={styles.directionBanner}>
              <span className={styles.directionBannerLabel}>Direction active</span>
              <span className={styles.directionBannerValue}>{directionRef.formulation || '(formulation non disponible)'}</span>
              <div className={styles.directionMeta}>
                {directionRef.person && (
                  <span className={styles.directionMetaItem}><strong>Pour qui :</strong> {directionRef.person}</span>
                )}
                {directionRef.problem && (
                  <span className={styles.directionMetaItem}><strong>Problème exploré :</strong> {directionRef.problem}</span>
                )}
              </div>
            </div>
          ) : (
            <p className={styles.errorMsg}>Aucune Direction S4 active trouvée.</p>
          )}
          <div className={styles.stepNav2}>
            <button className={styles.nextBtn} onClick={() => setStep(1)} type="button">
              Continuer → Cible Test
            </button>
          </div>
        </div>
      )}

      {/* Step 1: Cible Test */}
      {step === 1 && (
        <div className={styles.stepBody}>
          <div className={styles.sectionHeader}>
            <h3 className={styles.sectionTitle}>MA CIBLE TEST</h3>
            <p className={styles.sectionIntro}>
              La cible test n'est pas une persona validée. C'est une description suffisamment précise
              pour que tu puisses trouver de vraies personnes et commencer l'investigation terrain.
            </p>
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>QUI ? — profil de ta cible test</label>
            <p className={styles.fieldHint}>
              Décris qui est cette personne. Sois suffisamment précise pour pouvoir l'identifier dans ton réseau ou ton entourage.
            </p>
            <textarea
              className={styles.textarea}
              rows={3}
              placeholder="ex : Femmes de 35-50 ans en reconversion professionnelle, avec un emploi salarié, qui envisagent de créer une activité indépendante…"
              value={targetWho}
              onChange={e => setTargetWho(e.target.value)}
              onBlur={saveDraft}
              disabled={submitted}
            />
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>DANS QUELLE SITUATION SE TROUVE-T-ELLE ?</label>
            <p className={styles.fieldHint}>
              Décris le contexte de vie ou professionnel dans lequel cette personne rencontre la difficulté que tu veux explorer.
            </p>
            <textarea
              className={styles.textarea}
              rows={3}
              placeholder="ex : Elle travaille à temps plein, a des responsabilités familiales, et manque de temps pour se former ou tester son projet…"
              value={targetSituation}
              onChange={e => setTargetSituation(e.target.value)}
              onBlur={saveDraft}
              disabled={submitted}
            />
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>COMMENT LA RECONNAÎTRAIS-TU ?</label>
            <p className={styles.fieldHint}>
              Quels signaux concrets te permettraient d'identifier qu'une personne correspond à cette cible ?
              (comportements, situations, phrases qu'elle dirait…)
            </p>
            <textarea
              className={styles.textarea}
              rows={3}
              placeholder="ex : Elle parle de vouloir 'avoir son propre truc', elle a testé des formations sans les finir, elle dit 'j'attends d'avoir plus de temps'…"
              value={recognitionSignals}
              onChange={e => setRecognitionSignals(e.target.value)}
              onBlur={saveDraft}
              disabled={submitted}
            />
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>OÙ PEUX-TU LA TROUVER CONCRÈTEMENT ?</label>
            <p className={styles.fieldHint}>
              Indique des endroits réels — en ligne ou en présentiel — où tu pourrais rencontrer ces personnes.
            </p>
            <textarea
              className={styles.textarea}
              rows={2}
              placeholder="ex : Groupes Facebook de reconversion, réseau LinkedIn, anciens collègues, associations professionnelles femmes…"
              value={accessPlaces}
              onChange={e => setAccessPlaces(e.target.value)}
              onBlur={saveDraft}
              disabled={submitted}
            />
          </div>

          <div className={styles.stepNav2}>
            <button className={styles.backBtn} onClick={() => setStep(0)} type="button">← Retour</button>
            <button
              className={`${styles.nextBtn} ${step1Complete ? '' : styles.nextBtnDisabled}`}
              onClick={() => { saveDraft(); setStep(2); }}
              disabled={!step1Complete || saving}
              type="button"
            >
              Continuer → Test des 5
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Test des 5 */}
      {step === 2 && (
        <div className={styles.stepBody}>
          <div className={styles.sectionHeader}>
            <h3 className={styles.sectionTitle}>LE TEST DES 5</h3>
            <p className={styles.sectionIntro}>
              Peux-tu citer 5 personnes concrètes dans ton réseau qui correspondent à ta cible test ?
              Un "oui" indique un bon accès au terrain. Un "non" est un signal à explorer — pas une raison d'abandonner.
            </p>
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>PEUX-TU CITER 5 PERSONNES CONCRÈTES ?</label>
            <div className={styles.radioGroup}>
              {FIVE_PERSON_OPTIONS.map(opt => (
                <label key={opt.value} className={styles.radioLabel}>
                  <input
                    type="radio"
                    name="five_person"
                    value={opt.value}
                    checked={fiveAnswer === opt.value}
                    onChange={() => setFiveAnswer(opt.value)}
                    disabled={submitted}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          {(fiveAnswer === 'unsure' || fiveAnswer === 'no') && (
            <>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>DIAGNOSTIC — QU'EST-CE QUI BLOQUE ?</label>
                <p className={styles.fieldHint}>Coche ce qui s'applique (au moins une réponse).</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', marginTop: '0.25rem' }}>
                  {DIAGNOSIS_OPTIONS.map(opt => (
                    <label key={opt.value} className={styles.radioLabel}>
                      <input
                        type="checkbox"
                        checked={fiveDiagnosis.includes(opt.value)}
                        onChange={() => toggleDiagnosis(opt.value)}
                        disabled={submitted}
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </div>

              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>NOTE LIBRE</label>
                <p className={styles.fieldHint}>
                  Que révèle ce résultat sur ta cible ? Qu'est-ce que tu vas ajuster ?
                </p>
                <textarea
                  className={styles.textarea}
                  rows={3}
                  placeholder="ex : Je réalise que ma cible est trop abstraite. Je vais la préciser à…"
                  value={fiveNote}
                  onChange={e => setFiveNote(e.target.value)}
                  onBlur={saveDraft}
                  disabled={submitted}
                />
              </div>
            </>
          )}

          {fiveAnswer === 'yes' && (
            <div className={styles.ackAcknowledged} style={{ marginTop: '0.5rem' }}>
              <span>Bon signal d'accès au terrain. La cible reste à investiguer — ce n'est pas une validation.</span>
            </div>
          )}

          <div className={styles.stepNav2}>
            <button className={styles.backBtn} onClick={() => setStep(1)} type="button">← Retour</button>
            <button
              className={`${styles.nextBtn} ${step2Complete ? '' : styles.nextBtnDisabled}`}
              onClick={() => { saveDraft(); setStep(3); }}
              disabled={!step2Complete || saving}
              type="button"
            >
              Continuer → Mon Problème
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Problème à investiguer */}
      {step === 3 && (
        <div className={styles.stepBody}>
          <div className={styles.sectionHeader}>
            <h3 className={styles.sectionTitle}>MON PROBLÈME À INVESTIGUER</h3>
            <p className={styles.sectionIntro}>
              Formule le problème que tu vas investiguer sur le terrain. Ce n'est pas un problème "validé" —
              c'est une hypothèse suffisamment précise pour guider tes premières conversations.
            </p>
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>LA SITUATION</label>
            <p className={styles.fieldHint}>Dans quelle situation concrète cette personne rencontre-t-elle ce problème ?</p>
            <textarea
              className={styles.textarea}
              rows={3}
              placeholder="ex : Quand elle décide de se lancer, elle ne sait pas par où commencer…"
              value={probSituation}
              onChange={e => setProbSituation(e.target.value)}
              onBlur={saveDraft}
              disabled={submitted}
            />
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>LA DIFFICULTÉ</label>
            <p className={styles.fieldHint}>Quelle est la difficulté concrète ? (Utilise "semble" ou "serait" — c'est une hypothèse.)</p>
            <textarea
              className={styles.textarea}
              rows={3}
              placeholder="ex : Elle semble débordée par les choix à faire et manquerait de méthode pour prioriser…"
              value={probDifficulty}
              onChange={e => setProbDifficulty(e.target.value)}
              onBlur={saveDraft}
              disabled={submitted}
            />
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>LA CONSÉQUENCE</label>
            <p className={styles.fieldHint}>Quelle est la conséquence de ce problème pour cette personne ?</p>
            <textarea
              className={styles.textarea}
              rows={3}
              placeholder="ex : Elle reporte indéfiniment son projet, ce qui renforce un sentiment d'échec…"
              value={probConsequence}
              onChange={e => setProbConsequence(e.target.value)}
              onBlur={saveDraft}
              disabled={submitted}
            />
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>POURQUOI INVESTIGUER CE PROBLÈME ?</label>
            <p className={styles.fieldHint}>Pourquoi ce problème mérite-t-il d'être investigué en priorité ?</p>
            <textarea
              className={styles.textarea}
              rows={3}
              placeholder="ex : Si ce problème est réel et récurrent, il y a peut-être quelque chose que je peux proposer…"
              value={probWhyInvestigate}
              onChange={e => setProbWhyInvestigate(e.target.value)}
              onBlur={saveDraft}
              disabled={submitted}
            />
          </div>

          <div className={styles.stepNav2}>
            <button className={styles.backBtn} onClick={() => setStep(2)} type="button">← Retour</button>
            <button
              className={`${styles.nextBtn} ${step3Complete ? '' : styles.nextBtnDisabled}`}
              onClick={() => { saveDraft(); setStep(4); }}
              disabled={!step3Complete || saving}
              type="button"
            >
              Continuer → Ce que je sais / suppose
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Épistémique */}
      {step === 4 && (
        <div className={styles.stepBody}>
          <div className={styles.sectionHeader}>
            <h3 className={styles.sectionTitle}>CE QUE JE SAIS / JE SUPPOSE / JE DOIS VÉRIFIER</h3>
            <p className={styles.sectionIntro}>
              Distingue ce que tu sais réellement (faits vérifiés) de ce que tu supposes, et de ce que tu dois vérifier sur le terrain.
            </p>
          </div>

          <AcknowledgeField
            label="CE QUE JE SAIS — faits vérifiés"
            hint="Expériences concrètes, observations directes, données réelles sur ta cible ou son problème."
            placeholder="ex : J'ai discuté avec 3 femmes en reconversion et elles m'ont toutes parlé de ce manque de méthode…"
            value={epFacts}
            acknowledged={epFactsAck}
            onValue={setEpFacts}
            onAck={() => setEpFactsAck(true)}
            onUnack={() => setEpFactsAck(false)}
            disabled={submitted}
          />

          <AcknowledgeField
            label="CE QUE JE SUPPOSE — hypothèses"
            hint="Ce que tu crois vrai mais n'as pas encore vérifié directement sur cette cible."
            placeholder="ex : Je suppose que ce manque de méthode est fréquent chez d'autres profils similaires…"
            value={epAssumptions}
            acknowledged={epAssumptionsAck}
            onValue={setEpAssumptions}
            onAck={() => setEpAssumptionsAck(true)}
            onUnack={() => setEpAssumptionsAck(false)}
            disabled={submitted}
          />

          <AcknowledgeField
            label="CE QUE JE DOIS VÉRIFIER SUR LE TERRAIN"
            hint="Qu'est-ce que tu dois apprendre pour confirmer, nuancer ou écarter ton hypothèse de problème ?"
            placeholder="ex : Est-ce que ces femmes vivent ce problème comme une vraie difficulté ? Cherchent-elles une solution ? Laquelle ?"
            value={epToVerify}
            acknowledged={epToVerifyAck}
            onValue={setEpToVerify}
            onAck={() => setEpToVerifyAck(true)}
            onUnack={() => setEpToVerifyAck(false)}
            disabled={submitted}
          />

          <div className={styles.stepNav2}>
            <button className={styles.backBtn} onClick={() => setStep(3)} type="button">← Retour</button>
            <button
              className={`${styles.nextBtn} ${step4Complete ? '' : styles.nextBtnDisabled}`}
              onClick={() => { saveDraft(); setStep(5); }}
              disabled={!step4Complete || saving}
              type="button"
            >
              Continuer → Ma Synthèse
            </button>
          </div>
        </div>
      )}

      {/* Step 5: Synthèse */}
      {step === 5 && (
        <div className={styles.stepBody}>
          <div className={styles.sectionHeader}>
            <h3 className={styles.sectionTitle}>MA SYNTHÈSE</h3>
            <p className={styles.sectionIntro}>
              En une ou deux phrases, formule ta cible test et ton problème à investiguer.
              C'est ce que tu gardes en tête au moment d'aller parler à de vraies personnes.
            </p>
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>MA SYNTHÈSE (optionnel)</label>
            <textarea
              className={styles.textarea}
              rows={4}
              placeholder="ex : Je vais investiguer si les femmes salariées en reconversion manquent d'une méthode structurée pour avancer sur leur projet en parallèle de leur emploi…"
              value={synthesis}
              onChange={e => setSynthesis(e.target.value)}
              onBlur={saveDraft}
              disabled={submitted}
            />
          </div>

          <div className={styles.stepNav2}>
            <button className={styles.backBtn} onClick={() => setStep(4)} type="button">← Retour</button>
            <button
              className={styles.nextBtn}
              onClick={() => { saveDraft(); setStep(6); }}
              disabled={saving}
              type="button"
            >
              Continuer → Valider
            </button>
          </div>
        </div>
      )}

      {/* Step 6: Validation */}
      {step === 6 && (
        <div className={styles.stepBody}>
          <div className={styles.sectionHeader}>
            <h3 className={styles.sectionTitle}>VALIDER MA CIBLE TEST</h3>
            <p className={styles.sectionIntro}>
              En validant, tu confirms que ta cible et ton problème sont suffisamment formulés pour démarrer l'investigation terrain.
              Ce n'est pas une validation du problème — c'est le point de départ de ton enquête.
            </p>
          </div>

          <div className={styles.summaryBlock}>
            <p className={styles.summaryTitle}>RÉSUMÉ DE TA CIBLE TEST</p>
            <div className={styles.summaryRow}>
              <span className={styles.summaryLabel}>Qui</span>
              <span className={styles.summaryValue}>{targetWho || '—'}</span>
            </div>
            <div className={styles.summaryRow}>
              <span className={styles.summaryLabel}>Situation</span>
              <span className={styles.summaryValue}>{targetSituation || '—'}</span>
            </div>
            <div className={styles.summaryRow}>
              <span className={styles.summaryLabel}>Test des 5</span>
              <span className={styles.summaryValue}>
                {fiveAnswer === 'yes' ? 'Oui' : fiveAnswer === 'unsure' ? 'Pas sûre' : fiveAnswer === 'no' ? 'Non' : '—'}
              </span>
            </div>
            <div className={styles.summaryRow}>
              <span className={styles.summaryLabel}>Problème</span>
              <span className={styles.summaryValue}>{probSituation || '—'}</span>
            </div>
          </div>

          {submitError && <p className={styles.errorMsg}>{submitError}</p>}

          {!canSubmit && (
            <p className={styles.errorMsg}>
              {!step1Complete && 'Complète la Cible Test (étape 2).'}
              {step1Complete && !step2Complete && 'Complète le Test des 5 (étape 3).'}
              {step1Complete && step2Complete && !step3Complete && 'Complète le Problème à investiguer (étape 4).'}
              {step1Complete && step2Complete && step3Complete && !step4Complete && 'Complète la section Ce que je sais / suppose / dois vérifier (étape 5).'}
            </p>
          )}

          <div className={styles.stepNav2}>
            <button className={styles.backBtn} onClick={() => setStep(5)} type="button">← Retour</button>
            <button
              className={`${styles.submitBtn} ${canSubmit ? '' : styles.submitBtnDisabled}`}
              onClick={submitForm}
              disabled={!canSubmit || submitting}
              type="button"
            >
              {submitting ? 'Soumission…' : 'Valider ma Cible Test →'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
