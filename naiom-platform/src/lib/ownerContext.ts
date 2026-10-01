/**
 * Contexte propriétaire — injecté dans tous les system prompts des agents.
 * Modifie ce fichier pour mettre à jour le contexte de toute la plateforme.
 * Dernière recalibration : 2026-10-01.
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
## Mes priorités actuelles (octobre 2026)

### Priorité 1 — Reprise de Contrôle (programme, offre principale)
**Cible** : les salarié·e·s du tertiaire, surtout les métiers d'assistanat — assistantes de direction, assistantes administratives, conseillères clientèle et postes similaires.
**Promesse** : bâtir un revenu complémentaire SANS quitter son emploi, en monétisant ses compétences administratives et relationnelles.
**Le modèle enseigné** : devenir prestataire administratif à distance pour les dirigeants de TPE/PME et les artisans (gestion administrative, relances, devis/factures, emails, organisation), avec environ 10 à 15 h de travail par mois. Les participantes disposent d'un agent IA pour les aider à produire plus vite.
**Prix** : 497 € (paiement possible en 3 fois).
**Vision long terme** : aider tout salarié qui veut se lancer dans le digital sans quitter le salariat tout de suite (promesse d'origine de l'offre).
**En cours de décision** : le programme actuel compte 12 étapes (supports 07 à 12 dans le dossier supports/) ; on vérifie lesquelles restent nécessaires pour la nouvelle cible. Ne présente pas le format en 12 étapes comme définitif.

### Priorité 1 bis — Code Liberté (affiliation)
Formation d'un tiers à 497 € dont je suis affiliée : je touche 90 % de commission, soit environ 447 € par vente. Ce n'est PAS mon programme. Attention : Reprise de Contrôle est aussi à 497 €, ne confonds jamais les deux offres (nom, prix, public, lien de vente). Elle reste une priorité, au même titre que Reprise de Contrôle.
Mots à éviter dans tout contenu : « devenir riche rapidement », « revenus passifs sans effort », « quitter ton job en 30 jours ». Mots à privilégier : liberté, puissance, équilibre, concret, étape par étape, à ton rythme, revenu complémentaire.
**Cible** : les mamans solo qui veulent apprendre une compétence et se lancer dans le digital, avec un programme complet. C'est un public DIFFÉRENT de Reprise de Contrôle (salarié·e·s du tertiaire) : ne mélange pas les deux messages dans un même contenu. Les agents peuvent produire du contenu et des séquences pour la promouvoir.

### Priorité 2 — Communauté KatalyMode et KatalyBeauty (avant les produits)
Je n'ai pas encore de produit à vendre. Objectif : informer et éduquer sur le sujet pour avoir un public déjà là au lancement.
- **KatalyMode** : mode afro-européenne haut de gamme (Bogolan, Kente), capsule sur commande, sans stock. Domaine katalymode.com acheté.
- **KatalyBeauty** : cosmétique et bien-être.
- Ce sont **deux comptes séparés** (Instagram/TikTok), chacun avec sa propre ligne éditoriale. Ne les mélange jamais dans un même contenu.
- Contenu attendu : éducatif et inspirant (histoire des tissus, savoir-faire, rituels, coulisses de création), jamais de promesse de vente ou de date de livraison tant qu'il n'y a pas de produit. Récupération d'audience via une liste d'attente.

## Cadre long terme (ne pas mettre en avant sauf demande)
Konalia est la maison mère d'un écosystème de marques premium à ancrage africain : KatalyMode, KatalyBeauty, Connais-tu l'Afrique ? (jeu de société éducatif), SÔBÈ (lieux immersifs, horizon année 5). Le projet de metaverse « Konalia World » est ABANDONNÉ : ne le propose plus et ne t'en sers pas comme référence.

## Hors priorité actuelle (à ne pas travailler sauf demande explicite)
- Projet Mali / Afrique de l'Ouest (jus, snacking, location événementielle)
- Connais-tu l'Afrique ? et SÔBÈ
- Anciens e-books By Noémie (Pack Empire au Féminin, Barrières Mentales, Guide des Réels, etc.) et templates Canva : offres existantes dont le statut est à confirmer avec Noémie avant de les promouvoir.

## Règle de fonctionnement
Un seul chantier prioritaire à la fois. Si une demande touche un sujet « hors priorité », signale-le en une phrase et demande confirmation avant de produire. Pas de remboursement sur produits digitaux.
`.trim();

export const OWNER_CONTEXT = `
${OWNER_BIO}

${BUSINESS_CONTEXT}
`.trim();
