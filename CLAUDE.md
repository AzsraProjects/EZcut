# EZcut — consignes pour les agents

EZcut est un logiciel de montage vidéo pour Windows 10/11 (macOS visé à terme), destiné aux créateurs de contenu et aux débutants. Dépôt : https://github.com/AzsraProjects/EZcut

## État

Version 0.1.0 non publiée : éditeur complet de l'import à l'export (quatre pistes, titres, incrustation, banque d'effets triée, export H.264/H.265, installateur Windows, mise à jour). Ce qui marche et ce qui manque : `README.md` et `CHANGELOG.md`.

## Commandes

- `npm run dev` — application avec rechargement à chaud ; `npm start` — version construite.
- `npm run typecheck`, `npm test` (unitaires), `npm run test:export` (intégration : lance la vraie application sans interface, exporte, contrôle le fichier), `npm run dist` (installateur dans `release/`).
- Tri de la banque : `tools/catalog/selection.json` (entrées masquées, transitions essentielles, réglages de vignette) ; planches-contact avec `tools/catalog/sheet.html?kind=effect|filter|transition&page=N`.
- Après chaque gros morceau, faire relire par des agents indépendants (correction, sécurité, ergonomie) et corriger avant de livrer : les quatre relectures du 2026-11-18 ont trouvé une cinquantaine de défauts que les tests ne voyaient pas.
- Dans un script shell, ne jamais écrire un `\b` de regex via `node -e` : il devient un caractère de contrôle. Passer par un fichier.
- Catalogue d'effets : `node tools/catalog/build.mjs <ISF-Files/ISF> <gl-transitions/transitions> --all`, ouvrir `tools/catalog/harness.html` via le serveur de développement, puis relancer `build.mjs` sans `--all`.
- Electron ne démarre pas si `ELECTRON_RUN_AS_NODE` est défini (c'est le cas dans les terminaux d'agent) : passer par les scripts npm, qui la retirent.

## Rythme de travail actuel

Le 2026-11-18, l'utilisateur a choisi de valider la maquette une fois puis de laisser enchaîner la construction sans arrêt à chaque fonctionnalité. La règle ci-dessous redevient stricte pour tout changement de direction visuelle ou de périmètre.

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
