import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { useOnboarding } from './useOnboarding';
import { StepWelcome } from './steps/StepWelcome';
import { StepCadre } from './steps/StepCadre';
import { StepPointDeDepart } from './steps/StepPointDeDepart';
import { StepConfirmation } from './steps/StepConfirmation';
import { LoadingState } from '../../components/states/LoadingState';
import styles from './OnboardingPage.module.css';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

/* Steps:
   0 = Welcome
   1 = C.A.D.R.E. explanation
   2 = Point de Départ (6 sections, internal sub-steps)
   3 = Confirmation
*/
const TOTAL_STEPS = 4;

export function OnboardingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { saving, error, saveDraft, complete } = useOnboarding();

  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(0);
  const [sections, setSections] = useState({});
  const [completing, setCompleting] = useState(false);
  const [completed, setCompleted] = useState(false);

  /* Load existing draft on mount */
  useEffect(() => {
    fetch(`${API}/api/onboarding/state`, { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        if (data.completed) {
          navigate('/cockpit', { replace: true });
          return;
        }
        if (data.draft?.sections) {
          setSections(data.draft.sections);
        }
        // Resume: if they got past CADRE, go to PointDeDepart
        const lastStep = data.step ?? 0;
        if (lastStep >= 2) setStep(2);
        else if (lastStep >= 1) setStep(1);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [navigate]);

  async function handleSectionSave(section, answers) {
    const updated = { ...sections, [section]: answers };
    setSections(updated);
    await saveDraft(section, answers, 2);
  }

  async function handleComplete(allSections) {
    setCompleting(true);
    try {
      await complete(allSections);
      setCompleted(true);
      setStep(3);
    } finally {
      setCompleting(false);
    }
  }

  if (loading) return <LoadingState label="Chargement…" />;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.logo}>
          <span className={styles.logoMark}>RC</span>
          <span className={styles.logoName}>Reprise de Contrôle</span>
        </div>
        <ProgressBar step={step} total={TOTAL_STEPS} />
      </div>

      <div className={styles.content}>
        {step === 0 && (
          <StepWelcome
            firstName={user?.first_name}
            onNext={() => { setStep(1); saveDraft('__welcome', { seen: true }, 1); }}
          />
        )}
        {step === 1 && (
          <StepCadre
            onBack={() => setStep(0)}
            onNext={() => { setStep(2); saveDraft('__cadre', { seen: true }, 2); }}
          />
        )}
        {step === 2 && (
          <StepPointDeDepart
            initialSections={sections}
            saving={saving}
            error={error}
            onSaveSection={handleSectionSave}
            onComplete={handleComplete}
            completing={completing}
          />
        )}
        {step === 3 && (
          <StepConfirmation
            sections={sections}
            onGoToCockpit={() => navigate('/cockpit', { replace: true })}
          />
        )}
      </div>
    </div>
  );
}

function ProgressBar({ step, total }) {
  const pct = Math.round((step / (total - 1)) * 100);
  return (
    <div className={styles.progressWrap} aria-label={`Étape ${step + 1} sur ${total}`}>
      <div className={styles.progressBar} style={{ width: `${pct}%` }} />
    </div>
  );
}
