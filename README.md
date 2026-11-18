# EZcut

Logiciel de montage vidéo pour Windows 10/11 (macOS visé à terme), pensé pour les créateurs de contenu et les débutants : des résultats propres sans la complexité d'un outil professionnel.

> **État : version 0.1 en développement.** Le premier éditeur fonctionne : import, montage sur une piste vidéo et une piste audio, effets, filtres, transitions, export MP4. Ce n'est pas encore une version publiable — voir [ce qui manque](#ce-qui-manque).

Licence : [GPL-3.0](LICENSE). Composants tiers : [THIRD-PARTY.md](THIRD-PARTY.md).

## Lancer l'application

Prérequis : [Node.js](https://nodejs.org) 22 ou plus récent, et [FFmpeg](https://ffmpeg.org) (`ffmpeg` et `ffprobe`) accessible dans le PATH.

```
npm install
npm start        # construit puis lance l'application
npm run dev      # lance avec rechargement à chaud pendant le développement
```

## Ce qui fonctionne

- **Médias** : import par bouton ou glisser-déposer (vidéo, audio, image), vignettes.
- **Timeline** : une piste vidéo et une piste audio, clips à la suite ; scinder, rogner les bords, réordonner par glisser-déposer, supprimer ; zoom ; annuler / rétablir.
- **Banque** : 122 effets, 25 filtres et 297 transitions open source, avec aperçu au survol sur votre vidéo (`Alt` pour l'afficher en grand).
- **Inspecteur** : échelle, position, rotation, couleur, volume, et les réglages de chaque effet.
- **Formats de projet** : 16:9, 9:16, 1:1, 4:5.
- **Projet** : enregistrer et ouvrir (`.ezcut`).
- **Export** : MP4 H.264 / AAC, de 720p à 4K, 24 à 60 images par seconde. L'export passe par le même moteur que l'aperçu.

Raccourcis : `Espace` lecture, `S` scinder, `Suppr` supprimer, `←` `→` image par image, `Ctrl+Z` / `Ctrl+Y`, `Ctrl+S`, `Ctrl+O`.

## Ce qui manque

Plusieurs pistes vidéo, titres et sous-titres, images clés, fondus et outils audio, vitesse, fonctions IA, encodage matériel, autres formats que MP4, installateur et mise à jour automatique. L'ordre prévu est dans la [feuille de route](docs/03-roadmap.md) ; les limites connues de cette version sont dans le [journal des modifications](CHANGELOG.md).

## Vérifier

```
npm run typecheck     # types
npm test              # tests unitaires des opérations de montage
npm run test:export   # test d'intégration : import, montage, export, contrôle du fichier produit
```

## Organisation du code

| Dossier | Rôle |
|---|---|
| `src/core` | Modèle de projet et opérations de montage, sans dépendance à l'interface |
| `src/engine` | Moteur d'effets WebGL2 et lecture / composition |
| `src/effects` | Chargement du catalogue d'effets |
| `src/export` | Rendu image par image vers FFmpeg |
| `src/ui` | Interface React |
| `src/desktop`, `electron/` | Pont vers le système : fichiers, dialogues, FFmpeg |
| `tools/catalog` | Construction et test du catalogue à partir des dépôts amont |
| `docs/` | [Documentation](docs/README.md) : vision, architecture, feuille de route, méthode |

## Contribuer

Voir [CONTRIBUTING.md](CONTRIBUTING.md).
