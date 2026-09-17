import { useState } from 'react';
import styles from './Step.module.css';
import pdStyles from './StepPointDeDepart.module.css';

/* ── Section definitions ─────────────────────────────────────── */
const SECTIONS = [
  {
    key: 'A',
    title: 'Mon projet aujourd\'hui',
    subtitle: 'Décris ce sur quoi tu travailles — ou ce à quoi tu penses.',
    fields: [
      { name: 'project_name', label: 'Nom provisoire du projet', type: 'text', placeholder: 'Ex : Coaching bien-être, boutique Etsy, consulting RH…', required: false },
      { name: 'core_problem', label: 'Quel problème veux-tu résoudre ?', type: 'textarea', placeholder: 'Décris le problème que tu observes ou que tu as vécu.', required: false },
      { name: 'target_persona', label: 'Pour qui ?', type: 'text', placeholder: 'Ex : femmes en reconversion, indépendants, parents…', required: false },
      { name: 'project_stage', label: 'Où en es-tu ?', type: 'select', required: true,
        options: [
          { value: '', label: 'Choisir…' },
          { value: 'idea', label: 'Juste une idée' },
          { value: 'exploring', label: 'J\'explore plusieurs pistes' },
          { value: 'testing', label: 'J\'ai déjà testé quelque chose' },
          { value: 'early_revenue', label: 'J\'ai déjà des premières ventes' },
        ],
      },
    ],
  },
  {
    key: 'B',
    title: 'Mes ressources',
    subtitle: 'Ce que tu as à disposition aujourd\'hui.',
    fields: [
      { name: 'weekly_hours', label: 'Combien d\'heures par semaine peux-tu y consacrer ?', type: 'select', required: true,
        options: [
          { value: '', label: 'Choisir…' },
          { value: '1-3', label: '1 à 3 heures' },
          { value: '4-7', label: '4 à 7 heures' },
          { value: '8-14', label: '8 à 14 heures' },
          { value: '15+', label: '15 heures ou plus' },
        ],
      },
      { name: 'existing_skills', label: 'Quelles compétences apportes-tu ?', type: 'textarea', placeholder: 'Formations, expériences professionnelles, savoir-faire…', required: false },
      { name: 'existing_network', label: 'As-tu déjà un réseau ou une audience ?', type: 'text', placeholder: 'Ex : communauté Instagram, réseau pro LinkedIn, anciens clients…', required: false },
    ],
  },
  {
    key: 'C',
    title: 'Ma réalité',
    subtitle: 'Ce qui définit ton contexte réel — pas la version idéale.',
    fields: [
      { name: 'current_situation', label: 'Décris ta situation actuelle en quelques mots', type: 'textarea', placeholder: 'Salariée à temps plein, maman, en reconversion, …', required: false },
      { name: 'main_constraint', label: 'Ta principale contrainte', type: 'select', required: true,
        options: [
          { value: '', label: 'Choisir…' },
          { value: 'time', label: 'Le temps' },
          { value: 'energy', label: 'L\'énergie' },
          { value: 'money', label: 'Le budget' },
          { value: 'clarity', label: 'La clarté — je ne sais pas quoi faire' },
          { value: 'confidence', label: 'La confiance en moi' },
          { value: 'other', label: 'Autre' },
        ],
      },
    ],
  },
  {
    key: 'D',
    title: 'Mon blocage',
    subtitle: 'Ce qui te retient ou te ralentit vraiment.',
    fields: [
      { name: 'main_blocker', label: 'Ce qui t\'a empêchée d\'avancer jusqu\'ici', type: 'textarea', placeholder: 'Sois honnête — c\'est pour toi, pas pour une présentation.', required: false },
      { name: 'fear', label: 'Si tu dois nommer une peur liée à ce projet…', type: 'text', placeholder: 'Optionnel', required: false },
    ],
  },
  {
    key: 'E',
    title: 'Mon objectif J90',
    subtitle: 'Dans 90 jours, qu\'est-ce qui aura changé si tu es satisfaite de ton parcours ?',
    fields: [
      { name: 'objective_j90', label: 'Mon objectif dans 90 jours', type: 'textarea', placeholder: 'Formule-le simplement, à la première personne. Ex : "J\'ai eu 3 conversations de validation avec de vraies personnes et je sais si mon idée tient la route."', required: true },
      { name: 'success_signal', label: 'Comment sauras-tu que tu as atteint cet objectif ?', type: 'text', placeholder: 'Un signe concret, observable.', required: false },
    ],
  },
  {
    key: 'F',
    title: 'Mon engagement',
    subtitle: 'Ce parcours demande de la régularité, pas de la perfection.',
    fields: [
      { name: 'commitment', label: 'Formule ton engagement en une phrase', type: 'textarea', placeholder: 'Ex : "Je m\'engage à travailler sur mon projet au moins 3 heures par semaine pendant 90 jours."', required: true },
      { name: 'why', label: 'Pourquoi maintenant ?', type: 'textarea', placeholder: 'Qu\'est-ce qui a changé, ou qu\'est-ce qui te pousse à te lancer maintenant ?', required: false },
    ],
  },
];

export function StepPointDeDepart({ initialSections, saving, error, onSaveSection, onComplete, completing }) {
  const [subStep, setSubStep] = useState(() => {
    // Start at first incomplete section
    for (let i = 0; i < SECTIONS.length; i++) {
      if (!initialSections?.[SECTIONS[i].key]) return i;
    }
    return SECTIONS.length - 1;
  });

  const [localAnswers, setLocalAnswers] = useState(() => {
    const section = SECTIONS[subStep];
    return initialSections?.[section.key] ?? {};
  });

  const [allSections, setAllSections] = useState(initialSections ?? {});

  function handleChange(name, value) {
    setLocalAnswers(prev => ({ ...prev, [name]: value }));
  }

  async function handleNext() {
    const section = SECTIONS[subStep];
    const updated = { ...allSections, [section.key]: localAnswers };
    setAllSections(updated);
    await onSaveSection(section.key, localAnswers);

    if (subStep < SECTIONS.length - 1) {
      const nextSection = SECTIONS[subStep + 1];
      setLocalAnswers(updated[nextSection.key] ?? {});
      setSubStep(subStep + 1);
    } else {
      await onComplete(updated);
    }
  }

  function handleBack() {
    const section = SECTIONS[subStep];
    const updated = { ...allSections, [section.key]: localAnswers };
    setAllSections(updated);
    const prevSection = SECTIONS[subStep - 1];
    setLocalAnswers(updated[prevSection.key] ?? {});
    setSubStep(subStep - 1);
  }

  const section = SECTIONS[subStep];
  const isLastSection = subStep === SECTIONS.length - 1;
  const isValid = section.fields
    .filter(f => f.required)
    .every(f => localAnswers[f.name]?.trim?.() || localAnswers[f.name]);

  return (
    <div className={styles.card}>
      <div className={pdStyles.sectionNav}>
        {SECTIONS.map((s, i) => (
          <div
            key={s.key}
            className={`${pdStyles.dot} ${i === subStep ? pdStyles.active : ''} ${allSections[s.key] ? pdStyles.done : ''}`}
            aria-label={s.title}
          />
        ))}
      </div>

      <div className={styles.stepBadge}>Point de Départ · {section.key}</div>
      <h1 className={styles.title}>{section.title}</h1>
      <p className={styles.lead}>{section.subtitle}</p>

      <div className={pdStyles.fields}>
        {section.fields.map(field => (
          <Field
            key={field.name}
            field={field}
            value={localAnswers[field.name] ?? ''}
            onChange={v => handleChange(field.name, v)}
          />
        ))}
      </div>

      {error && <p className={pdStyles.error} role="alert">{error}</p>}

      <p className={pdStyles.saveHint}>
        {saving ? 'Sauvegarde…' : 'Sauvegardé automatiquement à chaque étape.'}
      </p>

      <div className={styles.actions}>
        {subStep > 0 && (
          <button className={styles.btnSecondary} onClick={handleBack} disabled={saving || completing}>
            ← Retour
          </button>
        )}
        <button
          className={styles.btnPrimary}
          onClick={handleNext}
          disabled={!isValid || saving || completing}
        >
          {completing ? 'Finalisation…' : isLastSection ? 'Finaliser mon parcours' : 'Continuer →'}
        </button>
      </div>
    </div>
  );
}

function Field({ field, value, onChange }) {
  if (field.type === 'textarea') {
    return (
      <div>
        <label className={pdStyles.label}>
          {field.label}
          {field.required && <span className={pdStyles.required}> *</span>}
        </label>
        <textarea
          className={pdStyles.textarea}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={field.placeholder}
          rows={3}
        />
      </div>
    );
  }
  if (field.type === 'select') {
    return (
      <div>
        <label className={pdStyles.label}>
          {field.label}
          {field.required && <span className={pdStyles.required}> *</span>}
        </label>
        <select className={pdStyles.select} value={value} onChange={e => onChange(e.target.value)}>
          {field.options.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
    );
  }
  return (
    <div>
      <label className={pdStyles.label}>
        {field.label}
        {field.required && <span className={pdStyles.required}> *</span>}
      </label>
      <input
        type="text"
        className={pdStyles.input}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={field.placeholder}
      />
    </div>
  );
}
