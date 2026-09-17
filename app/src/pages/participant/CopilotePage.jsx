import { EmptyState } from '../../components/states/EmptyState';
import styles from './Page.module.css';

const COPILOTE_MISSIONS = [
  'CLARIFIER',
  'DIAGNOSTIQUER',
  'CARTOGRAPHIER',
  'PRIORISER',
  'FAIRE AVANCER',
  'MÉMORISER LES DÉCISIONS',
  'REPILOTER',
];

export function CopilotePage() {
  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>COPILOTE</h1>
      </div>
      <div className={styles.cadreSection}>
        <p className={styles.sectionLabel}>Missions du COPILOTE</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
          {COPILOTE_MISSIONS.map(m => (
            <span key={m} style={{
              fontSize: 'var(--text-xs)',
              padding: 'var(--space-1) var(--space-3)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-full)',
              color: 'var(--color-text-muted)',
              letterSpacing: '0.04em',
            }}>{m}</span>
          ))}
        </div>
      </div>
      <EmptyState
        title="COPILOTE non encore actif"
        description="Ton IA de navigation stratégique sera disponible dans un prochain build."
      />
    </div>
  );
}
