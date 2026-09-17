import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { LoadingState } from '../../components/states/LoadingState';
import { ErrorState } from '../../components/states/ErrorState';
import styles from './PasseportPage.module.css';
import pageStyles from './Page.module.css';

const STAGE_LABELS = {
  ideation: 'Idéation', validation: 'Validation', pilot: 'Pilote',
  launch: 'Lancement', growth: 'Croissance',
};

function CompletenessBar({ value }) {
  const color = value >= 80 ? 'vert' : value >= 40 ? 'orange' : 'rouge';
  return (
    <div className={styles.completenessWrap}>
      <div className={styles.completenessBar}>
        <div className={`${styles.completenessFill} ${styles[color]}`} style={{ width: `${value}%` }} />
      </div>
      <span className={styles.completenessLabel}>{value}% renseigné</span>
    </div>
  );
}

function Field({ label, value, placeholder }) {
  if (!value) return (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      <span className={styles.fieldEmpty}>{placeholder ?? 'Non renseigné'}</span>
    </div>
  );
  return (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      <p className={styles.fieldValue}>{value}</p>
    </div>
  );
}

export function PasseportPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/passeport', { credentials: 'include' });
      if (!r.ok) throw new Error('Erreur chargement passeport');
      setData(await r.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  if (loading) return <LoadingState />;
  if (error)   return <ErrorState message={error} onRetry={load} />;

  const { passport, profile, progress, completeness } = data ?? {};

  return (
    <div className={pageStyles.page}>
      <div className={pageStyles.header}>
        <h1 className={pageStyles.title}>Passeport Projet</h1>
        <Link to="/decisions" className={styles.decisionsLink}>Journal des Décisions →</Link>
      </div>

      {passport ? (
        <>
          <CompletenessBar value={completeness ?? 0} />

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Projet</h2>
            <div className={styles.fields}>
              <Field label="Nom du projet" value={passport.project_name} placeholder="Non défini — compléter via l'onboarding" />
              <Field label="Vision / Objectif J+90" value={passport.vision} placeholder="Non défini" />
              <Field label="Stade actuel" value={STAGE_LABELS[passport.stage] ?? passport.stage} />
            </div>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Cible & Problème</h2>
            <div className={styles.fields}>
              <Field label="Persona cible" value={passport.target_persona} placeholder="À définir — Sprint 5" />
              <Field label="Problème central" value={passport.core_problem} placeholder="À définir — Sprint 5" />
            </div>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Offre & Revenus</h2>
            <div className={styles.fields}>
              <Field label="Solution proposée" value={passport.proposed_solution} placeholder="À définir — Sprint 6" />
              <Field label="Modèle de revenus" value={passport.revenue_model} placeholder="À définir — Sprint 7" />
              {passport.validation_score != null && (
                <Field label="Score de validation" value={`${passport.validation_score}/100`} />
              )}
            </div>
          </section>

          {progress && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Progression</h2>
              <div className={styles.progressRow}>
                <span className={styles.progressStep}>{progress.cadre_step}</span>
                <span>Sprint {progress.sprint_number} — {progress.gate_status}</span>
              </div>
            </section>
          )}

          <div className={styles.actions}>
            <Link to="/preuves" className={styles.actionLink}>Voir mes preuves →</Link>
            <Link to="/preuves/dossier-export" className={styles.actionLink}>Préparer le Dossier →</Link>
          </div>
        </>
      ) : (
        <div className={styles.empty}>
          <p>Aucun passeport trouvé. Complète l'onboarding pour initialiser ton passeport projet.</p>
          <Link to="/onboarding" className={styles.actionLink}>Commencer l'onboarding</Link>
        </div>
      )}
    </div>
  );
}
