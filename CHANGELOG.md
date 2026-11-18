# Journal des modifications

Toutes les modifications notables d'EZcut sont consignées ici. Format décrit dans [docs/08-versions-mises-a-jour.md](docs/08-versions-mises-a-jour.md) ; les numéros de version suivent le versionnage sémantique.

## Non publié — 0.1.0

Premier éditeur fonctionnel.

### Nouveautés

- Importer des vidéos, des sons et des images, par bouton ou glisser-déposer.
- Monter sur une piste vidéo et une piste audio : ajouter, scinder, rogner, réordonner, supprimer.
- Annuler et rétablir chaque action.
- Banque de 122 effets, 25 filtres et 297 transitions, avec aperçu au survol sur sa propre vidéo.
- Effets et filtres séparés : un effet anime ou déforme l'image, un filtre en change les couleurs.
- Régler l'échelle, la position, la rotation, la couleur et le volume de chaque clip.
- Choisir le format du projet : 16:9, 9:16, 1:1 ou 4:5.
- Enregistrer et rouvrir un projet.
- Exporter en MP4, de 720p à 4K.

### Problèmes connus

- La banque est la collection open source brute : certains effets sont des démonstrations techniques plus que des outils de montage, et quelques-uns ne montrent rien sur une image fixe (effets de traînée, qui ont besoin de mouvement). Le tri reste à faire.
- Une transition fige la dernière image du premier clip et la première du second pendant qu'elle se joue, au lieu de faire se chevaucher les deux clips.
- L'export n'utilise pas encore la carte graphique pour l'encodage ; il tourne à peu près à la vitesse de lecture en 720p, plus lentement au-delà.
- L'export positionne chaque image par recherche dans la vidéo source ; sur des fichiers à cadence variable (téléphone), une image peut être décalée d'une position.
- Le volume d'un clip ne peut pas dépasser 100 %.
- FFmpeg doit être installé séparément.
- Pas d'installateur ni de mise à jour automatique : l'application se lance depuis le code source.
- Pas de sauvegarde automatique ni d'avertissement à la fermeture avec des modifications non enregistrées.
- L'interface n'existe qu'en français.
