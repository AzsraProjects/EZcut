# ADR-0001 — Stack technique

- Statut : Accepté sous condition des prototypes R1 à R5
- Date : 2026-11-18

## Contexte

EZcut cible d'abord Windows 10 et 11, avec macOS comme objectif à terme. Il doit avoir une interface moderne et animée, un rendu temps réel avec effets, un export accéléré par le GPU, une mise à jour automatique depuis GitHub, et une banque d'effets communautaire avec aperçu au survol. Le développement est mené par une très petite équipe assistée par des agents IA : la vitesse d'itération sur l'interface et la disponibilité de briques existantes pèsent lourd.

Fait déterminant : les effets et transitions open source réutilisables (gl-transitions, ISF) sont des shaders GLSL.

## Décision

- Coque : **Electron**.
- Interface : **TypeScript + React**.
- Moteur de rendu : **WebGL2**, avec une couche d'abstraction permettant de passer à WebGPU.
- Décodage d'aperçu : **WebCodecs**, proxys FFmpeg en repli.
- Import, analyse, export : **FFmpeg / ffprobe** en processus séparés.
- Organisation : monorepo, modules décrits dans [02 — Architecture](../02-architecture.md).

La décision est conditionnée aux prototypes R1 à R5 de la phase 0. Si R1 (débit d'export) ou R2 (précision du positionnement) échouent sans contournement acceptable, cet ADR est rejeté au profit d'une alternative.

## Alternatives écartées

| Alternative | Avantages | Raison du rejet |
|---|---|---|
| **Tauri** (interface web, cœur Rust) | Installateur bien plus léger, moins de mémoire | Même moteur web que la proposition, mais transfert d'images volumineuses entre l'interface et le cœur plus délicat, et un second langage à maintenir. Reste le premier repli si le poids d'Electron devient un problème |
| **.NET (WinUI 3 ou Avalonia) + Direct3D** | Natif Windows, léger, bon accès au matériel | Les shaders communautaires GLSL devraient être convertis ; interface animée plus longue à produire ; moins de briques existantes pour une timeline |
| **C++ / Qt + MLT** (base de Shotcut et Kdenlive) | Moteur de montage éprouvé, performances maximales | Coût de développement et de maintenance très élevé pour une petite équipe ; aperçu au survol et interface moderne à construire entièrement |
| **Application web pure** | Aucune installation | Pas d'accès aux encodeurs matériels ni aux gros fichiers locaux dans de bonnes conditions |

## Conséquences

**Facilité**
- Les effets communautaires tournent sans conversion.
- Un seul compositeur pour l'aperçu, les vignettes au survol et l'export.
- Mise à jour automatique et notes de version outillées d'origine.

**Portage macOS**
- La stack est multiplateforme : interface, moteur de rendu et format de projet sont repris sans changement.
- Tout ce qui dépend du système reste confiné au module `desktop` et à la détection des encodeurs dans `export` (VideoToolbox sur macOS à la place de NVENC, AMF et QSV).
- Aucun chemin Windows ni appel système Windows hors de ces deux endroits ; les chemins de fichiers sont toujours manipulés par les fonctions de la plateforme.
- À prévoir le moment venu : binaires FFmpeg pour macOS, signature et notarisation Apple (compte développeur payant), tests sur puces Apple.

**Coût**
- Installateur d'environ 100 à 150 Mo et consommation mémoire supérieure à une application native ; l'objectif « léger » est à comprendre comme « réactif », pas « petit ».
- Les formats que le navigateur ne décode pas passent par des proxys.
- Les traitements qui n'existent pas en shader (stabilisation, suivi de mouvement) devront passer par FFmpeg ou des modules natifs.

**À surveiller**
- Débit de l'export en 4K.
- Mémoire sur les projets longs.
