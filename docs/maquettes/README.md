# Maquettes

## `ecran-principal.html`

Maquette interactive de l'écran principal. Elle exécute les vrais effets et transitions open source sur une vraie vidéo, avec l'aperçu au survol.

Le fichier est un fragment HTML (sans `<html>` ni `<body>`) et charge ses ressources depuis `assets/`. Il doit être servi par un serveur web local ; ouvert directement depuis le disque, le navigateur bloque le chargement de la banque d'effets.

## Contenu de `assets/`

| Fichier | Origine | Licence |
|---|---|---|
| `engine.js` | Prototype EZcut : exécute les shaders ISF et gl-transitions | GPL-3.0 (projet) |
| `effets.json` | Shaders non modifiés de [Vidvox/ISF-Files](https://github.com/Vidvox/ISF-Files) | MIT, © VIDVOX et contributeurs ; auteur de chaque effet dans son champ `credit` |
| `effets.json` | Shaders non modifiés de [gl-transitions](https://github.com/gl-transitions/gl-transitions) | MIT (295), BSD (2) ; auteur et licence dans l'en-tête de chaque source |
| `clip-*.mp4`, `poster-*.jpg`, `strip-*.jpg`, `wave-*.png` | Extraits de *Tears of Steel* | CC BY 3.0, © Blender Foundation, mango.blender.org |

## Résultat du test de compatibilité (2026-11-18, Chrome, WebGL2)

| Source | Candidats | Compilent et s'exécutent | Retenus dans la banque |
|---|---|---|---|
| ISF-Files, effets prenant une image en entrée | 148 | 146 | 126 |
| gl-transitions | 297 | 297 | 297 |

Écartés côté ISF : 2 échecs de compilation, 1 rendu noir, 19 sans changement visible avec leurs réglages par défaut (réglages colorimétriques neutres, effets interactifs). 18 effets retenus ont un réglage par défaut neutre : la maquette leur applique une valeur d'aperçu à 60 % de la plage.

Ce test vérifie que les shaders tournent, pas leur qualité visuelle. Le tri qualitatif reste à faire.
