# Journal des modifications

Toutes les modifications notables d'EZcut sont consignées ici. Format décrit dans [docs/08-versions-mises-a-jour.md](docs/08-versions-mises-a-jour.md) ; les numéros de version suivent le versionnage sémantique. Ce fichier est affiché dans l'application (« Quoi de neuf »).

## 0.1.0 — non publiée

Première version d'EZcut : un éditeur complet pour monter, habiller et exporter une vidéo.

### Nouveautés

- Importer des vidéos, des sons et des images, par bouton ou glisser-déposer.
- Monter sur quatre pistes : titres, incrustation, piste principale et audio. Scinder, rogner, déplacer, réordonner, supprimer.
- Annuler et rétablir chaque action.
- Titres : 14 modèles (titres, synthés, sous-titres, animés) avec police, couleur, contour, ombre, cartouche et animations d'entrée et de sortie.
- Incrustation : poser une vidéo ou une image par-dessus la piste principale, avec opacité et mode de fusion.
- Dans l'aperçu, déplacer le clip sélectionné à la souris et le redimensionner à la molette.
- Banque de 71 effets, 21 filtres et 285 transitions, triée, avec aperçu au survol sur sa propre vidéo.
- 32 effets et filtres écrits pour EZcut : tremblements, zooms, flous, lueur, VHS, glitch, bandes cinéma, fondu au noir, et douze looks de couleur (noir et blanc, sépia, teal & orange, vintage, mat cinéma…).
- Effets et filtres séparés : un effet anime ou déforme l'image, un filtre en change les couleurs.
- Régler l'échelle, la position, la rotation, la couleur, le volume et les fondus du son de chaque clip.
- Choisir le format du projet : 16:9, 9:16, 1:1 ou 4:5.
- Disposition libre : chaque panneau se redimensionne, se masque, et la bibliothèque et l'inspecteur peuvent échanger de côté.
- Enregistrer et rouvrir un projet ; sauvegarde automatique toutes les 20 secondes, proposée à la restauration après une fermeture inattendue.
- Exporter en MP4, H.264 ou H.265, de 720p à 4K, avec l'encodeur de la carte graphique quand il existe (NVIDIA, Intel, AMD).
- Lien avec Claude : une fois activé, Claude peut piloter EZcut depuis VS Code — importer, monter, habiller, vérifier à l'image, exporter.
- Journal local de l'application, pour comprendre un problème après coup.
- Installateur Windows : FFmpeg est inclus, rien d'autre à installer.
- Vérification des mises à jour et notes de version dans l'application.

### Problèmes connus

- Une transition fige la dernière image du premier clip et la première du second pendant qu'elle se joue, au lieu de faire se chevaucher les deux clips.
- Un effet posé sur une incrustation en change les couleurs mais pas la forme : un tremblement ou un zoom n'y déplace pas le cadre.
- Une seule piste de titres et une seule piste d'incrustation : deux titres ne peuvent pas être affichés en même temps.
- Pas d'images clés : un réglage vaut pour toute la durée du clip.
- Pas de réglage de vitesse ni d'inversion.
- Les réglages des effets et transitions d'origine communautaire portent leur nom anglais.
- L'export avance à peu près à la vitesse de lecture ; l'image est positionnée par recherche dans la vidéo source, et peut être décalée d'une position sur un fichier à cadence variable (téléphone).
- Le volume d'un clip ne peut pas dépasser 100 %.
- L'installateur n'est pas signé : Windows affiche un avertissement à l'installation.
- La mise à jour automatique n'a pas encore pu être essayée, faute de version publiée.
- Les panneaux ne se détachent pas en fenêtres séparées.
- L'interface n'existe qu'en français.
