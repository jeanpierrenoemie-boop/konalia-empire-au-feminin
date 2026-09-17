import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { LoadingState } from '../../components/states/LoadingState';
import { ErrorState } from '../../components/states/ErrorState';
import styles from './ElitePage.module.css';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

function useElite() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`${API}/api/elite`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject('Erreur de chargement'))
      .then(setData)
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);
  return { data, loading, error, reload: load };
}

const POINT_LABELS = {
  1: 'Ta Direction',
  2: 'Ton Offre face au réel',
  3: 'La Suite',
};

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
}

function PointCard({ number, sessions }) {
  const session = sessions.find(s => s.point_number === number);
  const done = session?.status === 'done';
  return (
    <div className={`${styles.pointCard} ${done ? styles.pointDone : ''}`}>
      <div className={styles.pointNumber}>{number}</div>
      <div className={styles.pointBody}>
        <p className={styles.pointTitle}>{POINT_LABELS[number]}</p>
        {session ? (
          <>
            <p className={styles.pointDate}>
              {done ? '✓ Complété' : `Prévu ${formatDate(session.scheduled_at)}`}
            </p>
            {session.notes && <p className={styles.pointNotes}>{session.notes}</p>}
          </>
        ) : (
          <p className={styles.pointDate}>À planifier</p>
        )}
      </div>
    </div>
  );
}

export function ElitePage() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useElite();

  if (loading) return <LoadingState label="Chargement de l'espace ELITE…" />;
  if (error) return <ErrorState title="Erreur de chargement" message={error} onRetry={reload} />;

  const { sessions = [], revues = [], points = [], total_points = 0 } = data ?? {};

  const nextRevue = revues.find(r => r.status === 'pending');

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Mes Points ELITE</h1>
        <span className={styles.eliteBadge}>ELITE</span>
      </div>

      <div className={styles.scoreBar}>
        <span className={styles.scoreLabel}>Total de points ELITE</span>
        <span className={styles.scoreValue}>{total_points}</span>
      </div>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Tes 3 Points ELITE</h2>
        <div className={styles.points}>
          {[1, 2, 3].map(n => <PointCard key={n} number={n} sessions={sessions} />)}
        </div>
      </section>

      {nextRevue && (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Revue Prioritaire ELITE</h2>
          <p className={styles.revueDate}>
            Prochaine revue : {formatDate(nextRevue.scheduled_at)}
          </p>
          {nextRevue.notes && <p className={styles.revueNotes}>{nextRevue.notes}</p>}
        </section>
      )}

      {points.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Historique des points</h2>
          <ul className={styles.pointHistory}>
            {points.map(p => (
              <li key={p.id} className={styles.pointHistoryItem}>
                <span className={styles.pointHistoryPoints}>+{p.points}</span>
                <span className={styles.pointHistoryReason}>{p.reason}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
