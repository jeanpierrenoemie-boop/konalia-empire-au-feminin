import styles from './States.module.css';

export function EmptyState({ title = 'Rien ici pour l\'instant', description, action }) {
  return (
    <div className={styles.container}>
      <div className={styles.emptyIcon}>◇</div>
      <p className={styles.title}>{title}</p>
      {description && <p className={styles.description}>{description}</p>}
      {action && <div className={styles.actionSlot}>{action}</div>}
    </div>
  );
}
