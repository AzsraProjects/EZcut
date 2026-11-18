# Proposition — Mouvement d'une image (points clés)

- Version visée : 0.1
- Statut : Validée le 2026-11-18, en cours de livraison

## Besoin

Faire bouger une image, une vidéo en incrustation ou un titre dans le cadre : la faire arriver, se déplacer, grossir, tourner, repartir. Aujourd'hui, la position, la taille et la rotation d'un clip sont fixes pendant toute sa durée ; seuls les fondus évoluent.

## Solution proposée

Un outil « Mouvement » fondé sur des points clés, pensé pour ne demander aucun calcul :

1. **Poser des points à la souris.** Le clip étant sélectionné, on place la tête de lecture et on fait glisser l'image dans l'aperçu (la molette change sa taille) : un point est posé à cet instant, ou le point existant à moins de 0,12 s est modifié. Entre deux points, l'image glisse seule sur une courbe qui passe par tous les points.
2. **Voir et retoucher le trajet.** Le trajet s'affiche en pointillés dans l'aperçu ; chaque point se déplace à la souris.
3. **Régler le rythme dans la timeline.** Les points sont des losanges jaunes sur le clip : les faire glisser change le moment, un clic y amène la tête de lecture, Suppr retire le point choisi.
4. **Régler un point dans l'inspecteur** (section « Mouvement ») : taille, rotation, opacité, et la façon d'aller au suivant : Doux, Régulier, Rebond, Saut.
5. **Mouvements tout faits** : entrer à gauche, sortir à droite, traverser, tomber et rebondir, zoom avant, flotter. Ils posent des points ordinaires, retouchables.
6. **Mimer le mouvement** : la lecture passe au ralenti, l'image suit la souris tant que le bouton est enfoncé ; au relâchement, le geste est simplifié en quelques points.

Sans point, rien ne change. Le rendu est le même à l'aperçu et à l'export.

## Aperçu visuel

Maquette interactive : [`docs/maquettes/animation-image.html`](../maquettes/animation-image.html) (à servir par un serveur local, comme l'écran principal), publiée aussi pour la validation.

## Analyse de l'existant

- `core/types.ts` : `Clip.transform` (scale, x, y, rot, flipH, flipV) et `opacity` fixes ; `vfadeIn`/`vfadeOut` pour les fondus.
- `engine/player.ts` : le compositeur lit `clip.transform` et `clip.opacity` pour chaque calque, à l'aperçu (`tick`) et à l'export (`renderExact`) — un seul point à changer : la valeur au temps local du clip.
- `ui/Viewer.tsx` : déplacement et redimensionnement du clip sélectionné à la souris — à brancher sur « poser un point » quand le clip a déjà des points.
- `ui/Timeline.tsx` (`ClipView`) : affichage des losanges ; `ui/Inspector.tsx` : section Mouvement.
- `core/project.ts` : lecture bornée du nouveau champ ; `ui/control.ts` et le serveur MCP : outil pour poser des points.

## Conception technique

- `Clip.keys?: MotionKey[]`, triés par `t` (secondes depuis le début du clip) : `{ t, x, y, scale, rot, opacity, ease: 'smooth' | 'linear' | 'back' | 'hold' }`. Absent = comportement actuel. Le format de projet reste v3 (champ facultatif, ignoré par une version antérieure).
- `core/motion.ts` (pur, testé) : `motionAt(clip, local)` → transformation et opacité ; position sur une courbe de Catmull-Rom passant par les points, taille, rotation et opacité interpolées ; courbes de vitesse par segment. `simplify(samples)` (Douglas-Peucker) pour le geste mimé ; générateurs des mouvements tout faits.
- Rogner le début d'un clip décale ses points pour qu'ils restent sur les mêmes images ; scinder un clip répartit les points entre les deux morceaux (avec un point posé à la coupe) ; dupliquer les copie.
- Bornes à la lecture : 200 points par clip, valeurs bornées comme `transform`.
- Pas de nouvelle dépendance.

## Alternatives écartées

| Alternative | Raison du rejet |
|---|---|
| Animations d'entrée et de sortie seulement, comme les titres | Ne permet pas de mouvement libre dans le cadre (demande explicite) |
| Éditeur de courbes par propriété (type After Effects) | Puissant mais trop difficile pour un débutant ; les quatre façons d'aller au point suivant couvrent l'essentiel |
| Trajet dessiné puis parcouru à vitesse constante | Ne règle pas le rythme (pauses, accélérations) sans outil supplémentaire |

## Risques

| Risque | Probabilité | Conséquence | Parade |
|---|---|---|---|
| Glisser l'image pour la placer pose un point sans le vouloir | Moyenne | Mouvement non voulu | Un clip sans point se déplace comme aujourd'hui ; les points ne se posent qu'une fois le premier créé (par un mouvement tout fait, ou le bouton « Ajouter un point ») ; annulable |
| Rogner ou scinder un clip décale le mouvement | Moyenne | Trajet faux | Points recalés par les opérations de `core`, testés |
| Écart aperçu / export | Faible | Rendu différent | Même fonction `motionAt` des deux côtés ; test d'export comparant deux images |

## Plan de test

- Unitaires `core/motion.ts` : interpolation aux points et entre eux, chaque courbe, bornes, simplification d'un geste, rognage, scission, duplication, lecture d'un projet piégé.
- Intégration : export d'un clip animé, position vérifiée sur deux images.
- Application réelle : poser des points à la souris, déplacer un losange, mimer un geste, annuler.
- Performance : le calcul par image reste négligeable (quelques points par clip).

## Découpage

1. `core/motion.ts` + rendu à l'aperçu et à l'export + lecture du projet.
2. Poser et déplacer des points dans l'aperçu, trajet affiché.
3. Losanges dans la timeline, section Mouvement de l'inspecteur.
4. Mouvements tout faits.
5. Mimer le mouvement.
6. Outil MCP `ezcut_motion`.

## Décisions

- Le premier point se pose avec « Animer » (ou un mouvement tout fait, ou « Mimer ») ; ensuite, glisser l'image pose ou modifie le point à la tête de lecture. Un clip sans mouvement se déplace comme avant.
- Les titres et les clips de la piste principale ont l'outil dès la première version.
- Un point caché sous l'image à la tête de lecture laisse passer le clic : glisser l'image pose alors un nouveau point au lieu de déplacer celui d'un autre instant.
