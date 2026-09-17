import { useState, useEffect, useCallback, useRef } from 'react';
import styles from './NotificationBell.module.css';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

const TYPE_ICONS = {
  mission_validated:   '✓',
  correction_requested:'↩',
  lab_reminder:        '⬡',
  prelab_reminder:     '⬡',
  support_response:    '◎',
  elite_appointment:   '◆',
  admin_notice:        '⚑',
};

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "À l'instant";
  if (m < 60) return `Il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `Il y a ${h}h`;
  const d = Math.floor(h / 24);
  return `Il y a ${d}j`;
}

export function NotificationBell() {
  const [data, setData] = useState({ unread: 0, items: [] });
  const [open, setOpen] = useState(false);
  const panelRef = useRef(null);

  const load = useCallback(() => {
    fetch(`${API}/api/notifications`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setData(d); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 60_000); // poll every 60s — no websocket needed at this scale
    return () => clearInterval(id);
  }, [load]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = e => { if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const markRead = async id => {
    await fetch(`${API}/api/notifications/${id}/read`, { method: 'POST', credentials: 'include' });
    setData(d => ({
      unread: Math.max(0, d.unread - (d.items.find(n => n.id === id)?.read === 0 ? 1 : 0)),
      items: d.items.map(n => n.id === id ? { ...n, read: 1 } : n),
    }));
  };

  const markAll = async () => {
    await fetch(`${API}/api/notifications/read-all`, { method: 'POST', credentials: 'include' });
    setData(d => ({ unread: 0, items: d.items.map(n => ({ ...n, read: 1 })) }));
  };

  const handleOpen = () => {
    setOpen(o => !o);
    if (!open && data.unread > 0) markAll();
  };

  return (
    <div className={styles.wrapper} ref={panelRef}>
      <button
        className={styles.bell}
        onClick={handleOpen}
        aria-label={`Notifications${data.unread > 0 ? ` — ${data.unread} non lues` : ''}`}
        aria-expanded={open}
      >
        <span className={styles.bellIcon} aria-hidden="true">◎</span>
        {data.unread > 0 && (
          <span className={styles.badge} aria-hidden="true">
            {data.unread > 9 ? '9+' : data.unread}
          </span>
        )}
      </button>

      {open && (
        <div className={styles.panel} role="menu" aria-label="Notifications">
          <div className={styles.panelHead}>
            <span className={styles.panelTitle}>Notifications</span>
            {data.unread > 0 && (
              <button className={styles.markAllBtn} onClick={markAll}>Tout marquer lu</button>
            )}
          </div>

          {data.items.length === 0 ? (
            <p className={styles.empty}>Aucune notification pour l'instant.</p>
          ) : (
            <ul className={styles.list} role="list">
              {data.items.map(n => (
                <li key={n.id}
                  className={`${styles.item} ${n.read === 0 ? styles.unread : ''}`}
                  role="menuitem"
                  onClick={() => !n.read && markRead(n.id)}
                >
                  <span className={styles.itemIcon} aria-hidden="true">
                    {TYPE_ICONS[n.type] ?? '◎'}
                  </span>
                  <div className={styles.itemBody}>
                    <p className={styles.itemTitle}>{n.title}</p>
                    {n.body && (() => {
                      // Strip lab_id prefix from prelab_reminder body
                      const body = n.type === 'prelab_reminder' ? n.body.split('|').slice(1).join('|') : n.body;
                      return <p className={styles.itemDesc}>{body}</p>;
                    })()}
                    <span className={styles.itemTime}>{timeAgo(n.created_at)}</span>
                  </div>
                  {n.read === 0 && <span className={styles.dot} aria-hidden="true" />}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
