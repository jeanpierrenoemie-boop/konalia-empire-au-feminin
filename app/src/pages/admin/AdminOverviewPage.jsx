import { useState, useEffect, useCallback } from 'react';
import { LoadingState } from '../../components/states/LoadingState';
import { ErrorState } from '../../components/states/ErrorState';
import styles from './AdminPage.module.css';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

function useCockpit() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`${API}/api/admin/cockpit`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject('Erreur'))
      .then(setData)
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);
  return { data, loading, error, reload: load };
}

const SEGMENT_LABELS = {
  ROUGE: { label: 'ROUGE', color: '#dc2626' },
  ORANGE: { label: 'ORANGE', color: '#d97706' },
  VALIDATION: { label: 'VALIDATION', color: '#2563eb' },
  ELITE: { label: 'ELITE', color: '#7c3aed' },
  PRE_LABS: { label: 'PRÉ-LAB', color: '#0891b2' },
  FRICTION: { label: 'FRICTION', color: '#9333ea' },
  OK: { label: 'OK', color: '#16a34a' },
};

function SegmentBadge({ segment }) {
  const s = SEGMENT_LABELS[segment] ?? { label: segment, color: '#6b7280' };
  return (
    <span className={styles.badge} style={{ '--badge-color': s.color }}>
      {s.label}
    </span>
  );
}

/* ── Participant Detail Panel ─────────────────────────────────────── */
function ParticipantDetail({ userId, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');

  useEffect(() => {
    fetch(`${API}/api/admin/participant/${userId}`, { credentials: 'include' })
      .then(r => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [userId]);

  if (loading) return <div className={styles.panel}><LoadingState label="Chargement…" /></div>;
  if (!data) return null;

  const { user, decisions, gateLog, overrides, frictions, interventions, prelabs } = data;

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <h2 className={styles.panelName}>{user.first_name}</h2>
          <p className={styles.panelMeta}>{user.email} · {user.tier} · {user.cohort_name}</p>
        </div>
        <button className={styles.closeBtn} onClick={onClose}>✕</button>
      </div>

      <div className={styles.tabs}>
        {['overview', 'historique', 'actions'].map(t => (
          <button key={t} className={`${styles.tab} ${tab === t ? styles.tabActive : ''}`} onClick={() => setTab(t)}>
            {t === 'overview' ? 'Vue d\'ensemble' : t === 'historique' ? 'Historique' : 'Actions'}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className={styles.tabContent}>
          <div className={styles.infoGrid}>
            <InfoRow label="Phase" value={user.cadre_step ?? '—'} />
            <InfoRow label="Sprint" value={user.sprint_number ?? '—'} />
            <InfoRow label="Semaine" value={user.week_in_sprint ?? '—'} />
            <InfoRow label="Statut gate" value={user.gate_status ?? '—'} />
            <InfoRow label="Priorité actuelle" value={user.current_priority ?? '—'} />
            <InfoRow label="Prochaine action" value={user.next_action ?? '—'} />
            <InfoRow label="Blocage" value={user.blocker ?? '—'} />
          </div>
          {prelabs.length > 0 && (
            <div className={styles.subSection}>
              <h3 className={styles.subTitle}>Dernière question prioritaire</h3>
              <p className={styles.prelabQ}>« {prelabs[0].priority_question} »</p>
              <p className={styles.prelabMeta}>{prelabs[0].lab_title}</p>
            </div>
          )}
        </div>
      )}

      {tab === 'historique' && (
        <div className={styles.tabContent}>
          {decisions.length > 0 && (
            <div className={styles.subSection}>
              <h3 className={styles.subTitle}>Dernières décisions</h3>
              <ul className={styles.list}>
                {decisions.map(d => (
                  <li key={d.id} className={styles.listItem}>
                    <span className={styles.listMain}>{d.title}</span>
                    <span className={styles.listMeta}>{d.decision_type} · {d.status}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {gateLog.length > 0 && (
            <div className={styles.subSection}>
              <h3 className={styles.subTitle}>Gates franchies</h3>
              <ul className={styles.list}>
                {gateLog.map(g => (
                  <li key={g.id} className={styles.listItem}>
                    <span className={styles.listMain}>Sprint {g.sprint_number}</span>
                    <span className={styles.listMeta}>{g.method} · {g.passed_at?.slice(0, 10)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {frictions.length > 0 && (
            <div className={styles.subSection}>
              <h3 className={styles.subTitle}>Frictions signalées</h3>
              <ul className={styles.list}>
                {frictions.map(f => (
                  <li key={f.id} className={styles.listItem}>
                    <span className={styles.listMain}>{f.friction}</span>
                    <span className={styles.listMeta}>{f.category}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {tab === 'actions' && (
        <div className={styles.tabContent}>
          <OverrideForm userId={userId} />
          <InterventionForm userId={userId} />
          {interventions.length > 0 && (
            <div className={styles.subSection}>
              <h3 className={styles.subTitle}>Interventions passées</h3>
              <ul className={styles.list}>
                {interventions.map(i => (
                  <li key={i.id} className={styles.listItem}>
                    <span className={styles.listMain}>{i.type}</span>
                    <span className={styles.listMeta}>{i.actor_name} · {i.created_at?.slice(0, 10)}</span>
                    {i.note && <p className={styles.listNote}>{i.note}</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {overrides.length > 0 && (
            <div className={styles.subSection}>
              <h3 className={styles.subTitle}>Overrides de gate</h3>
              <ul className={styles.list}>
                {overrides.map(o => (
                  <li key={o.id} className={styles.listItem}>
                    <span className={styles.listMain}>Sprint {o.sprint_number} — {o.exception_type}</span>
                    <p className={styles.listNote}>{o.reason}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className={styles.infoRow}>
      <span className={styles.infoLabel}>{label}</span>
      <span className={styles.infoValue}>{value}</span>
    </div>
  );
}

function OverrideForm({ userId }) {
  const [form, setForm] = useState({ sprint_number: '', exception_type: 'VERT', reason: '' });
  const [status, setStatus] = useState(null);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async e => {
    e.preventDefault();
    setStatus('saving');
    const r = await fetch(`${API}/api/admin/gate-override`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, ...form, sprint_number: Number(form.sprint_number) }),
    });
    const body = await r.json();
    setStatus(r.ok ? 'ok' : body.error ?? 'Erreur');
    if (r.ok) setForm({ sprint_number: '', exception_type: 'VERT', reason: '' });
  };

  return (
    <form className={styles.actionForm} onSubmit={submit}>
      <h3 className={styles.subTitle}>Override de gate</h3>
      <div className={styles.formRow}>
        <input
          type="number" min="1" max="12" placeholder="Sprint #" required
          value={form.sprint_number} onChange={e => set('sprint_number', e.target.value)}
          className={styles.input}
        />
        <select value={form.exception_type} onChange={e => set('exception_type', e.target.value)} className={styles.input}>
          <option value="VERT">VERT</option>
          <option value="ORANGE">ORANGE</option>
        </select>
      </div>
      <textarea
        rows={2} required placeholder="Raison (min. 10 caractères)" className={styles.textarea}
        value={form.reason} onChange={e => set('reason', e.target.value)}
      />
      <button type="submit" className={styles.actionBtn} disabled={status === 'saving'}>
        {status === 'saving' ? 'Envoi…' : 'Appliquer l\'override'}
      </button>
      {status === 'ok' && <p className={styles.ok}>Override enregistré ✓</p>}
      {status && status !== 'saving' && status !== 'ok' && <p className={styles.err}>{status}</p>}
    </form>
  );
}

function InterventionForm({ userId }) {
  const [form, setForm] = useState({ type: 'support', note: '' });
  const [status, setStatus] = useState(null);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async e => {
    e.preventDefault();
    setStatus('saving');
    const r = await fetch(`${API}/api/admin/intervention`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_user_id: userId, ...form }),
    });
    const body = await r.json();
    setStatus(r.ok ? 'ok' : body.error ?? 'Erreur');
    if (r.ok) setForm({ type: 'support', note: '' });
  };

  return (
    <form className={styles.actionForm} onSubmit={submit}>
      <h3 className={styles.subTitle}>Enregistrer une intervention</h3>
      <select value={form.type} onChange={e => set('type', e.target.value)} className={styles.input}>
        <option value="support">Support</option>
        <option value="note">Note</option>
        <option value="correction_request">Demande de correction</option>
        <option value="elite_point">Point ELITE</option>
      </select>
      <textarea
        rows={2} placeholder="Note optionnelle" className={styles.textarea}
        value={form.note} onChange={e => set('note', e.target.value)}
      />
      <button type="submit" className={styles.actionBtn} disabled={status === 'saving'}>
        {status === 'saving' ? 'Envoi…' : 'Enregistrer'}
      </button>
      {status === 'ok' && <p className={styles.ok}>Intervention enregistrée ✓</p>}
      {status && status !== 'saving' && status !== 'ok' && <p className={styles.err}>{status}</p>}
    </form>
  );
}

/* ── Main page ────────────────────────────────────────────────────── */
function SubmissionsPanel() {
  const [submissions, setSubmissions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [note, setNote] = useState('');
  const [acting, setActing] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`${API}/api/admin/submissions?status=submitted`, { credentials: 'include' })
      .then(r => r.json())
      .then(data => { setSubmissions(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => { setSubmissions([]); setLoading(false); });
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleReview(id, decision) {
    setActing(id);
    await fetch(`${API}/api/admin/submissions/${id}/review`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision, note: note.trim() || undefined }),
    });
    setNote('');
    setExpanded(null);
    setActing(null);
    load();
  }

  if (loading) return <div style={{ padding: '12px', color: '#666' }}>Chargement des livrables…</div>;

  const count = submissions?.length ?? 0;

  return (
    <div style={{ marginBottom: '24px', border: '1px solid #e0e0e0', borderRadius: '8px', overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', background: '#f5f5f5', display: 'flex', alignItems: 'center', gap: '10px', borderBottom: count > 0 ? '1px solid #e0e0e0' : 'none' }}>
        <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>Livrables à valider</h2>
        {count > 0 && (
          <span style={{ background: '#c62828', color: '#fff', borderRadius: '12px', padding: '2px 8px', fontSize: '12px', fontWeight: 700 }}>
            {count}
          </span>
        )}
      </div>
      {count === 0 && (
        <p style={{ padding: '12px 16px', margin: 0, color: '#666', fontSize: '14px' }}>Aucun livrable en attente.</p>
      )}
      {submissions?.map(s => (
        <div key={s.id} style={{ borderBottom: '1px solid #eee', padding: '12px 16px' }}>
          <button
            style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%' }}
            onClick={() => { setExpanded(expanded === s.id ? null : s.id); setNote(''); }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontWeight: 600 }}>{s.first_name}</span>
                <span style={{ color: '#555', marginLeft: '8px', fontSize: '13px' }}>{s.mission_title}</span>
                <span style={{ color: '#888', marginLeft: '8px', fontSize: '12px' }}>S{s.sprint_number} · {s.cadre_step}</span>
              </div>
              <span style={{ fontSize: '12px', color: '#888' }}>
                {new Date(s.created_at).toLocaleDateString('fr-FR')}
              </span>
            </div>
          </button>
          {expanded === s.id && (
            <div style={{ marginTop: '10px' }}>
              <div style={{ background: '#fff', border: '1px solid #ddd', borderRadius: '4px', padding: '10px', fontSize: '13px', whiteSpace: 'pre-wrap', marginBottom: '10px' }}>
                {s.content || <em>Pas de contenu</em>}
              </div>
              <textarea
                style={{ width: '100%', minHeight: '60px', padding: '6px', fontSize: '13px', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box', resize: 'vertical' }}
                placeholder="Note optionnelle pour la participante…"
                value={note}
                onChange={e => setNote(e.target.value)}
              />
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <button
                  style={{ padding: '6px 14px', background: '#2e7d32', color: '#fff', border: 'none', borderRadius: '4px', cursor: acting === s.id ? 'not-allowed' : 'pointer', fontSize: '13px' }}
                  disabled={acting === s.id}
                  onClick={() => handleReview(s.id, 'approved')}
                >
                  Valider
                </button>
                <button
                  style={{ padding: '6px 14px', background: '#e65100', color: '#fff', border: 'none', borderRadius: '4px', cursor: acting === s.id ? 'not-allowed' : 'pointer', fontSize: '13px' }}
                  disabled={acting === s.id}
                  onClick={() => handleReview(s.id, 'rejected')}
                >
                  Demander correction
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function AdminOverviewPage() {
  const { data, loading, error, reload } = useCockpit();
  const [selected, setSelected] = useState(null);

  if (loading) return <LoadingState label="Chargement du cockpit…" />;
  if (error) return <ErrorState title="Erreur de chargement" message={error} onRetry={reload} />;

  const { participants = [] } = data ?? {};

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Cockpit Admin</h1>
        <p className={styles.subtitle}>{participants.length} participante{participants.length !== 1 ? 's' : ''}</p>
      </div>

      <SubmissionsPanel />

      <div className={styles.layout}>
        <div className={styles.list}>
          {participants.map(p => (
            <button
              key={p.id}
              className={`${styles.row} ${selected === p.id ? styles.rowSelected : ''}`}
              onClick={() => setSelected(selected === p.id ? null : p.id)}
            >
              <div className={styles.rowMain}>
                <span className={styles.rowName}>{p.first_name}</span>
                <SegmentBadge segment={p.segment} />
              </div>
              <div className={styles.rowMeta}>
                <span>{p.cohort_name}</span>
                <span>{p.cadre_step ?? '—'} / S{p.sprint_number ?? '—'}</span>
                {p.next_lab?.priority_question && (
                  <span className={styles.labQ}>❓ {p.next_lab.priority_question.slice(0, 60)}…</span>
                )}
              </div>
              {p.current_priority && (
                <p className={styles.rowPriority}>{p.current_priority}</p>
              )}
            </button>
          ))}
          {participants.length === 0 && (
            <p className={styles.empty}>Aucune participante inscrite.</p>
          )}
        </div>

        {selected && (
          <ParticipantDetail
            userId={selected}
            onClose={() => setSelected(null)}
          />
        )}
      </div>
    </div>
  );
}
