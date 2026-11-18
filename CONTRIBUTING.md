# Contribuer à EZcut

> Le projet est en phase 0 : il n'y a pas encore de code. Les contributions sont reçues sous licence [GPL-3.0](LICENSE).

## Avant de coder

1. Lire la [vision](docs/01-vision.md), l'[architecture](docs/02-architecture.md) et la [méthode de travail](docs/06-methode.md).
2. Pour toute fonctionnalité : ouvrir un ticket avec le modèle « Proposition de fonctionnalité », joindre un aperçu visuel, attendre la validation.
3. Pour un bug : ouvrir un ticket avec le modèle « Rapport de bug ».

## Pendant

- Une branche par sujet : `feat/…`, `fix/…`, `docs/…`, `chore/…`.
- Commits au format `type(module): description` ([détail](docs/08-versions-mises-a-jour.md#messages-de-commit)).
- Respecter le sens des dépendances entre modules ([schéma](docs/02-architecture.md#découpage-en-modules)).
- Tout bug corrigé est accompagné d'un test qui l'aurait détecté.

## Avant la pull request

- Les tests passent.
- La [définition de « terminé »](docs/06-methode.md#définition-de--terminé-) est remplie.
- Le [journal des modifications](CHANGELOG.md) est à jour.

## Proposer un effet

Les effets, transitions et looks se proposent dans le dépôt du registre, pas ici. Voir [Banque d'effets](docs/04-banque-effets.md#le-registre-ezcut).
