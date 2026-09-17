import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { LoadingState } from '../../components/states/LoadingState';
import { ErrorState } from '../../components/states/ErrorState';
import styles from './PreuvesPage.module.css';
import pageStyles from './Page.module.css';

const SECTIONS = [
  { key: '01_ma_direction',      number: '01', name: 'Ma Direction' },
  { key: '02_mon_offre_test',    number: '02', name: 'Mon Offre Test' },
  { key: '03_mon_rapport_terrain', number: '03', name: 'Mon Rapport Terrain' },
  { key: '04_mon_bilan_controle', number: '04', name: 'Mon Bilan de Contrôle' },
  { key: '05_mon_plan_continuite', number: '05', name: 'Mon Plan de Continuité 90' },
];

function CompletenessRing({ value }) {
  const color = value >= 80 ? 'vert' : value >= 40 ? 'orange' : 'rouge';
  return (
    <span className={`${styles.ring} ${styles[`ring_${color}`]}`} title={`${value}%`}>
      {value}%
    </span>
  );
}

/* ── Section: 01 Ma Direction ── */
function DirectionSection({ data }) {
  const p = data.passport_snapshot;
  return (
    <div className={styles.sectionBody}>
      {p && (
        <div className={styles.snapshot}>
          <Row label="Projet" value={p.project_name} />
          <Row label="Vision J+90" value={p.vision} />
          <Row label="Cible" value={p.target_persona} />
          <Row label="Problème" value={p.core_problem} />
        </div>
      )}
      {data.strategic_decisions.length > 0 && (
        <div className={styles.decisionList}>
          <span className={styles.subLabel}>Décisions actives</span>
          {data.strategic_decisions.map(d => (
            <div key={d.id} className={styles.miniDecision}>
              <span className={styles.miniType}>{d.decision_type}</span>
              <span>{d.title}</span>
            </div>
          ))}
        </div>
      )}
      {!p && data.strategic_decisions.length === 0 && (
        <EmptyHint text="Complète l'onboarding et enregistre tes premières décisions pour construire cette preuve." />
      )}
    </div>
  );
}

/* ── Section: 02 Mon Offre Test ── */
function OffreTestSection({ data }) {
  const o = data.offer_snapshot;
  return (
    <div className={styles.sectionBody}>
      {o && (
        <div className={styles.snapshot}>
          <Row label="Solution proposée" value={o.proposed_solution} />
          <Row label="Modèle de revenus" value={o.revenue_model} />
        </div>
      )}
      {data.decisions.length > 0 && (
        <div className={styles.decisionList}>
          <span className={styles.subLabel}>Décisions projet / revenus</span>
          {data.decisions.map(d => (
            <div key={d.id} className={styles.miniDecision}>
              <span className={styles.miniType}>{d.decision_type}</span>
              <span>{d.title}</span>
            </div>
          ))}
        </div>
      )}
      <CountRow label="Preuves étape D" count={data.proofs.length} />
      <CountRow label="Missions soumises (D)" count={data.mission_submissions.length} />
      {!o?.proposed_solution && data.decisions.length === 0 && (
        <EmptyHint text="Définis ton offre au Sprint 6 et documente tes tests de validation." />
      )}
    </div>
  );
}

/* ── Section: 03 Mon Rapport Terrain ── */
function RapportTerrainSection({ data }) {
  return (
    <div className={styles.sectionBody}>
      <div className={styles.statsRow}>
        <Stat label="Contacts" value={data.contacts.total} />
        <Stat label="Actifs" value={data.contacts.active} />
        <Stat label="Conversations" value={data.conversations.total} />
        <Stat label="Signaux" value={data.signals.total} />
      </div>
      {data.conversations.list.length > 0 && (
        <div className={styles.convList}>
          <span className={styles.subLabel}>Dernières conversations</span>
          {data.conversations.list.slice(0, 5).map(c => (
            <div key={c.id} className={styles.convRow}>
              <span className={styles.convName}>{c.contact_name ?? '—'}</span>
              <span className={styles.convTitle}>{c.title}</span>
              <span className={styles.convDate}>{formatDate(c.date_occurred)}</span>
            </div>
          ))}
        </div>
      )}
      {data.contacts.total === 0 && (
        <EmptyHint text="Commence à contacter de vraies personnes au Sprint 8 pour construire cette preuve." />
      )}
    </div>
  );
}

/* ── Section: 04 Mon Bilan de Contrôle ── */
function BilanControleSection({ data }) {
  return (
    <div className={styles.sectionBody}>
      <div className={styles.statsRow}>
        <Stat label="Sprint actuel" value={data.current_sprint ?? '—'} />
        <Stat label="Étape" value={data.current_cadre_step ?? '—'} />
        <Stat label="Sprints validés" value={data.passed_sprints.length} />
        <Stat label="Bilans soumis" value={data.weekly_reviews.length} />
      </div>
      {data.passed_sprints.length > 0 && (
        <div className={styles.sprintBadges}>
          {data.passed_sprints.map(s => (
            <span key={s.sprint_number} className={styles.sprintBadge}>S{s.sprint_number}</span>
          ))}
        </div>
      )}
      {data.go_nogo_decisions.length > 0 && (
        <div className={styles.decisionList}>
          <span className={styles.subLabel}>Décisions Go / No-Go</span>
          {data.go_nogo_decisions.map(d => (
            <div key={d.id} className={styles.miniDecision}>
              <span className={styles.miniType}>{d.status === 'active' ? 'Active' : 'Archivée'}</span>
              <span>{d.title}</span>
            </div>
          ))}
        </div>
      )}
      {data.current_sprint == null && (
        <EmptyHint text="Ta progression apparaîtra ici au fur et à mesure que tu avances dans le parcours." />
      )}
    </div>
  );
}

/* ── Section: 05 Mon Plan de Continuité 90 ── */
function PlanContinuiteSection({ data }) {
  return (
    <div className={styles.sectionBody}>
      {data.objective_j90 && (
        <div className={styles.snapshot}>
          <Row label="Objectif J+90" value={data.objective_j90} />
        </div>
      )}
      {data.pilotage && (
        <div className={styles.snapshot}>
          <Row label="Priorité actuelle" value={data.pilotage.current_priority} />
          <Row label="Prochaine action" value={data.pilotage.next_action} />
        </div>
      )}
      <CountRow label="Décisions actives" count={data.active_decisions.length} />
      {data.sprint_12_submission && (
        <div className={styles.completionNote}>
          Continuité 90 soumise — statut : {data.sprint_12_submission.status}
        </div>
      )}
      {!data.objective_j90 && (
        <EmptyHint text="Ceci sera le dernier onglet de ton Dossier — rempli au Sprint 12." />
      )}
    </div>
  );
}

/* ── Helper components ── */
function Row({ label, value }) {
  if (!value) return null;
  return (
    <div className={styles.row}>
      <span className={styles.rowLabel}>{label}</span>
      <span className={styles.rowValue}>{value}</span>
    </div>
  );
}

function CountRow({ label, count }) {
  return (
    <div className={styles.countRow}>
      <span>{label}</span>
      <span className={styles.count}>{count}</span>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className={styles.stat}>
      <span className={styles.statValue}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  );
}

function EmptyHint({ text }) {
  return <p className={styles.emptyHint}>{text}</p>;
}

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

const SECTION_BODIES = {
  '01_ma_direction': DirectionSection,
  '02_mon_offre_test': OffreTestSection,
  '03_mon_rapport_terrain': RapportTerrainSection,
  '04_mon_bilan_controle': BilanControleSection,
  '05_mon_plan_continuite': PlanContinuiteSection,
};

function ProofSection({ section, data }) {
  const [open, setOpen] = useState(section.key === '01_ma_direction');
  const Body = SECTION_BODIES[section.key];
  const color = data.completeness >= 80 ? 'vert' : data.completeness >= 40 ? 'orange' : 'rouge';

  return (
    <div className={`${styles.section} ${styles[`section_${color}`]}`}>
      <button className={styles.sectionHeader} onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <span className={styles.sectionNumber}>{section.number}</span>
        <span className={styles.sectionName}>{section.name}</span>
        <CompletenessRing value={data.completeness} />
        <span className={styles.chevron} aria-hidden>{open ? '▲' : '▼'}</span>
      </button>
      {open && Body && <Body data={data} />}
    </div>
  );
}

export function PreuvesPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [exporting, setExporting] = useState(false);

  async function load() {
    setLoading(true); setError(null);
    try {
      const r = await fetch('/api/preuves', { credentials: 'include' });
      if (!r.ok) throw new Error('Erreur chargement');
      setData(await r.json());
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const r = await fetch('/api/preuves/dossier', { credentials: 'include' });
      if (!r.ok) throw new Error('Erreur export');
      const json = await r.json();
      const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dossier-reprise-de-controle-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(e.message);
    } finally {
      setExporting(false);
    }
  }

  useEffect(() => { load(); }, []);

  if (loading) return <LoadingState />;
  if (error)   return <ErrorState message={error} onRetry={load} />;

  const overallCompleteness = data
    ? Math.round(Object.values(data).reduce((s, v) => s + (v.completeness ?? 0), 0) / Object.keys(data).length)
    : 0;

  return (
    <div className={pageStyles.page}>
      <div className={pageStyles.header}>
        <div>
          <h1 className={pageStyles.title}>Mes Preuves</h1>
          <p className={styles.subtitle}>
            Dossier Reprise de Contrôle — {overallCompleteness}% constitué
          </p>
        </div>
        <div className={styles.headerActions}>
          <Link to="/passeport" className={styles.headerLink}>Passeport →</Link>
          <Link to="/decisions" className={styles.headerLink}>Décisions →</Link>
        </div>
      </div>

      <div className={styles.sections}>
        {SECTIONS.map(section => (
          <ProofSection
            key={section.key}
            section={section}
            data={data[section.key]}
          />
        ))}
      </div>

      <div className={styles.exportBlock}>
        <div className={styles.exportInfo}>
          <h3 className={styles.exportTitle}>Dossier Reprise de Contrôle</h3>
          <p className={styles.exportDesc}>
            Export structuré de l'ensemble de tes preuves, décisions et passeport.
            Format JSON — compatible avec tout outil de lecture. Export PDF disponible en version finale.
          </p>
        </div>
        <button className={styles.exportBtn} onClick={handleExport} disabled={exporting}>
          {exporting ? 'Préparation…' : 'Télécharger le dossier (.json)'}
        </button>
      </div>
    </div>
  );
}
