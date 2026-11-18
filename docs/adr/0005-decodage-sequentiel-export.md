# ADR-0005 — Décodage séquentiel des vidéos à l'export

- Statut : Accepté
- Date : 2026-11-18
- Dépend de : [ADR-0001](0001-stack-technique.md)

## Contexte

L'export rend chaque image avec le compositeur de l'aperçu (WebGL) puis l'envoie à FFmpeg. Jusqu'ici, chaque vidéo source était amenée à l'instant voulu par une recherche (`currentTime`) sur un élément `<video>`. Le lecteur de Chromium redécode alors depuis l'image clé précédente à chaque image demandée : avec les clips Twitch (une image clé toutes les deux secondes), l'export plafonnait à 6 images par seconde en 1080p30 sur une carte NVIDIA, soit 4 min 41 s pour une minute de vidéo. La carte graphique décodait à 82 % et n'encodait presque rien.

## Décision

1. **Pendant l'export, les vidéos MP4 et MOV sont décodées dans l'ordre avec WebCodecs** (`VideoDecoder`, décodeur matériel quand il existe). Chaque image demandée fait avancer le décodeur ; il ne repart d'une image clé qu'en cas de retour en arrière ou de saut de plus de 3 s. L'image retenue est la dernière dont l'instant de présentation ne dépasse pas l'instant demandé, comme pour le lecteur.
2. **La table des images est lue par un module maison, `src/engine/mp4.ts`** (boîtes `moov`, `stsd`, `stts`, `ctts`, `stsc`, `stsz`, `stco`/`co64`, `stss`, `elst`), sans nouvelle dépendance. Les données sont lues par plages d'octets sur le protocole `ezmedia://`, qui ne sert que les fichiers déjà acceptés : aucun nouvel accès au disque.
3. **Formats couverts** : H.264 (`avc1`, `avc3`) et H.265 (`hvc1`, `hev1`). Tout le reste — autre conteneur, autre codec, vidéo tournée par une matrice de rotation, MP4 fragmenté, liste de montage à plusieurs segments ou ralentie, taille d'image différente de celle du fichier importé, fichier abîmé ou démesuré (bornes : moov 64 Mo, 2 millions d'images, 64 Mo par image, 10 000 boîtes par niveau), codec que la machine ne décode pas, décodeur en panne ou bloqué plus de 15 s — **reprend l'ancienne voie** (recherche sur `<video>`), fichier par fichier, avec une ligne au journal.
4. **Deux décodeurs au plus par fichier**, pour qu'une transition entre deux morceaux d'un même fichier ne fasse pas repartir le décodeur à chaque image. Les décodeurs d'un fichier qui n'est plus à l'image sont fermés ; une image déjà dans la texture (arrêt sur image, côté figé d'une transition) n'est pas redécodée.
5. L'aperçu ne change pas : il garde la lecture par `<video>`.

## Alternatives écartées

| Alternative | Raison du rejet |
|---|---|
| mp4box.js (BSD-3) pour lire les MP4 | Bibliothèque complète et éprouvée, mais 200 Ko de plus pour n'en utiliser que la table des images ; le module maison fait 200 lignes, est borné contre les fichiers piégés et testé sur des fichiers produits par FFmpeg |
| Faire décoder les sources par FFmpeg dans le processus principal et envoyer les images brutes à l'interface | Double le trafic entre processus (8 Mo par image dans chaque sens en 1080p) et demande de reproduire dans FFmpeg le calage des clips ; WebCodecs garde les images sur la carte graphique |
| Lire la vidéo à vitesse normale et capturer les images au passage (`requestVideoFrameCallback`) | Pas d'accès garanti à chaque image ni à son instant exact ; des images sautées ou doublées |
| Remplacer aussi le décodage de l'aperçu | Hors sujet : l'aperçu suit la lecture en temps réel, où `<video>` convient |

## Conséquences

- Export mesuré le 2026-11-18 sur une vidéo de test 1080p30 d'une minute : 281 s avant, 37,5 s après (48 images par seconde) ; images identiques à celles de l'ancienne voie là où celle-ci tombait juste, et plus exactes là où elle se décalait d'une image.
- Le reste du temps d'export se passe désormais à relire chaque image de la carte graphique et à l'envoyer à FFmpeg ; c'est la prochaine piste d'accélération.
- Écart de couleurs constaté à l'occasion, antérieur à ce changement et commun aux deux voies : une vidéo sans étiquette de couleurs ressort avec des teintes légèrement décalées (environ 26 dB de PSNR face à la source). À traiter à part (matrice BT.601 ou BT.709 à l'export).
- Un format non couvert reste aussi lent qu'avant, sans erreur.
