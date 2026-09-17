import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { useCockpit } from './useCockpit';
import { LoadingState } from '../../components/states/LoadingState';
import { ErrorState } from '../../components/states/ErrorState';
import { SignalerModal } from '../../components/frictions/SignalerModal';
import { CadreHeader } from './cockpit/CadreHeader';
import { PilotageBlock } from './cockpit/PilotageBlock';
import { MissionBlock } from './cockpit/MissionBlock';
import { ProofsBar } from './cockpit/ProofsBar';
import { LastDecision } from './cockpit/LastDecision';
import { LastMarketAction } from './cockpit/LastMarketAction';
import { PasMaintenantBlock } from './cockpit/PasMaintenantBlock';
import { CockpitCTA } from './cockpit/CockpitCTA';
import styles from './CockpitPage.module.css';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

function WeeklyReviewBlock() {
  const [state, setState] = useState(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ wins: '', blockers: '', next_week_focus: '', energy_level: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const load = useCallback(() => {
    fetch(`${API}/api/weekly-review/current`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d) {
          setState(d);
          if (d.review) {
            setForm({
              wins: d.review.wins ?? '',
              blockers: d.review.blockers ?? '',
              next_week_focus: d.review.next_week_focus ?? '',
              energy_level: d.review.energy_level ?? '',
            });
          }
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  const submitted = state?.review?.status === 'submitted';

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true); setErr(null);
    try {
      const body = { ...form, energy_level: form.energy_level ? Number(form.energy_level) : null };
      const r = await fetch(`${API}/api/weekly-review`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) { setErr(data.error ?? 'Erreur'); return; }
      load();
    } catch { setErr('Erreur réseau'); }
    finally { setSaving(false); }
  }

  async function handleSubmit() {
    if (!state?.review?.id) return;
    setSaving(true); setErr(null);
    try {
      const r = await fetch(`${API}/api/weekly-review/${state.review.id}/submit`, {
        method: 'POST', credentials: 'include',
      });
      if (!r.ok) { const d = await r.json(); setErr(d.error ?? 'Erreur'); return; }
      load();
    } catch { setErr('Erreur réseau'); }
    finally { setSaving(false); }
  }

  if (!state) return null;

  return (
    <section className={styles.reviewBlock}>
      <button className={styles.reviewHeader} onClick={() => setOpen(o => !o)}>
        <span className={styles.reviewTitle}>Ma semaine sous contrôle</span>
        <span className={styles.reviewMeta}>
          {submitted
            ? <span className={styles.reviewBadgeOk}>Soumise ✓</span>
            : state.review ? <span className={styles.reviewBadgeDraft}>Brouillon</span>
            : <span className={styles.reviewBadgeEmpty}>À remplir</span>
          }
        </span>
        <span>{open ? '▲' : '▼'}</span>
      </button>

      {open && !submitted && (
        <form className={styles.reviewForm} onSubmit={handleSave}>
          <label className={styles.reviewField}>
            <span>Ce que j'ai avancé cette semaine</span>
            <textarea rows={2} value={form.wins} onChange={e => setForm(f => ({...f, wins: e.target.value}))} />
          </label>
          <label className={styles.reviewField}>
            <span>Décision prise</span>
            <textarea rows={2} value={form.blockers} onChange={e => setForm(f => ({...f, blockers: e.target.value}))} placeholder="Blocage ou décision clé" />
          </label>
          <label className={styles.reviewField}>
            <span>Priorité / prochaine action pour la semaine à venir</span>
            <textarea rows={2} value={form.next_week_focus} onChange={e => setForm(f => ({...f, next_week_focus: e.target.value}))} />
          </label>
          <label className={styles.reviewField}>
            <span>Niveau d'énergie (1–5)</span>
            <select value={form.energy_level} onChange={e => setForm(f => ({...f, energy_level: e.target.value}))}>
              <option value="">—</option>
              {[1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          {err && <p className={styles.reviewErr}>{err}</p>}
          <div className={styles.reviewActions}>
            <button type="submit" className={styles.reviewSaveBtn} disabled={saving}>
              {saving ? 'Sauvegarde…' : 'Sauvegarder'}
            </button>
            {state.review && (
              <button type="button" className={styles.reviewSubmitBtn} disabled={saving} onClick={handleSubmit}>
                Soumettre la revue
              </button>
            )}
          </div>
        </form>
      )}

      {open && submitted && (
        <div className={styles.reviewDone}>
          <p>✓ Revue soumise pour le sprint {state.sprint_number}, semaine {state.week_number}.</p>
          {state.review.wins && <p>« {state.review.wins} »</p>}
        </div>
      )}
    </section>
  );
}

export function CockpitPage() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useCockpit();
  const [signalerOpen, setSignalerOpen] = useState(false);

  if (loading) return <LoadingState label="Chargement du cockpit…" />;
  if (error)   return <ErrorState title="Erreur de chargement" message={error} onRetry={reload} />;

  const {
    progress, pilotage, currentMission,
    proofs, totalProofs,
    lastDecision, lastMarketAction,
    parkingCount, agirMaintenantCount, openSupportCount,
  } = data ?? {};

  return (
    <div className={styles.page}>
      {/* Page title */}
      <div className={styles.pageHeader}>
        <h1 className={styles.greeting}>
          {greeting(user?.first_name)}
        </h1>
      </div>

      {/* 1. Où j'en suis — C.A.D.R.E. phase + semaine */}
      <CadreHeader progress={progress} />

      {/* 2+3+4+5 — Priorité / Raison / Prochaine action / Blocage */}
      <PilotageBlock pilotage={pilotage} />

      {/* Mission en cours */}
      <MissionBlock mission={currentMission} />

      {/* Preuves */}
      <ProofsBar proofs={proofs ?? []} total={totalProofs ?? 0} />

      {/* Dernière décision */}
      <LastDecision decision={lastDecision} />

      {/* Dernière action marché */}
      <LastMarketAction action={lastMarketAction} />

      {/* PAS MAINTENANT */}
      <PasMaintenantBlock
        pilotage={pilotage}
        parkingCount={parkingCount ?? 0}
        agirMaintenantCount={agirMaintenantCount ?? 0}
      />

      {/* Weekly review */}
      <WeeklyReviewBlock />

      {/* CTA fixes */}
      <CockpitCTA openSupportCount={openSupportCount ?? 0} onSignaler={() => setSignalerOpen(true)} />
      {signalerOpen && <SignalerModal onClose={() => setSignalerOpen(false)} />}
    </div>
  );
}

function greeting(firstName) {
  const hour = new Date().getHours();
  const salut = hour < 18 ? 'Bonjour' : 'Bonsoir';
  return firstName ? `${salut}, ${firstName}.` : `${salut}.`;
}
