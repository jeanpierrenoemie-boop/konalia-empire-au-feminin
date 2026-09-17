import styles from './Step.module.css';

export function StepWelcome({ firstName, onNext }) {
  return (
    <div className={styles.card}>
      <div className={styles.stepBadge}>Bienvenue</div>
      <h1 className={styles.title}>
        Bienvenue{firstName ? `, ${firstName}` : ''}.
      </h1>
      <p className={styles.lead}>
        Tu es au bon endroit.
      </p>
      <div className={styles.body}>
        <p>
          <strong>Reprise de Contrôle</strong> est ton espace pour construire et tester
          un projet entrepreneurial — sans quitter ton emploi, sans te perdre,
          sans décisions prises à la légère.
        </p>
        <p>
          Avant d'accéder à ton Cockpit, je te propose de poser les bases de ton parcours.
          Cela prend environ <strong>15 à 20 minutes</strong>.
        </p>
        <p>
          Tu peux sauvegarder et reprendre à tout moment.
        </p>
      </div>
      <button className={styles.btnPrimary} onClick={onNext}>
        Commencer →
      </button>
    </div>
  );
}
