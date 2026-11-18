# ADR-0003 — Format des packs d'effets

- Statut : Accepté
- Date : 2026-11-18
- Dépend de : [ADR-0001](0001-stack-technique.md)

## Contexte

EZcut doit proposer une banque d'effets alimentée par la communauté, avec aperçu instantané, préréglages partageables et, plus tard, une boutique. Il faut un format d'effet qui soit simple à écrire, sûr à exécuter, et compatible avec ce qui existe déjà en open source.

## Décision

1. **Un effet est une donnée, pas un programme.** Un pack contient des shaders, des images, des LUT et du JSON. Aucun code exécutable sur le processeur.
2. **Effets : format ISF.** Chaque shader déclare ses paramètres (type, bornes, valeur par défaut) dans un en-tête JSON ; l'inspecteur génère les réglages automatiquement à partir de cet en-tête.
3. **Transitions : spécification gl-transitions.** Une fonction qui mélange l'image de départ et l'image d'arrivée selon une progression de 0 à 1.
4. **Looks : fichiers `.cube`.**
5. **Enveloppe : archive `.ezfx`** avec un `manifest.json` (identité, version, auteur, licence SPDX, type, attribution). Détail dans [04 — Banque d'effets](../04-banque-effets.md#format-dun-pack-ezfx).
6. **Préréglages : même enveloppe**, contenant uniquement des valeurs de paramètres pour des effets existants.

## Alternatives écartées

| Alternative | Raison du rejet |
|---|---|
| Format entièrement propre | Aucun catalogue existant à réutiliser ; chaque effet serait à écrire |
| Plugins natifs OpenFX | Code exécutable tiers : risque de sécurité et de plantage ; incompatible avec la stack proposée |
| Plugins JavaScript | Souples, mais demandent un modèle de permissions et un bac à sable avant d'être acceptables ; reportés après la 1.0 |
| Filtres FFmpeg comme effets | Pas d'aperçu temps réel identique à l'export |

## Conséquences

- Plusieurs centaines d'effets et de transitions existants deviennent importables avec un outil de conversion simple.
- L'aperçu au survol est garanti pour tout pack, puisque tout pack passe par le même compositeur.
- Les traitements impossibles en shader seul (stabilisation, suivi, IA) ne peuvent pas être distribués comme packs : ils restent des fonctions intégrées.
- Le format du manifeste est versionné ; toute évolution doit rester lisible par les versions antérieures du logiciel ou déclarer une version minimale.
