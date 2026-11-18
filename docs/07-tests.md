# 07 — Stratégie de test

> Les outils nommés ici dépendent de la stack ([ADR-0001](adr/0001-stack-technique.md)). Les niveaux et les budgets, eux, restent valables quelle que soit la stack.

## Niveaux de test

| Niveau | Ce qu'il vérifie | Cible | Quand |
|---|---|---|---|
| Unitaire | Opérations de montage, modèle de projet, annulation, migrations de format | Module `core` couvert presque entièrement ; logique pure des autres modules | À chaque commit |
| Rendu de référence | Une scène donnée produit l'image attendue, à une tolérance près | Chaque effet, transition et mode de fusion | À chaque commit touchant le moteur ou un effet |
| Intégration | Import → montage → export sur de vrais fichiers ; le fichier exporté a la bonne durée, résolution, cadence, piste audio | Un scénario par format et par codec pris en charge | À chaque pull request |
| Interface | Parcours complets dans l'application réelle | Les parcours des critères de sortie de la [feuille de route](03-roadmap.md) | À chaque pull request |
| Cohérence visuelle | Captures des écrans principaux comparées à une référence, dans les deux thèmes et à trois échelles | Écran principal, banque d'effets, export, réglages | À chaque pull request touchant l'interface |
| Performance | Budgets ci-dessous | Scénarios fixes sur une machine de référence | Avant chaque version ; à la demande |
| Non-régression | Tout bug corrigé laisse un test qui l'aurait détecté | — | Permanent |

## Jeu de médias de test

Un petit ensemble de fichiers libres de droits, versionné à part du code :

- H.264 et HEVC en 1080p et 4K, à 24, 30 et 60 images par seconde ;
- une vidéo de téléphone à cadence variable ;
- une vidéo verticale ;
- un enregistrement long (plus d'une heure) ;
- audio stéréo et mono, à 44,1 et 48 kHz ;
- images PNG avec transparence et JPEG avec orientation EXIF ;
- un fichier corrompu et un fichier au format non pris en charge.

## Budgets de performance

Mesurés sur une machine de référence à définir en phase 0 (proposition : PC portable milieu de gamme avec GPU intégré récent).

| Mesure | Budget |
|---|---|
| Démarrage à froid jusqu'à l'interface utilisable | Moins de 3 s |
| Ouverture d'un projet de 200 clips | Moins de 2 s |
| Réaction de l'interface à une action | Moins de 100 ms |
| Lecture 1080p, 3 pistes vidéo, 2 effets par clip | Cadence du projet, moins de 1 % d'images perdues |
| Déplacement de la tête de lecture | Image affichée en moins de 150 ms |
| Aperçu au survol d'un effet installé | Première image en moins de 100 ms |
| Export 1080p H.264 avec encodeur matériel | Plus rapide que le temps réel |
| Mémoire avec un projet de 30 minutes ouvert | Moins de 2 Go |

Un budget dépassé bloque la livraison de la fonctionnalité qui l'a fait dépasser, sauf décision explicite et notée.

## Compte rendu de test

Chaque livraison indique, dans la rubrique « Tests réalisés » : les tests lancés, leur résultat, ce qui n'a pas pu être testé et pourquoi. Un test en échec est rapporté avec sa sortie, jamais passé sous silence.
