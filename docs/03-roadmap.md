# 03 — Feuille de route

Chaque version a un thème, un contenu et un critère de sortie vérifiable. Aucune date n'est donnée : l'ordre et les dépendances comptent, les durées seront estimées après la phase 0.

> **Avancement au 2026-11-18.** La version 0.1.0 regroupe ce que ce plan répartissait entre 0.1 et 0.3, plus les titres, les fondus audio et la mise à jour. Restent à faire dans les étapes ci-dessous : images clés, sous-titres (éditeur, SRT), égaliseur, normalisation et ducking, toute l'IA, fond vert, masques, vitesse, courbes, autres formats que MP4, stabilisation, signature de l'installateur. Les prototypes de risque R2, R3 et R5 n'ont pas été menés à part : ils sont à mesurer sur l'application elle-même.

## Vue d'ensemble

| Version | Thème | Résultat pour l'utilisateur |
|---|---|---|
| Phase 0 | Fondations | Rien de visible : décisions validées, prototypes de risque, dépôt outillé |
| 0.1 | Squelette | Ouvrir l'application, importer des médias, les lire |
| 0.2 | Montage de base | Monter une vidéo simple et l'exporter en MP4 ; recevoir les mises à jour |
| 0.3 | Effets | Banque d'effets avec aperçu au survol, transitions, couleurs de base |
| 0.4 | Texte, audio, images clés | Titres, sous-titres manuels, fondus, animations |
| 0.5 | IA pratique | Sous-titres automatiques, suppression des silences, recadrage vertical |
| 0.6 | Montage avancé | Fond vert, masques, modes de fusion, vitesse, courbes |
| 1.0 | Version publique | Stabilité, performances, formats et codecs complets |
| Après 1.0 | Extensions | Suivi de mouvement, suppression d'arrière-plan, boutique, plugins |

## Phase 0 — Fondations

- ~~Valider les décisions D1 à D5~~ — fait le 2026-11-18 ([index](README.md#décisions)).
- Réaliser les cinq prototypes de risque R1 à R5 ([architecture](02-architecture.md#risques-techniques-à-lever-par-prototype)). Ce sont des essais jetables, pas le début du produit.
- Mettre en place le dépôt : structure des modules, intégration continue, règles de branche, modèles de ticket.
- Produire la maquette haute fidélité de l'écran principal, en thème sombre et clair.

**Sortie :** chaque risque a une réponse mesurée ; la stack est confirmée ou changée ; la maquette est validée.

## 0.1 — Squelette

- Fenêtre principale avec les quatre zones (bibliothèque, aperçu, timeline, inspecteur), thèmes sombre et clair, prise en charge des écrans haute densité.
- Bibliothèque : import par glisser-déposer et par dialogue (vidéo, audio, image), vignettes, métadonnées, dossiers.
- Aperçu : lecture d'un média, plein écran, choix de la qualité de lecture.
- Projet : créer, enregistrer, ouvrir, sauvegarde automatique.

**Sortie :** importer 20 fichiers de formats variés, les lire, fermer, rouvrir le projet à l'identique.

## 0.2 — Montage de base

- Timeline multi-pistes vidéo et audio, zoom, magnétisme, mode ripple.
- Couper, scinder, rogner les bords, déplacer, supprimer ; annuler/rétablir illimité.
- Transformations simples : recadrer, pivoter, redimensionner, positionner.
- Export MP4 H.264 en 720p et 1080p à 24, 30 et 60 images par seconde, avec accélération matérielle si disponible.
- Mise à jour automatique et notes de version dans l'application.

**Sortie :** une personne qui découvre le logiciel monte et exporte une vidéo de 2 minutes à 3 pistes ; l'image exportée correspond à l'aperçu ; une version 0.2.1 de test s'installe depuis la 0.2.0 en un clic.

## 0.3 — Effets

- Moteur d'effets par shaders ; pile d'effets par clip ; réglages dans l'inspecteur.
- **Banque d'effets avec aperçu au survol** et registre communautaire ([04](04-banque-effets.md)).
- Effets de départ : flou, netteté, glitch, VHS, séparation RVB, grain, bloom, néon, distorsion, look cinéma.
- Transitions : fondu, zoom, glissement, whip, mouvements de caméra, flou de mouvement.
- Étalonnage de base : exposition, contraste, saturation, température, teinte ; import de LUT ; préréglages de look.
- Préréglages : enregistrer, exporter, importer, partager.

**Sortie :** survoler un effet montre son rendu animé sur le clip sélectionné en moins de 100 ms ; installer un pack depuis le registre fonctionne ; un préréglage exporté se réimporte sur une autre machine.

## 0.4 — Texte, audio, images clés

- Images clés sur tout paramètre numérique, avec courbes d'accélération.
- Titres, synthés, texte animé, bibliothèque de modèles.
- Éditeur de sous-titres, import et export SRT.
- Audio : automation de volume, fondus, normalisation, égaliseur, ducking.

**Sortie :** réaliser une vidéo avec titre animé, sous-titres et musique qui se baisse sous la voix.

## 0.5 — IA pratique

- Sous-titres automatiques à partir de la voix.
- Détection et suppression des silences.
- Recadrage automatique vers les formats vertical, carré et horizontal.
- Réduction de bruit et amélioration de la voix.

**Sortie :** chaque fonction tourne entièrement en local, avec progression et annulation, et son résultat reste modifiable à la main.

## 0.6 — Montage avancé

- Fond vert, masques, modes de fusion.
- Vitesse variable, inversion.
- Courbes et réglages TSL.
- Formats MOV, MKV, WebM, GIF ; codecs H.265 et AV1 ; 1440p et 4K ; cadence personnalisée.

## 1.0 — Version publique

- Stabilisation d'image.
- Campagne de performances et de fiabilité, récupération après plantage.
- Installateur signé, site de téléchargement, documentation utilisateur.
- Export AVI ; préparation 8K (aucune limite codée en dur, sans garantie de fluidité).

**Sortie :** les [mesures de réussite](01-vision.md#mesures-de-réussite) sont atteintes.

## Après 1.0

Version macOS, suivi de mouvement, suppression d'arrière-plan sans fond vert, détection des moments forts, boutique d'effets et de modèles, plugins exécutables avec permissions.

## Règles de la feuille de route

- Une version ne commence pas tant que le critère de sortie de la précédente n'est pas atteint.
- Une fonctionnalité qui dérape est reportée à la version suivante plutôt que de retarder la sortie.
- Tout changement d'ordre ou de périmètre est noté ici avec sa raison.
