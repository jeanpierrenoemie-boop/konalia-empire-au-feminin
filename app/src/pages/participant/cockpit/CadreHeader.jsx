import { CadreProgression } from '../../../components/cadre/CadreProgression';
import { StatusBadge } from '../../../components/status/StatusBadge';
import styles from './CadreHeader.module.css';

const GATE_TO_STATUS = {
  in_progress: 'vert',
  pending_review: 'orange',
  blocked: 'rouge',
  locked: 'orange',
  passed: 'vert',
};

const GATE_LABELS = {
  in_progress:    'En cours',
  pending_review: 'En attente de validation',
  blocked:        'Bloqué',
  locked:         'Verrouillé',
  passed:         'Validé',
};

const CADRE_LABELS = {
  C: 'Clarifier',
  A: 'Arbitrer',
  D: 'Définir',
  R: 'Rencontrer',
  E: 'Évoluer',
};

export function CadreHeader({ progress }) {
  if (!progress) return null;

  const { cadre_step, sprint_number, week_in_sprint, gate_status, cohort_name } = progress;
  const statusVariant = GATE_TO_STATUS[gate_status] ?? 'orange';

  return (
    <div className={styles.wrapper}>
      <div className={styles.top}>
        <div className={styles.phase}>
          <span className={styles.phaseLetter}>{cadre_step}</span>
          <div>
            <span className={styles.phaseLabel}>Étape {cadre_step} — {CADRE_LABELS[cadre_step]}</span>
            <span className={styles.phaseDetail}>Sprint {sprint_number} · Semaine {week_in_sprint}</span>
          </div>
        </div>
        <StatusBadge variant={statusVariant} label={GATE_LABELS[gate_status] ?? gate_status} />
      </div>
      <CadreProgression currentStep={cadre_step} compact />
      {cohort_name && <span className={styles.cohort}>{cohort_name}</span>}
    </div>
  );
}
