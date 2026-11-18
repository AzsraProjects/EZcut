# Composants tiers

## Effets et filtres

`public/catalog/effets.json` contient des shaders du dépôt [Vidvox/ISF-Files](https://github.com/Vidvox/ISF-Files) (révision `395072d`), non modifiés, sous licence MIT — texte dans [licenses/ISF-Files.LICENSE.txt](licenses/ISF-Files.LICENSE.txt). L'auteur de chaque shader figure dans son champ `credit` et est affiché dans l'application.

Les effets du dossier `effects/ezcut` sont écrits pour EZcut et suivent la licence du projet.

## Transitions

Le même fichier contient des transitions du dépôt [gl-transitions](https://github.com/gl-transitions/gl-transitions) (révision `deeebde`), non modifiées. Chaque source porte son auteur et sa licence en en-tête : MIT pour 295 d'entre elles, BSD pour 2. Texte MIT dans [licenses/gl-transitions.LICENSE.txt](licenses/gl-transitions.LICENSE.txt).

## Images d'exemple

`public/sample/` et `docs/maquettes/assets/` contiennent des extraits de *Tears of Steel*, © Blender Foundation, [mango.blender.org](https://mango.blender.org), sous licence CC BY 3.0.

## Bibliothèques

Electron, React, Zustand, Vite, TypeScript et Vitest (licence MIT) sont installés par `npm install` et ne sont pas copiés dans ce dépôt.

## FFmpeg

EZcut appelle FFmpeg comme programme séparé. Les binaires viennent des paquets `ffmpeg-static` et `ffprobe-static` (version « essentials » de gyan.dev, sous GPL) : ils ne sont pas copiés dans ce dépôt, mais l'installateur les contient, avec leur licence dans `resources/licenses` ([ADR-0002](docs/adr/0002-licence.md)).

La mise à jour utilise `electron-updater` (licence MIT).
