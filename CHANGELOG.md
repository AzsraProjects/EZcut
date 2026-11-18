# Journal des modifications

Toutes les modifications notables d'EZcut sont consignées ici. Format décrit dans [docs/08-versions-mises-a-jour.md](docs/08-versions-mises-a-jour.md) ; les numéros de version suivent le versionnage sémantique. Ce fichier est affiché dans l'application (« Quoi de neuf »).

## 0.1.0 — non publiée

Première version d'EZcut : un éditeur complet pour monter, habiller et exporter une vidéo.

### Nouveautés

- Importer des vidéos, des sons et des images, par bouton ou glisser-déposer.
- Monter sur cinq pistes : titres, incrustation, piste principale, son et musique. Scinder, rogner, déplacer, réordonner, supprimer.
- Annuler et rétablir chaque action.
- Titres : 14 modèles (titres, synthés, sous-titres, animés) avec police, couleur, contour, ombre, cartouche et animations d'entrée et de sortie.
- Incrustation : poser une vidéo ou une image par-dessus la piste principale, avec opacité et mode de fusion.
- Dans l'aperçu, déplacer le clip sélectionné à la souris et le redimensionner à la molette.
- Banque de 71 effets, 21 filtres et 285 transitions, triée, avec aperçu au survol sur sa propre vidéo.
- 32 effets et filtres écrits pour EZcut : tremblements, zooms, flous, lueur, VHS, glitch, bandes cinéma, fondu au noir, et douze looks de couleur (noir et blanc, sépia, teal & orange, vintage, mat cinéma…).
- Effets et filtres séparés : un effet anime ou déforme l'image, un filtre en change les couleurs.
- Régler l'échelle, la position, la rotation, la couleur, le volume et les fondus du son de chaque clip.
- Choisir le format du projet : 16:9, 9:16, 1:1 ou 4:5.
- Aperçu toujours net : il est calculé à la taille où il est affiché, avec un réglage de qualité pour les ordinateurs modestes.
- Zoom de la timeline avec Ctrl + molette, centré sur le pointeur.
- Clic droit sur un clip, une piste, une transition ou un média : couper, copier, coller, dupliquer, rogner jusqu'à la tête de lecture, pivoter, retourner, copier les effets d'un clip à l'autre, retirer un média.
- Arrêt sur image à la tête de lecture.
- Volume à la souris : la ligne blanche d'un clip sonore se tire vers le haut ou le bas (Maj pour un réglage fin, double-clic pour revenir à 100 %).
- Désactiver un clip sans le supprimer ; insérer un média à la tête de lecture.
- Raccourcis identiques à ceux de Filmora pour couper, rogner, pivoter, détacher le son, copier les effets.
- Détacher le son d'une vidéo sur une piste Son à part, où il se règle, se coupe et se déplace seul ; la musique a sa propre piste, et s'y place librement.
- Fondus à la souris : une poignée dans chaque coin d'un clip règle le fondu de l'image (ou du son, sur les pistes de son).
- Rogner le début d'un clip suit la souris : le bord gauche se déplace, et la bande d'images défile dessous.
- Repères sur la règle de la timeline : touche M pour en poser un, double-clic pour lui donner un nom et une couleur, Maj + ↑ / ↓ pour aller de l'un à l'autre.
- Outil lame (touche C) : chaque clic sur un clip le coupe à cet endroit. Sans sélection, couper à la tête de lecture coupe toutes les pistes.
- Aimantation : un clip qu'on déplace ou qu'on rogne s'accroche aux coupes, aux repères et à la tête de lecture, avec une ligne-guide (touche N ; Alt la suspend).
- Pistes : couper le son d'une piste entière, la masquer, la verrouiller, depuis son en-tête.
- Ajouter des pistes (bouton « + Piste » : titres, par-dessus, son, musique) et les déplacer en tirant leur en-tête ou par clic droit : plusieurs titres et plusieurs images peuvent être à l'écran en même temps, la piste la plus haute passant devant. Un clip change de piste en le faisant glisser vers une piste du même genre.
- Refermer un vide sur une piste (clic droit dans le vide), ou supprimer un clip en refermant le vide (Maj + Suppr).
- Transitions : tirer un bord pour changer la durée ; « Appliquer à toutes les coupes » d'un clic.
- Retournement horizontal et vertical, et quart de tour, dans l'inspecteur.
- Enregistrer l'image affichée dans l'aperçu en PNG, à la résolution du projet.
- Favoris dans la banque d'effets, de filtres et de transitions.
- Un média dont le fichier a été déplacé est signalé « Introuvable » et se retrouve d'un clic droit ; un fichier peut aussi être remplacé par un autre, ses clips suivent.
- Raccourcis supplémentaires : ↑ / ↓ (coupe précédente, suivante), Maj + ← / → (une seconde), Maj + Début / Fin (bords du clip), Ctrl + = / - et Maj + Z (zoom), Ctrl + N / I / E, Alt + Entrée (plein écran).
- Un titre dure 5 secondes par défaut.
- Disposition libre : chaque panneau se redimensionne, se masque, et la bibliothèque et l'inspecteur peuvent échanger de côté.
- Enregistrer et rouvrir un projet ; sauvegarde automatique toutes les 20 secondes, proposée à la restauration après une fermeture inattendue.
- Exporter en MP4, H.264 ou H.265, de 720p à 4K, avec l'encodeur de la carte graphique quand il existe (NVIDIA, Intel, AMD).
- Lien avec Claude : une fois activé, Claude peut piloter EZcut depuis VS Code — importer, monter, habiller, vérifier à l'image, exporter.
- Un export lancé par Claude s'affiche dans la fenêtre d'export, avec l'avancement, le temps restant et un bouton pour l'annuler ; le projet ne peut pas changer tant qu'il tourne.
- Chaque clip de la timeline est détouré en blanc, et en vert quand il est sélectionné : deux morceaux d'une même vidéo coupée restent distincts, la coupe se voit.
- Sélectionner plusieurs clips : rectangle tracé à la souris depuis le vide d'une piste, Ctrl + clic pour en ajouter ou en retirer un, Maj + clic pour toute une suite sur la même piste, Ctrl + A pour tout, clic droit sur une piste pour tous ses clips. Le groupe se supprime d'un coup, se déplace ensemble sur les pistes de titres, d'incrustation et de son, reçoit les effets collés et se coupe le son ensemble.
- Enregistrement automatique : une fois enregistré une première fois, le projet se réenregistre tout seul dans son fichier toutes les 20 secondes après une modification (jamais au milieu d'un geste ni pendant un export). Désactivable dans le panneau Projet.
- Volume jusqu'à 400 % (+12 dB) pour chaque clip et pour chaque piste, avec un réglage dans l'en-tête de la piste ; les deux se multiplient, à l'aperçu comme à l'export. La ligne de volume est à mi-hauteur pour 100 %, en orange au-dessus, graduée en décibels ; un limiteur empêche la saturation.
- Outil Mouvement : faire bouger une image, une vidéo en incrustation, un titre ou un clip de la piste principale par points clés. On place la tête de lecture et on fait glisser l'image dans l'aperçu (la molette règle la taille) : un point est posé ; entre deux points, l'image glisse sur une courbe. Le trajet s'affiche en pointillés dans l'aperçu, ses points se déplacent à la souris ; dans la timeline, des losanges se glissent pour changer le rythme. Pour chaque point : Doux, Régulier, Rebond ou Saut vers le suivant. Quatorze mouvements tout faits (entrer et sortir par chaque bord, traverser, tomber et rebondir, pop, flotter, zoom avant et arrière), et « Mimer le mouvement » : au ralenti, l'image suit la souris, et le geste devient quelques points retouchables. Même rendu à l'aperçu et à l'export ; outil `ezcut_motion` pour le lien avec Claude.
- Bibliothèque : un média déjà utilisé dans le montage porte une pastille verte (avec le nombre de clips s'il y en a plusieurs) et un contour vert.
- Accueil au lancement : projets récents (nom, dossier, dernière modification), nouveau projet, ouvrir un projet.
- Vignettes de la timeline faites par FFmpeg à partir des seules images clés et gardées en cache : un projet de 37 médias a toutes ses bandes en moins de 10 s à la première ouverture, aussitôt ensuite, sans ralentir la lecture.
- Lecture sans à-coup aux coupes : le morceau suivant d'une vidéo coupée reprend le lecteur du précédent au lieu d'en relancer un autre, le clip suivant démarre une fraction de seconde avant la coupe, et après un clip très court (effet TV, plan éclair) le suivant est préparé à l'avance.
- Lecture fluide pendant le chargement : quand la vidéo attend ses données, la musique l'attend aussi au lieu de sauter comme un disque rayé.
- Vignettes de la timeline nettes à tout zoom et à toute hauteur de piste : chaque case montre l'instant de la vidéo qui passe sous elle.
- Export environ huit fois plus rapide pour les vidéos MP4 et MOV en H.264 ou H.265 : elles sont décodées dans l'ordre par la carte graphique au lieu d'une recherche par image. Mesuré : une minute de 1080p30 en 37 s au lieu de 4 min 41 s ; le best-of de test (4 min 49 s, 45 clips) en 3 min 1 s. L'image exportée est aussi plus exacte.
- Journal local de l'application, pour comprendre un problème après coup.
- Installateur Windows : FFmpeg est inclus, rien d'autre à installer.
- Vérification des mises à jour et notes de version dans l'application.

### Problèmes connus

- Une transition fige la dernière image du premier clip et la première du second pendant qu'elle se joue, au lieu de faire se chevaucher les deux clips.
- Un effet posé sur une incrustation en change les couleurs mais pas la forme : un tremblement ou un zoom n'y déplace pas le cadre.
- Pas d'images clés : un réglage vaut pour toute la durée du clip.
- Pas de réglage de vitesse ni d'inversion.
- Les réglages des effets et transitions d'origine communautaire portent leur nom anglais.
- Une vidéo sans étiquette de couleurs ressort de l'export avec des teintes légèrement décalées (matrice de couleurs à préciser).
- L'image d'une vidéo dans un autre format que MP4 ou MOV en H.264 ou H.265 (ou tournée par le téléphone) est encore obtenue par recherche dans le fichier : l'export de ces vidéos reste lent, et peut s'y décaler d'une image sur un fichier à cadence variable.
- Le volume d'un clip ne peut pas dépasser 100 %, et il n'y a pas de réglage de balance gauche-droite.
- Un seul clip peut être sélectionné à la fois : pas de sélection multiple ni de groupe.
- L'installateur n'est pas signé : Windows affiche un avertissement à l'installation.
- La mise à jour automatique n'a pas encore pu être essayée, faute de version publiée.
- Les panneaux ne se détachent pas en fenêtres séparées.
- L'interface n'existe qu'en français.
