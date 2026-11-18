# ADR-0004 — Pistes ajoutées et ordre des pistes

- Statut : Accepté
- Date : 2026-11-18
- Dépend de : [ADR-0001](0001-stack-technique.md)

## Contexte

Jusqu'à la version 2 du format de projet, un montage avait cinq pistes fixes, inscrites comme champs du projet : `text`, `overlay`, `video`, `sound`, `audio`. Deux titres ou deux incrustations ne pouvaient donc pas être à l'écran au même instant, et l'ordre de superposition était figé (les titres toujours au-dessus des incrustations). L'utilisateur demande de pouvoir ajouter des pistes et de les déplacer librement.

Contraintes : les projets existants doivent s'ouvrir sans perte ; la piste principale reste unique et magnétique (clips à la suite, transitions) ; le fichier de projet peut venir d'un inconnu et doit rester entièrement validé ; le lien de pilotage désigne déjà les pistes par leur identifiant.

## Décision

1. **Les cinq pistes de base restent ce qu'elles sont.** Même identifiant, même champ dans le projet ; elles ne se suppriment pas. Un projet sans piste ajoutée a exactement la forme d'avant, à deux champs près.
2. **Une piste ajoutée s'appelle `<genre>-<numéro>`** (`overlay-2`, `text-3`, `sound-2`, `audio-2`), numéro de 2 à 99, et ses clips vivent dans `extra`, un dictionnaire identifiant → clips. Le genre d'une piste est la partie de son identifiant avant le tiret ; tout le comportement (piste libre ou magnétique, image ou son, médias acceptés) découle du genre. Il n'y a pas de seconde piste `video`.
3. **`order` liste toutes les pistes de haut en bas** dans la timeline. Les pistes d'image (genres `text` et `overlay`) sont au-dessus de `video`, les pistes de son (`sound`, `audio`) en dessous ; à l'intérieur de chaque groupe l'ordre est libre, titres et incrustations mêlés. Pour l'image, l'ordre est aussi celui de la composition : plus une piste est haute, plus elle est dessinée par-dessus.
4. **Douze pistes ajoutées au plus** par projet.
5. **Le format passe en version 3.** La lecture accepte les versions 1, 2 et 3. Une piste ajoutée dont l'identifiant ne suit pas la règle est ignorée ; ses clips passent par les mêmes contrôles que ceux de la piste de base du même genre ; un `order` absent, incomplet ou incohérent est reconstruit (chaque piste une fois, chacune dans son groupe, l'ordre relatif donné conservé). L'état d'une piste (muette, masquée, verrouillée) n'est gardé que pour une piste qui existe.
6. **Le code n'indexe plus le projet par piste.** `clipsOf(projet, piste)` et `trackIds(projet)` sont les seuls accès ; quatre opérations pures s'ajoutent : `addTrack`, `removeTrack`, `moveTrack`, `moveToTrack`.
7. **Export du son** : une suite de segments par piste de son ou d'incrustation qui contient du son ; le processus principal mixe jusqu'à 24 pistes.

## Alternatives écartées

| Alternative | Raison du rejet |
|---|---|
| Un tableau unique de pistes `{ id, kind, clips }` remplaçant les cinq champs | Modèle plus régulier, mais il réécrit tout le code et tous les tests qui lisent `project.video`, et impose une migration lourde des fichiers pour un gain nul à ce stade. À reconsidérer si la piste principale devient elle aussi multiple |
| Identifiants aléatoires et nom libre par piste | Un identifiant lisible (`overlay-2`) sert tel quel dans le lien de pilotage et donne le nom affiché (« Par-dessus 2 ») sans champ de plus à valider. Le renommage pourra s'ajouter comme un champ d'état de piste |
| Ordre entièrement libre, son et image mêlés | La piste principale au milieu, l'image au-dessus et le son en dessous est le repère visuel de la timeline ; le mélange n'apporte rien à la composition |
| Nombre de pistes illimité | Chaque piste d'incrustation active est une vidéo décodée de plus à l'aperçu et une entrée de plus au mixage ; une borne garde le fichier, l'aperçu et la commande FFmpeg dans des limites connues |

## Conséquences

- Plusieurs titres et plusieurs incrustations peuvent être à l'écran en même temps, et un titre peut passer sous une incrustation.
- Un projet enregistré par cette version n'est plus lisible par une version antérieure (version 3 refusée) : c'est acceptable tant que la 0.1.0 n'est pas publiée.
- Supprimer une piste libère son numéro, qui peut être repris par la piste créée ensuite. La hauteur mémorisée d'une piste est remise à zéro à sa création pour ne pas hériter de l'ancienne.
- Le verrou d'une piste protège aussi contre sa suppression, et une piste verrouillée ne peut pas recevoir un clip venu d'une autre.
- À surveiller : le coût de l'aperçu avec plusieurs incrustations vidéo simultanées (non mesuré), et la lisibilité de la timeline au-delà de huit à dix pistes (elle défile verticalement, la piste Vidéo gardant une hauteur minimale).
