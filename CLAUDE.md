# EZcut — consignes pour les agents

EZcut est un logiciel de montage vidéo pour Windows 10/11 (macOS visé à terme), destiné aux créateurs de contenu et aux débutants. Dépôt : https://github.com/AzsraProjects/EZcut

## État

Phase 0 : le dépôt ne contient que de la documentation. Stack (Electron, TypeScript, React, WebGL2, FFmpeg), licence (GPL-3.0) et format des effets sont validés ; la stack reste conditionnée aux prototypes R1 à R5 (`docs/02-architecture.md`). Prochaines étapes : maquette de l'écran principal à valider, puis prototypes.

Tout code dépendant du système reste dans `apps/desktop` et la détection des encodeurs : pas de chemin ni d'appel propre à Windows ailleurs.

## Règle non négociable

Pour toute fonctionnalité significative, dans cet ordre :

1. Analyser le dépôt et les impacts.
2. Rédiger une proposition (`docs/modeles/proposition-fonctionnalite.md`).
3. Montrer un aperçu visuel (maquette, schéma ou capture).
4. **S'arrêter et attendre la validation de l'utilisateur.**
5. Implémenter sur une branche dédiée.
6. Tester et mesurer les performances.
7. Rédiger le compte rendu de livraison (`docs/modeles/livraison-fonctionnalite.md`) et l'entrée de `CHANGELOG.md`.
8. Proposer les commits ; ne committer et ne pousser que sur demande.

Ne jamais sauter les étapes 3 et 4. Ne jamais pousser une grosse modification sans aperçu préalable.

## Où trouver quoi

- Vision et périmètre : `docs/01-vision.md`
- Modules et sens des dépendances : `docs/02-architecture.md`
- Ordre de construction et critères de sortie : `docs/03-roadmap.md`
- Banque d'effets et aperçu au survol : `docs/04-banque-effets.md`
- Règles d'interface : `docs/05-ui-ux.md`
- Cycle de travail, rôles, définition de « terminé » : `docs/06-methode.md`
- Tests et budgets de performance : `docs/07-tests.md`
- Branches, commits, releases, mise à jour : `docs/08-versions-mises-a-jour.md`
- Décisions : `docs/adr/`

## Conventions

- Documentation et échanges en français. Code, identifiants et messages de commit en anglais.
- Commits au format Conventional Commits : `type(module): description`.
- Toute décision durable (dépendance, format, structure) donne lieu à un ADR.
- Toute nouvelle dépendance est proposée avec sa licence.
- Les comptes rendus disent aussi ce qui a échoué ou n'a pas été testé.
- Priorité à la maintenabilité, à la performance et à l'expérience utilisateur sur la vitesse de livraison.

## Rôles

Les neuf rôles (architecte, UI/UX, vidéo, performance, qualité, sécurité, Git, documentation, test utilisateur) sont définis dans `.claude/agents/`. Un changement d'interface passe par le designer ; un changement du moteur par l'ingénieur vidéo et la performance ; tout ce qui lit un fichier externe ou télécharge par la sécurité.
