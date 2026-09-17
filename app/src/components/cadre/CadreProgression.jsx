import styles from './CadreProgression.module.css';

const STEPS = [
  { key: 'C', label: 'Clarifier', description: 'Définir ta situation réelle' },
  { key: 'A', label: 'Arbitrer', description: 'Choisir ce qui compte vraiment' },
  { key: 'D', label: 'Définir', description: 'Poser les bases de ton projet' },
  { key: 'R', label: 'Rencontrer', description: 'Tester avec de vraies personnes' },
  { key: 'E', label: 'Évoluer', description: 'Ancrer et faire grandir' },
];

export function CadreProgression({ currentStep = null, compact = false }) {
  const currentIndex = STEPS.findIndex(s => s.key === currentStep);

  return (
    <div className={`${styles.wrapper} ${compact ? styles.compact : ''}`}>
      {STEPS.map((step, i) => {
        const status =
          currentStep === null ? 'upcoming'
          : i < currentIndex ? 'done'
          : i === currentIndex ? 'active'
          : 'upcoming';

        return (
          <div key={step.key} className={`${styles.step} ${styles[status]}`}>
            <div className={styles.indicator}>
              <span className={styles.letter}>{step.key}</span>
              {i < STEPS.length - 1 && <span className={styles.connector} />}
            </div>
            {!compact && (
              <div className={styles.info}>
                <span className={styles.stepLabel}>{step.label}</span>
                <span className={styles.stepDesc}>{step.description}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
