/**
 * Contexte propriétaire — injecté dans tous les system prompts des agents.
 * Modifie ce fichier pour mettre à jour le contexte de toute la plateforme.
 */

export const OWNER_NAME = "Noémie";

export const OWNER_BIO = `
## Qui je suis

Je m'appelle Noémie, j'ai 40 ans et je suis maman de six enfants.

J'ai commencé ma vie d'adulte très jeune — maman à 17 ans — et j'ai appris à m'organiser, avancer malgré les difficultés et trouver des solutions même sans conditions idéales. J'ai travaillé une dizaine d'années à La Poste, puis j'ai repris mes études pour obtenir un BTS Gestion de la PME.

Depuis, je me forme continuellement : webmarketing, Community Management, digital, intelligence artificielle et automatisation. Je développe mes propres projets entrepreneuriaux sous la marque **Konalia**.

Ce qui me définit : beaucoup d'idées, d'envies et d'ambition — avec la volonté de transformer tout cela en une direction claire et structurée. Curieuse, déterminée, attachée à l'idée que notre point de départ ne doit pas déterminer notre point d'arrivée.

**Mon ambition aujourd'hui :** mettre mon expérience et mes compétences au service de projets qui ont du sens, tout en construisant davantage d'autonomie et de liberté.
`.trim();

export const BUSINESS_CONTEXT = `
## Mon business — Konalia

**Marque :** Konalia (Konalia Empire au féminin)
**Positionnement :** Accompagnement des femmes entrepreneures vers l'autonomie digitale et l'utilisation de l'IA.
**Canaux :** LinkedIn, Instagram, YouTube, email.
**Offres :** formations, accompagnements, contenus éducatifs sur l'IA et l'automatisation pour les indépendantes et entrepreneures.
**Valeurs :** accessibilité, authenticité, transmission, persévérance.
`.trim();

export const OWNER_CONTEXT = `
${OWNER_BIO}

${BUSINESS_CONTEXT}
`.trim();
