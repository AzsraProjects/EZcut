# ADR-0002 — Licence du projet

- Statut : Accepté
- Date : 2026-11-18

> Ce document n'est pas un avis juridique. Les licences citées sont à revérifier à la source.

## Contexte

Le dépôt GitHub est public et n'a pas de licence. Sans licence, personne n'a légalement le droit de réutiliser le code ni d'y contribuer sereinement. Le choix conditionne aussi ce qu'on peut intégrer :

- **FFmpeg** existe en variante LGPL et en variante GPL. Les encodeurs logiciels x264 (H.264) et x265 (H.265) sont sous GPL et ne sont présents que dans la variante GPL. Les encodeurs matériels (NVIDIA, AMD, Intel) et l'encodeur AV1 SVT-AV1 sont disponibles dans la variante LGPL.
- **frei0r** (effets) est sous GPL.
- Certains modèles d'IA de segmentation ont des licences non commerciales ou GPL.
- H.264 et H.265 sont par ailleurs couverts par des brevets, indépendamment de la licence du logiciel ; la question se pose pour toute distribution commerciale.

## Décision

Publier EZcut sous **GPL-3.0**.

Raisons : le projet est déjà public, il vise une banque d'effets communautaire, et la GPL permet d'utiliser sans contorsion FFmpeg complet (x264, x265) et frei0r. C'est le choix de Shotcut et de Kdenlive. Elle n'interdit pas de vendre le logiciel ni des contenus (packs, modèles).

Les packs d'effets du registre gardent chacun leur propre licence, déclarée dans leur manifeste.

## Alternatives écartées

| Alternative | Conséquence |
|---|---|
| **MIT ou Apache-2.0** | Plus permissif, permet un dérivé fermé. Impose de se limiter à FFmpeg LGPL lancé en processus séparé : pas de x264/x265, donc export H.264 et H.265 uniquement par encodeur matériel ou par l'encodeur de Windows, avec un repli de moindre qualité sur les machines sans GPU compatible. Exclut frei0r |
| **Code fermé** | Mêmes contraintes que ci-dessus, et incompatible avec l'esprit communautaire recherché |
| **Pas de licence** | État actuel ; bloque toute contribution extérieure |

## Conséquences

- Tout code tiers intégré doit être compatible GPL-3.0.
- Les contributions sont reçues sous la même licence. Si un changement de licence ou une double licence est envisagé un jour, il faudra l'accord de chaque contributeur, ou un accord de contribution mis en place dès le départ : à décider en même temps que cet ADR.
- L'installateur doit inclure les mentions de licence de chaque composant tiers et donner accès à leur code source.
- Un inventaire des dépendances et de leurs licences est tenu à jour et vérifié en intégration continue.
