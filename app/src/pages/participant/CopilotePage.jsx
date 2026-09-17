import { useState, useRef, useEffect, useCallback } from 'react';
import { EmptyState } from '../../components/states/EmptyState';
import { useCopilote } from '../../hooks/useCopilote';
import styles from './CopilotePage.module.css';

const MISSIONS = [
  'CLARIFIER',
  'DIAGNOSTIQUER',
  'CARTOGRAPHIER',
  'PRIORISER',
  'FAIRE AVANCER',
  'MÉMORISER LES DÉCISIONS',
  'REPILOTER',
];

const SHORTCUTS = [
  { key: 'perdue',          label: 'Je suis perdue' },
  { key: 'trente_minutes',  label: "J'ai 30 minutes" },
  { key: 'challenge_offre', label: 'Challenge mon offre' },
  { key: 'analyse_retours', label: 'Analyse mes retours' },
  { key: 'nouvelle_idee',   label: "J'ai une nouvelle idée" },
  { key: 'ma_semaine',      label: 'Ma semaine' },
];

const UPDATE_LABELS = {
  valide_aujourd_hui:          "Valide aujourd'hui",
  passe_en_attente:            'Passe en attente',
  abandonne:                   'Abandonné',
  nouvelle_decision_suggestion:'Nouvelle décision (suggestion)',
  priorite_actuelle:           'Priorité actuelle',
  prochaine_action:            'Prochaine action',
  dependance:                  'Dépendance',
};

function UpdateBlock({ block, onApply }) {
  const [checked, setChecked] = useState(() => {
    const init = {};
    Object.keys(block).forEach(k => { init[k] = true; });
    return init;
  });
  const [applied, setApplied] = useState(false);
  const [applying, setApplying] = useState(false);

  const toggle = (k) => setChecked(prev => ({ ...prev, [k]: !prev[k] }));

  const handleApply = async () => {
    setApplying(true);
    const updates = {};
    if (checked.priorite_actuelle && block.priorite_actuelle) updates.current_priority = block.priorite_actuelle;
    if (checked.prochaine_action && block.prochaine_action) updates.next_action = block.prochaine_action;
    if (checked.dependance && block.dependance) updates.blocker = block.dependance;

    await onApply(updates);
    setApplied(true);
    setApplying(false);
  };

  const applyableKeys = ['priorite_actuelle', 'prochaine_action', 'dependance'];
  const hasApplyable = applyableKeys.some(k => block[k] && checked[k]);

  return (
    <div className={styles.updateBlock}>
      <p className={styles.updateTitle}>MISE À JOUR DU PILOTAGE</p>
      <div className={styles.updateItems}>
        {Object.entries(block).map(([k, v]) => (
          <label key={k} className={styles.updateItem}>
            <input
              type="checkbox"
              checked={!!checked[k]}
              onChange={() => toggle(k)}
              disabled={applied}
            />
            <span className={styles.updateKey}>{UPDATE_LABELS[k] ?? k} :</span>
            <span>{v}</span>
          </label>
        ))}
      </div>
      {!applied ? (
        <button
          className={styles.applyBtn}
          onClick={handleApply}
          disabled={applying || !hasApplyable}
        >
          {applying ? 'Application…' : 'Appliquer'}
        </button>
      ) : (
        <p className={styles.appliedNote}>Pilotage mis à jour ✓</p>
      )}
    </div>
  );
}

function Message({ msg, onApply }) {
  const isUser = msg.role === 'user';

  // Strip ```json ... ``` block from visible content
  const displayContent = msg.content.replace(/```json[\s\S]*?```/g, '').trim();

  return (
    <div className={`${styles.messageRow} ${isUser ? styles.user : styles.assistant}`}>
      <div className={`${styles.bubble} ${isUser ? styles.user : styles.assistant} ${msg.streaming ? styles.streaming : ''} ${msg.error ? styles.error : ''}`}>
        {displayContent}
        {!isUser && msg.update_block && !msg.streaming && (
          <UpdateBlock block={msg.update_block} onApply={onApply} />
        )}
      </div>
    </div>
  );
}

export function CopilotePage() {
  const { messages, sending, sendMessage, applyUpdate, unavailable } = useCopilote();
  const [input, setInput] = useState('');
  const [activeShortcut, setActiveShortcut] = useState('general');
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    await sendMessage(text, activeShortcut);
  }, [input, sending, sendMessage, activeShortcut]);

  const handleShortcut = useCallback(async (key) => {
    setActiveShortcut(key);
    const label = SHORTCUTS.find(s => s.key === key)?.label ?? key;
    await sendMessage(label, key);
  }, [sendMessage]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (unavailable) {
    return (
      <div className={styles.unavailable}>
        <div className={styles.header}>
          <h1 className={styles.title}>COPILOTE</h1>
        </div>
        <div className={styles.missionStrip}>
          {MISSIONS.map(m => <span key={m} className={styles.missionChip}>{m}</span>)}
        </div>
        <EmptyState
          title="COPILOTE non disponible"
          description="L'IA n'est pas configurée. Les autres fonctionnalités restent accessibles."
        />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>COPILOTE</h1>
      </div>

      <div className={styles.missionStrip}>
        {MISSIONS.map(m => <span key={m} className={styles.missionChip}>{m}</span>)}
      </div>

      <div className={styles.shortcuts}>
        {SHORTCUTS.map(({ key, label }) => (
          <button
            key={key}
            className={styles.shortcut}
            onClick={() => handleShortcut(key)}
            disabled={sending}
          >
            {label}
          </button>
        ))}
      </div>

      <div className={styles.messages}>
        {messages.map(msg => (
          <Message key={msg.id} msg={msg} onApply={applyUpdate} />
        ))}
        <div ref={bottomRef} />
      </div>

      <div className={styles.inputArea}>
        <textarea
          ref={textareaRef}
          className={styles.textarea}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Écris ton message…"
          rows={1}
          disabled={sending}
        />
        <button
          className={styles.sendBtn}
          onClick={handleSend}
          disabled={!input.trim() || sending}
        >
          {sending ? '…' : 'Envoyer'}
        </button>
      </div>
    </div>
  );
}
