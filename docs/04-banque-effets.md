# 04 — Banque d'effets communautaire

Objectif : l'utilisateur ouvre un panneau, parcourt des effets, filtres et transitions créés par la communauté, et voit le rendu sur sa propre vidéo simplement en passant la souris dessus.

## Effets, filtres, transitions

La banque distingue trois familles, chacune dans son onglet :

| Famille | Ce que c'est | Exemples |
|---|---|---|
| **Effet** | Anime, déforme ou stylise l'image | Tremblement, zoom, glitch, flou, miroir, VHS |
| **Filtre** | Change les couleurs et l'ambiance, sans toucher à la forme | Noir et blanc, sépia, vignette, bleach bypass |
| **Transition** | Relie deux clips | Fondu, volet, zoom croisé |

Techniquement, effets et filtres sont le même objet (un shader appliqué à un clip). Le classement se fait à la construction du catalogue, d'après les catégories déclarées par chaque shader : couleur seule → filtre, tout le reste → effet.

La collection ouverte contient peu d'effets de mouvement prêts à l'emploi (un tremblement, deux zooms). Les variantes attendues d'un éditeur grand public — plusieurs types de tremblement, zooms animés, à-coups — seront des effets écrits pour EZcut, au même format.

## Ce qui existe en open source

Oui, il existe des banques ouvertes. Aucune n'est « prête à brancher » dans un éditeur, mais plusieurs sont directement exploitables.

> gl-transitions et ISF-Files ont été vérifiés à la source et testés le 2026-11-18 ([résultats](maquettes/README.md)). Les licences des autres sources sont indiquées de mémoire et restent à revérifier avant intégration.

### Directement compatibles avec le moteur proposé (shaders GLSL)

| Source | Contenu | Licence | Usage dans EZcut |
|---|---|---|---|
| **gl-transitions** | 300 transitions, chacune un petit shader avec paramètres déclarés. 297 utilisables telles quelles, toutes compilent | MIT (295), BSD (2) | Base du catalogue de transitions |
| **ISF-Files (Interactive Shader Format)** | 148 effets applicables à une vidéo (glitch, flous, distorsions, stylisations), plus 120 générateurs. 146 compilent, 126 retenus. Format standardisé qui décrit les paramètres de chaque effet | MIT | Base du catalogue d'effets ; le format sert aussi de modèle pour nos packs |

Ces deux collections sont de qualité inégale : certaines entrées sont des démonstrations techniques plus que des effets de montage. Le catalogue livré avec EZcut sera une **sélection** triée et réglée (valeurs par défaut, noms, catégories), pas la collection brute.
| **LUT au format `.cube`** | Looks colorimétriques ; nombreux packs gratuits | Variable selon le pack | Catalogue de looks ; seuls les packs à licence claire entrent dans le registre |

### Exploitables avec précautions

| Source | Contenu | Obstacle |
|---|---|---|
| **Shadertoy** | Des dizaines de milliers de shaders | La licence par défaut interdit l'usage commercial ; seuls les shaders explicitement placés sous licence permissive par leur auteur sont utilisables, au cas par cas |
| **Shaders libretro** | Très bons rendus VHS, CRT, rétro | Licences mélangées, format à convertir |
| **frei0r** | Environ 130 effets vidéo, utilisés par Shotcut et Kdenlive | GPL, et calculés sur processeur : pas d'aperçu temps réel dans notre moteur. Utilisables seulement à l'export via FFmpeg |
| **Filtres FFmpeg** | Plusieurs centaines de filtres | Pas de rendu temps réel identique dans l'aperçu ; réservés aux traitements hors ligne (stabilisation, réduction de bruit) |
| **OpenFX** | Standard de plugins des logiciels professionnels | Plugins natifs C++, incompatibles avec la stack proposée ; à réétudier après la 1.0 |

### Conclusion

Le catalogue de départ s'appuie sur gl-transitions et ISF, complétés par nos propres effets. Les autres sources alimentent le catalogue au cas par cas, après vérification de licence et conversion.

## Le registre EZcut

Un dépôt GitHub public distinct (nom proposé : `ezcut-effects`) sert de banque communautaire.

- Il contient les packs et un fichier d'index généré automatiquement.
- Proposer un effet se fait par pull request. Une vérification automatique contrôle le manifeste, la licence déclarée, la compilation du shader, la taille et génère la vignette.
- L'application télécharge l'index, affiche le catalogue, et ne télécharge un pack que lorsqu'on l'installe ou qu'on le survole pour la première fois.
- Les packs installés fonctionnent hors ligne.
- Une future boutique n'est qu'une seconde source d'index : le logiciel accepte déjà plusieurs sources.

## Format d'un pack `.ezfx`

Une archive contenant :

| Fichier | Rôle |
|---|---|
| `manifest.json` | Identifiant, nom, version, auteur, licence (identifiant SPDX obligatoire), catégorie, type, version minimale d'EZcut, attribution de la source d'origine |
| Shader(s) | Au format ISF pour les effets, au format gl-transitions pour les transitions |
| `preview.webp` | Vignette animée de repli, affichée tant que le pack n'est pas chargé |
| Ressources | Textures ou fichier `.cube` éventuels |

Types de pack : effet, transition, look (LUT), préréglage (réglages d'effets existants), modèle de texte.

Un pack ne contient aucun code exécutable hors shader. Voir [ADR-0003](adr/0003-format-effets.md).

## Aperçu au survol

### Comportement

1. La souris s'arrête sur une tuile pendant 150 ms environ.
2. La tuile affiche l'effet appliqué à la vidéo de l'utilisateur, en boucle sur deux secondes autour de la tête de lecture.
3. La souris quitte la tuile : l'aperçu s'arrête, la vignette statique revient.
4. Un clic ou un glisser-déposer applique l'effet au clip.

### Quelle image sert de source

| Situation | Source de l'aperçu |
|---|---|
| Un clip est sélectionné | Ce clip, autour de la tête de lecture |
| Aucun clip sélectionné | L'image composée sous la tête de lecture |
| Timeline vide | Un extrait d'exemple fourni avec le logiciel |
| Transition | Les deux clips de part et d'autre du point de coupe le plus proche ; à défaut deux extraits d'exemple |
| Pack non installé | La vignette `preview.webp` du registre, puis l'aperçu réel une fois le pack chargé |

### Option complémentaire

Maintenir une touche pendant le survol (proposition : `Alt`) affiche l'aperçu en grand dans la fenêtre d'aperçu principale, sans rien modifier au projet.

### Contraintes techniques

- Le rendu des tuiles utilise le même compositeur que l'aperçu principal, en basse résolution (environ 320 × 180).
- Un seul contexte graphique partagé pour tout le panneau : les navigateurs limitent le nombre de contextes simultanés.
- Une seule tuile animée à la fois.
- Les shaders sont compilés à l'avance en arrière-plan pour les tuiles visibles.
- L'aperçu au survol ne doit jamais ralentir la lecture en cours : il est suspendu si la lecture principale perd des images.

### Budgets

| Mesure | Cible |
|---|---|
| Délai entre l'arrêt de la souris et la première image de l'aperçu (pack installé) | Moins de 100 ms |
| Cadence de l'aperçu en tuile | Au moins 24 images par seconde |
| Défilement du catalogue de 500 tuiles | Fluide, sans saccade |

## Organisation du panneau

- Onglets : Effets, Transitions, Looks, Textes, Mes préréglages.
- Catégories (glitch, rétro, flou, lumière, couleur, distorsion, cinéma), recherche, favoris, récents.
- Filtre « Installés » / « Communauté ».
- Chaque tuile affiche le nom, l'auteur et un indicateur de téléchargement. La licence et la source sont visibles dans le détail.

Maquette : voir [05 — Interface](05-ui-ux.md#banque-deffets).

## Sécurité et qualité

- Validation automatique à la contribution et à l'import local : schéma du manifeste, taille maximale, compilation, temps de rendu mesuré.
- Un shader trop lent est signalé « lourd » dans le catalogue plutôt que refusé.
- Tout pack téléchargé est vérifié par empreinte par rapport à l'index.
- Possibilité de retirer un pack de l'index ; l'application le signale au prochain rafraîchissement.

## Questions ouvertes

- Qui modère les contributions au registre, et selon quels critères de qualité ?
- Accepte-t-on les packs sous licence non commerciale (par exemple issus de Shadertoy), avec un marquage visible, ou les exclut-on ?
