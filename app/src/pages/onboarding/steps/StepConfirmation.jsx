import styles from './Step.module.css';
import cStyles from './StepConfirmation.module.css';

export function StepConfirmation({ sections, onGoToCockpit }) {
  const e = sections?.E ?? {};
  const f = sections?.F ?? {};

  return (
    <div className={styles.card}>
      <div className={cStyles.checkmark} aria-hidden="true">✓</div>
      <h1 className={styles.title}>Ton parcours est lancé.</h1>
      <p className={styles.lead}>
        Ton Point de Départ est enregistré. L'étape C est ouverte.
      </p>

      <div className={cStyles.summary}>
        {e.objective_j90 && (
          <div className={cStyles.fact}>
            <span className={cStyles.factLabel}>Ton objectif J90</span>
            <span className={cStyles.factValue}>"{e.objective_j90}"</span>
          </div>
        )}
        {f.commitment && (
          <div className={cStyles.fact}>
            <span className={cStyles.factLabel}>Ton engagement</span>
            <span className={cStyles.factValue}>"{f.commitment}"</span>
          </div>
        )}
      </div>

      <div className={cStyles.nextBox}>
        <span className={cStyles.nextLabel}>Prochaine action</span>
        <p className={cStyles.nextText}>
          Ouvre ton Cockpit et commence l'étape <strong>C — Clarifier</strong>.
          Ta première mission t'attend.
        </p>
      </div>

      <button className={styles.btnPrimary} onClick={onGoToCockpit}>
        Accéder à mon Cockpit →
      </button>
    </div>
  );
}
