# EZcut

Logiciel de montage vidéo pour Windows 10/11 (macOS visé à terme), pensé pour les créateurs de contenu et les débutants : des résultats propres sans la complexité d'un outil professionnel.

> **État : version 0.1.0, non publiée.** L'éditeur est complet de l'import à l'export et s'installe par un installateur Windows. Il n'a pas encore été éprouvé par de vrais utilisateurs : voir les [problèmes connus](CHANGELOG.md).

Licence : [GPL-3.0](LICENSE). Composants tiers : [THIRD-PARTY.md](THIRD-PARTY.md).

## Ce que fait EZcut

- **Médias** : import par bouton ou glisser-déposer (vidéo, audio, image).
- **Montage** sur quatre pistes — Titres, Par-dessus, Vidéo, Son : scinder, rogner, déplacer, réordonner, supprimer ; annuler et rétablir.
- **Titres** : 14 modèles animés, entièrement réglables.
- **Incrustation** : vidéo ou image par-dessus la vidéo, avec opacité et mode de fusion ; déplacement et redimensionnement directement dans l'aperçu.
- **Banque** : 71 effets, 21 filtres et 285 transitions, triés, avec aperçu au survol sur votre propre vidéo.
- **Réglages par clip** : cadrage, couleur, volume, fondus du son.
- **Formats** : 16:9, 9:16, 1:1, 4:5.
- **Projet** : enregistrement, sauvegarde automatique, restauration après une fermeture inattendue.
- **Export** : MP4 en H.264 ou H.265, de 720p à 4K, avec l'encodeur de la carte graphique quand il existe.
- **Disposition** : panneaux redimensionnables, masquables, interchangeables.
- **Lien avec Claude** : Claude peut piloter EZcut depuis VS Code pour vous aider à monter, ou monter à votre place ([mode d'emploi](docs/09-lien-claude.md)).

Le bouton d'aide, en haut à droite, liste les raccourcis clavier et les nouveautés.

## Installer

`npm run dist` produit `release/EZcut-Setup-<version>.exe`. L'installateur contient tout, y compris FFmpeg. Il n'est pas signé : Windows affiche un avertissement au lancement.

## Développer

Prérequis : [Node.js](https://nodejs.org) 22 ou plus récent. FFmpeg est fourni par les dépendances.

```
npm install
npm run dev      # application avec rechargement à chaud
npm start        # construit puis lance l'application
npm run dist     # construit l'installateur Windows
```

## Vérifier

```
npm run typecheck     # types
npm test              # tests unitaires : opérations de montage, lecture des projets, annulation
npm run test:export   # test d'intégration : la vraie application importe, monte, exporte ; le fichier produit est contrôlé
npm run test:link     # test du lien avec Claude : l'application est pilotée de bout en bout par le serveur MCP
```

## Organisation du code

| Dossier | Rôle |
|---|---|
| `src/core` | Modèle de projet, opérations de montage, lecture sûre des fichiers de projet ; aucune dépendance à l'interface |
| `src/engine` | Moteur d'effets WebGL2, lecture, composition des pistes, rendu des titres |
| `src/effects` | Chargement du catalogue d'effets |
| `src/export` | Rendu image par image vers FFmpeg |
| `src/ui` | Interface React |
| `src/desktop`, `electron/` | Pont vers le système : fichiers, dialogues, FFmpeg, mises à jour |
| `effects/ezcut` | Effets et filtres écrits pour EZcut, au format ISF |
| `tools/mcp` | Serveur MCP : les outils que Claude utilise pour piloter EZcut |
| `tools/catalog` | Construction, test et tri du catalogue à partir des dépôts amont |
| `docs/` | [Documentation](docs/README.md) : vision, architecture, feuille de route, méthode |

## Contribuer

Voir [CONTRIBUTING.md](CONTRIBUTING.md).
