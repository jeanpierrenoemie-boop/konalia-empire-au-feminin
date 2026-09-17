import styles from './LastMarketAction.module.css';

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
}

export function LastMarketAction({ action }) {
  if (!action) return null;

  const isConversation = action.kind === 'conversation';

  return (
    <div className={styles.wrapper}>
      <span className={styles.label}>Dernière action terrain</span>
      <div className={styles.card}>
        <div className={styles.header}>
          <span className={styles.kind}>{isConversation ? 'Conversation' : 'Contact'}</span>
          <span className={styles.date}>{formatDate(action.created_at)}</span>
        </div>
        <p className={styles.name}>
          {isConversation ? action.title : action.name}
        </p>
        {!isConversation && action.status && (
          <span className={styles.status}>{action.status}</span>
        )}
        {isConversation && action.format && (
          <span className={styles.status}>{action.format}</span>
        )}
      </div>
    </div>
  );
}
