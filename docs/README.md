# Documentation EZcut

## Ordre de lecture

1. [Vision produit](01-vision.md) — pour qui, pourquoi, et ce qu'on ne fait pas.
2. [Architecture](02-architecture.md) — comment le logiciel est découpé.
3. [Feuille de route](03-roadmap.md) — dans quel ordre on construit.
4. [Banque d'effets](04-banque-effets.md) — effets communautaires et aperçu au survol.
5. [Interface](05-ui-ux.md) — disposition et règles d'ergonomie.
6. [Méthode de travail](06-methode.md) — le cycle de validation et les rôles des agents.
7. [Tests](07-tests.md) et [Versions et mises à jour](08-versions-mises-a-jour.md).
8. [Lien avec Claude et journal](09-lien-claude.md) — piloter EZcut depuis VS Code, lire le journal.

Modèles à copier : [proposition de fonctionnalité](modeles/proposition-fonctionnalite.md), [livraison de fonctionnalité](modeles/livraison-fonctionnalite.md), [notes de version](modeles/notes-de-version.md).

## Décisions

Validées le 2026-11-18.

| # | Décision | Choix | Détail |
|---|---|---|---|
| D1 | Stack technique | Electron + TypeScript + React, moteur de rendu WebGL2, FFmpeg en processus séparé. Windows d'abord, macOS visé à terme. Reste conditionné aux prototypes de la phase 0 | [ADR-0001](adr/0001-stack-technique.md) |
| D2 | Licence du projet | GPL-3.0 | [ADR-0002](adr/0002-licence.md) |
| D3 | Format des effets | Packs `.ezfx` basés sur ISF (effets) et la spec gl-transitions (transitions) | [ADR-0003](adr/0003-format-effets.md) |
| D4 | Langue | Documentation en français ; interface bilingue FR/EN dès le départ | — |
| D5 | Signature de l'installateur | Reportée à la première version publique ; les bêtas non signées affichent l'avertissement SmartScreen | [08](08-versions-mises-a-jour.md#signature-du-code) |

## État de la documentation

Tous les documents décrivent une **cible proposée**, pas un existant. Les licences des projets tiers cités dans [04](04-banque-effets.md) et [02](02-architecture.md) sont indiquées de mémoire et doivent être revérifiées à la source au moment de l'intégration.
