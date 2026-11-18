# 01 — Vision produit

## En une phrase

EZcut est un logiciel de montage Windows léger et rapide, qu'une personne peut prendre en main dès la première ouverture et avec lequel elle obtient une vidéo d'aspect professionnel.

## Utilisateurs visés

| Profil | Besoin principal | Ce qui le fait abandonner un logiciel |
|---|---|---|
| Créateur de formats courts (TikTok, Shorts, Reels) | Monter vite, sous-titres, effets, format vertical | Trop d'étapes pour un résultat simple |
| Youtubeur | Montage multi-pistes, titres, musique, export propre | Lenteur, plantages, export long |
| Streamer Twitch | Découper des moments forts dans de longs enregistrements | Fichiers longs mal gérés |
| Débutant occasionnel | Assembler quelques clips, ajouter une musique | Interface intimidante |

## Principes de conception

1. **La première vidéo en dix minutes.** Importer, couper, exporter doit être évident sans tutoriel.
2. **Complexité progressive.** Les réglages avancés existent mais restent repliés tant qu'on n'en a pas besoin.
3. **Ce que l'on voit est ce que l'on exporte.** L'aperçu et l'export passent par le même moteur de rendu.
4. **Jamais de travail perdu.** Sauvegarde automatique, annulation illimitée, récupération après plantage.
5. **Réactivité avant tout.** L'interface ne se fige jamais ; les traitements longs tournent en arrière-plan avec progression et annulation.
6. **Ouvert par construction.** Les effets, transitions et modèles sont des fichiers documentés que la communauté peut créer et partager.

## Références

On reprend de CapCut Desktop et Filmora la simplicité de la disposition et la banque d'effets à aperçu immédiat ; de DaVinci Resolve la rigueur de l'étalonnage ; de Premiere Pro les raccourcis de montage devenus standard. On ne reprend pas leur densité d'interface.

## Périmètre fonctionnel

La liste complète des fonctionnalités demandées est répartie par version dans la [feuille de route](03-roadmap.md). Familles :

- Bibliothèque de médias, aperçu, timeline multi-pistes, inspecteur.
- Montage de base (couper, scinder, rogner, recadrer, pivoter, vitesse, inversion).
- Montage avancé (images clés, masques, modes de fusion, fond vert, stabilisation, suivi de mouvement, recadrage automatique).
- Audio (automation de volume, fondus, réduction de bruit, normalisation, égaliseur, ducking).
- Effets, transitions, préréglages partageables, banque d'effets communautaire.
- Étalonnage (exposition, contraste, saturation, température, teinte, courbes, TSL, LUT).
- Texte et habillage (titres, synthés, sous-titres, modèles animés).
- Fonctions IA (sous-titres automatiques, détection des silences, moments forts, recadrage, suppression d'arrière-plan).
- Export (MP4, MOV, MKV, WebM, AVI, GIF ; H.264, H.265, AV1 ; accélération NVIDIA, AMD, Intel).
- Mise à jour automatique et notes de version dans le logiciel.

## Non-objectifs

- Pas de version Linux. macOS est un objectif à terme, après la 1.0 Windows : rien n'est développé pour lui d'ici là, mais rien ne doit l'empêcher ([ADR-0001](adr/0001-stack-technique.md)).
- Pas de montage collaboratif ni de stockage en ligne.
- Pas de concurrence avec Resolve ou Premiere sur les usages professionnels (multicaméra, étalonnage HDR, flux broadcast).
- Pas de boutique payante au départ : l'architecture la rend possible, rien de plus.

## Réalisme du périmètre

Le périmètre demandé correspond à ce que des équipes entières ont mis des années à construire. Atteindre la parité avec Filmora ou CapCut n'est pas un objectif de la version 1.0. La feuille de route vise d'abord un éditeur réduit mais fiable, puis élargit. Certaines fonctions (suivi de mouvement, stabilisation, suppression d'arrière-plan en temps réel, 8K) sont placées après la 1.0 parce qu'elles sont coûteuses et que rien d'autre n'en dépend.

## Mesures de réussite

| Mesure | Cible 1.0 |
|---|---|
| Temps entre le premier lancement et le premier export | Moins de 10 minutes sans aide |
| Démarrage à froid | Moins de 3 secondes |
| Lecture d'une timeline 1080p à 3 pistes vidéo avec effets | Fluide à la cadence du projet sur un PC milieu de gamme avec GPU intégré récent |
| Plantages | Aucun travail perdu : récupération automatique du projet |
| Taille de l'installateur | Moins de 200 Mo hors modèles IA |
