import styles from './Step.module.css';
import cadreStyles from './StepCadre.module.css';

const CADRE_STEPS = [
  {
    key: 'C',
    label: 'Clarifier',
    description: 'Comprendre ta situation réelle aujourd\'hui — ton énergie, tes contraintes, ce que tu veux vraiment. Pas de projet inventé, pas de promesse irréaliste.',
  },
  {
    key: 'A',
    label: 'Arbitrer',
    description: 'Choisir. Décider ce que tu es prête à investir et ce que tu mets de côté. L\'arbitrage protège ton énergie.',
  },
  {
    key: 'D',
    label: 'Définir',
    description: 'Poser les bases concrètes de ton projet : qui tu cibles, quel problème tu résous, comment tu crées de la valeur.',
  },
  {
    key: 'R',
    label: 'Rencontrer',
    description: 'Aller vers de vraies personnes. Tester tes hypothèses sur le terrain avant de construire quoi que ce soit.',
  },
  {
    key: 'E',
    label: 'Évoluer',
    description: 'Ancrer ce qui marche. Ajuster ce qui ne marche pas. Faire grandir le projet avec les preuves que tu as collectées.',
  },
];

export function StepCadre({ onBack, onNext }) {
  return (
    <div className={styles.card}>
      <div className={styles.stepBadge}>La méthode</div>
      <h1 className={styles.title}>Le C.A.D.R.E.</h1>
      <p className={styles.lead}>
        Ton parcours est structuré en 5 étapes progressives.
      </p>

      <div className={cadreStyles.steps}>
        {CADRE_STEPS.map(s => (
          <div key={s.key} className={cadreStyles.step}>
            <div className={cadreStyles.letter}>{s.key}</div>
            <div className={cadreStyles.info}>
              <strong className={cadreStyles.stepLabel}>{s.label}</strong>
              <p className={cadreStyles.stepDesc}>{s.description}</p>
            </div>
          </div>
        ))}
      </div>

      <div className={styles.body}>
        <p>
          Chaque étape contient des missions, des Labs et des moments de bilan.
          Tu avances à ton rythme. Ton COPILOTE t'accompagne à chaque étape.
        </p>
        <p>
          <strong>Tu commences par C — Clarifier.</strong>
        </p>
      </div>

      <div className={styles.actions}>
        <button className={styles.btnSecondary} onClick={onBack}>← Retour</button>
        <button className={styles.btnPrimary} onClick={onNext}>J'ai compris →</button>
      </div>
    </div>
  );
}
