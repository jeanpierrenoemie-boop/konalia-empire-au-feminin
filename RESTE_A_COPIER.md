# Fichiers à copier depuis le Drive (restauration de la plateforme)

*État au 2026-10-01. 55 fichiers manquants ont été restaurés et 12 fichiers tronqués remplacés. Il reste les fichiers ci-dessous.*

**Méthode :** ouvre le lien, clique sur « Télécharger » dans Drive, puis dans GitHub : ouvre le dossier indiqué, « Add file » → « Upload files », dépose le fichier (même nom), et valide (« Commit changes ») sur la branche `claude/gracious-mccarthy-b806wa`. Quand un fichier du même nom existe déjà, GitHub le remplace.

**Important :** ne téléverse pas tout le dossier `src` d'un coup. Quelques fichiers du dépôt ont été modifiés après la copie d'origine (`ownerContext.ts`, `agents-server.ts`, `paths.ts`, `Widgets.tsx`, `ContentStudio.tsx`, `layout.tsx`…) et seraient écrasés.

Lien de base : `https://drive.google.com/file/d/<ID>/view`

## A. Fichiers absents (à ajouter)

| Dossier dans le dépôt | Fichier | ID Drive |
|---|---|---|
| `naiom-platform/src/components/` | `CerveauStudio.tsx` | 1vPXtndjAohdicUR7JEN7KC6C5wcN9sjj |
| `naiom-platform/src/lib/` | `mockStream.ts` | 1s1YvSBti3B72finSkwDXgrIp2Acp8x75 |

## B. Fichiers tronqués (à remplacer par la version complète)

Le premier est le plus urgent : son erreur de syntaxe empêche toute vérification du projet.

| Dossier dans le dépôt | Fichier | ID Drive |
|---|---|---|
| `naiom-platform/src/lib/propositions/` | `proposalPdf.ts` | 1iFxl8YFuMW05PkD3OFU3pnMVmHyeAkai |
| `naiom-platform/src/lib/` | `agents.ts` | 15FHW_of53LcTEJsJT9pYOaGJ5G0sVY0Z |
| `naiom-platform/src/lib/` | `agentsUI.ts` | 18ok2QLvO04TxkDtlWoJ3azTQKUkdjFYV |
| `naiom-platform/src/lib/content/` | `hybrid.ts` | 1UHvuyGJlViBavG2SV9bwNSma6pFlOgQI |
| `naiom-platform/src/lib/veille/` | `store.ts` | 1jT0Zv6KQHiA8WR6x6v0ZgoiMYqZqCPm2 |
| `naiom-platform/src/lib/integrations/` | `youtube.ts` | 1jvlwmKwcSt_3EV4PLaUg_URBVOD7hbXr |
| `naiom-platform/src/lib/integrations/` | `apify.ts` | 1IZ_UbvNBvB5QqHOJ8jyXvPMiKfvbyelj |
| `naiom-platform/src/lib/integrations/` | `fireflies.ts` | 1StJTIk3MJLfkWS1oEgOM2KagNuDvZ_fv |
| `naiom-platform/src/lib/integrations/` | `google.ts` | 1j5oIbgAZA2FUTbrwTfHFKNBfGPiog9wz |
| `naiom-platform/src/lib/integrations/` | `gmail.ts` | 1sGCxjE7UM3A9GIM21Jg-NXTl4nKJpO2S |
| `naiom-platform/src/lib/integrations/` | `drive.ts` | 1GbH4xbdNINAtb90LYemN7lV6e6hm1yko |
| `naiom-platform/src/components/` | `DesignerImagesPanel.tsx` | 1rLbjE3rzLGMjq0n7P-noQvP3b2EcM822 |
| `naiom-platform/src/components/` | `ThumbnailStudio.tsx` | 1T3bNBG6p15z3i0wg6WgMALcepWMzKyvC |
| `naiom-platform/src/components/` | `VeilleStudio.tsx` | 1DyC0QyYSA6m8gvYVhXkT9OP7El3Jm84y |
| `naiom-platform/src/components/` | `SetupTools.tsx` | 1-kVQnV1EJTCP2BxzQ51GRLpsPAmy2zGA |
| `naiom-platform/src/components/` | `PropositionDashboard.tsx` | 1JqEncI2WzRGsJtxOIfXD7I45Re57Jmy4 |
| `naiom-platform/src/components/` | `QuickEmailAction.tsx` | 1zk90Fb2RQp6lK0ABvotANAzJbHguhhpK |
| `naiom-platform/src/components/` | `ProspectionCoulisses.tsx` | 1GQiS95JCPmoRHH_QAPo2c7v25xwKBwM2 |

## C. Images (dossier `public/`)

Le dossier `public/` n'existe pas dans le dépôt : il contient les avatars des agents (`avatars/`, `avatars-pixel/`) et les modèles de visuels (`templates/`), soit 61 images.
Dossier Drive : `https://drive.google.com/drive/folders/1gCMcFIWUvITfI3AVulbSUaQbm_Bk3SzR` → à téléverser tel quel dans `naiom-platform/public/`.
