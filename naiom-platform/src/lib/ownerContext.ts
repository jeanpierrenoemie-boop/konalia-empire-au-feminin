/**
 * Contexte propriétaire — injecté dans tous les system prompts des agents.
 * Modifie ce fichier pour mettre à jour le contexte de toute la plateforme.
 */

export const OWNER_NAME = "Noémie";
export const OWNER_HANDLE = "Noémie.K";

export const OWNER_BIO = `
## Qui je suis — Noémie.K

Entrepreneure d'origine malienne, mère de 6 enfants, salariée en parallèle.
Parcours non linéaire : 23 ans consacrés à ma famille, puis reprise d'études.
BTS Gestion PME obtenu à 40 ans (14 de moyenne, la même année qu'un de mes enfants).
Certification webmarketing début 2026. Formation Community Management (Johanna Gols, 7 modules, objectif octobre 2026).
Organisation : laptop pour le business, téléphone pour les réseaux ; travail le midi et après 21h.
Slogans : « Liberté · Puissance · Équilibre », « Reprise de Contrôle », « L'Empire au Féminin ».
`.trim();

export const BUSINESS_CONTEXT = `
## Mon écosystème — deux univers

### By Noémie (revenu immédiat)
Infoproduits sur l'entrepreneuriat, le mindset et l'IA. Cible : femmes ambitieuses, mamans et salariées.
Hub : Beacons (noemieentrepreneuse.com). Vente : Systeme.io + Stripe. Livraison : Google Drive.
Charte : vert sauge, or, marbre, style féminin élégant.

Offres actuelles :
- Pack Complet « L'Empire au Féminin » (5 e-books) → 199 €
- Libère-toi de tes Barrières Mentales → 67 €
- Trouve ta Niche Idéale / Crée ta Communauté / Automatise ton Business / 30 Prompts ChatGPT → 49 € chacun
- 100 Idées de Hooks / Le Guide Ultime des Réels V2 → 49 €
- Code Liberté (affiliation 90 %) → ≈447 € par vente
- 18 templates Canva (droits de revente illimités) → prix e-books ou plus

Réseaux : Instagram @noemie.k @bynoemie · TikTok @noemie.k
Rythme éditorial : lundi motivation, mercredi valeur, vendredi vente.

### Konalia (long terme, 5 ans)
Maison mère d'un écosystème de marques premium à ancrage africain.
- **KatalyMode** : mode afro-européenne haut de gamme (Bogolan, Kente), capsule 4 pièces sur commande, sans stock. Domaine katalymode.com acheté.
- **KatalyBeauty** : cosmétique et bien-être. 4 contrats créateurs rédigés.
- **SÔBÈ** : espaces physiques immersifs (horizon année 5).
- **Connais-tu l'Afrique ?** : jeu de société éducatif, business plan complet.

### Projet Mali / Afrique de l'Ouest
Vente ambulante de jus + snacking (priorité), location événementielle (phase 2).
Budget départ : 500 € max. Zone : Bamako recommandée. Paiement mobile money.

## Décision structurante
By Noémie finance Konalia. Un seul chantier prioritaire à la fois. Pas de remboursement sur produits digitaux.
`.trim();

export const OWNER_CONTEXT = `
${OWNER_BIO}

${BUSINESS_CONTEXT}
`.trim();
