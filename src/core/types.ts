/** Modèle de données du projet. Aucune dépendance à l'interface ni à Electron. */

export type MediaKind = 'video' | 'audio' | 'image';

export interface Media {
  id: string;
  path: string;
  /** URL lisible par le moteur (protocole ezmedia://). */
  url: string;
  name: string;
  kind: MediaKind;
  /** Durée en secondes ; 0 pour une image. */
  duration: number;
  width: number;
  height: number;
  hasAudio: boolean;
}

export type ParamValue = number | boolean | number[];
export type Params = Record<string, ParamValue>;

export interface FxInstance {
  uid: string;
  /** Identifiant dans le catalogue, ex. "isf:VHS Glitch". */
  effectId: string;
  params: Params;
  on: boolean;
}

export interface TransitionInstance {
  effectId: string;
  params: Record<string, number[]>;
  /** Durée en secondes, centrée sur la coupe. */
  dur: number;
}

export interface Transform { scale: number; x: number; y: number; rot: number; /** Retournement horizontal, vertical. */ flipH?: boolean; flipV?: boolean; }

export const BLEND_MODES = ['normal', 'screen', 'multiply', 'add', 'overlay'] as const;
export type BlendMode = typeof BLEND_MODES[number];

export const TEXT_ANIMS = ['none', 'fade', 'slide', 'pop', 'type'] as const;
export type TextAnim = typeof TEXT_ANIMS[number];

/** Apparence d'un titre. Les tailles sont relatives à la hauteur de l'image, pour rester identiques à toute résolution. */
export interface TextStyle {
  content: string;
  font: string;
  /** Hauteur des lettres, en fraction de la hauteur de l'image. */
  size: number;
  weight: number;
  color: string;
  align: 'left' | 'center' | 'right';
  /** Épaisseur du contour, en fraction de la taille des lettres. 0 = aucun. */
  stroke: number;
  strokeColor: string;
  /** Ombre portée, de 0 à 1. */
  shadow: number;
  /** Opacité du cartouche derrière le texte, de 0 à 1. */
  box: number;
  boxColor: string;
  animIn: TextAnim;
  animOut: TextAnim;
  /** Durée de chaque animation, en secondes. */
  animDur: number;
}

export interface Clip {
  id: string;
  /** Vide pour un titre. */
  mediaId: string;
  /** Position sur la timeline, pour les pistes libres (incrustation, titres). Ignorée sur les pistes magnétiques. */
  start: number;
  /** Point d'entrée dans le média, en secondes. */
  in: number;
  /** Durée sur la timeline, en secondes. */
  dur: number;
  volume: number;
  /** Fondus du son, en secondes. */
  fadeIn: number;
  fadeOut: number;
  /** Fondus de l'image, en secondes : depuis et vers le noir sur la piste principale, la transparence au-dessus. */
  vfadeIn: number;
  vfadeOut: number;
  transform: Transform;
  /** Opacité et mode de fusion, pour les pistes au-dessus de la piste principale. */
  opacity: number;
  blend: BlendMode;
  color: Params;
  fx: FxInstance[];
  /** Transition vers le clip suivant (piste principale uniquement). */
  transition: TransitionInstance | null;
  text: TextStyle | null;
  /** Arrêt sur image : le clip montre l'image du média située à `in` pendant toute sa durée, sans son. */
  still: boolean;
  /** Clip désactivé : il garde sa place mais ne montre ni image ni son, à l'aperçu comme à l'export. */
  off: boolean;
}

/** Genre d'une piste. video est magnétique (clips à la suite, sans trou, avec transitions) ; les autres sont libres (chaque clip a sa position).
 *  sound reçoit le son détaché d'une vidéo, les voix, les bruitages ; audio la musique. */
export type TrackKind = 'video' | 'audio' | 'sound' | 'overlay' | 'text';
/** Identifiant d'une piste : son genre pour les cinq pistes de base, « genre-numéro » pour une piste ajoutée (overlay-2, text-3…). */
export type TrackId = string;
/** Pistes de base, toujours présentes, dans leur ordre par défaut de haut en bas. */
export const BASE_TRACKS: readonly TrackKind[] = ['text', 'overlay', 'video', 'sound', 'audio'];
/** Nombre maximal de pistes ajoutées par l'utilisateur. */
export const MAX_EXTRA_TRACKS = 12;

/** Repère posé sur la règle de la timeline. */
export interface Marker { id: string; t: number; name: string; color: string; }
export const MARKER_COLORS = ['#ff5d6c', '#ff9f43', '#ffd84d', '#22e3b6', '#4cc9f0', '#5f7cff', '#b388ff', '#9aa0ad'];
/** État d'une piste : muette (son coupé), masquée (image non affichée), verrouillée (clips non modifiables). */
export interface TrackState { muted?: boolean; hidden?: boolean; locked?: boolean; }

export interface Project {
  version: 3;
  name: string;
  width: number;
  height: number;
  fps: number;
  media: Media[];
  video: Clip[];
  /** Musique. */
  audio: Clip[];
  /** Son détaché, voix, bruitages. */
  sound: Clip[];
  /** Incrustations : vidéos et images posées au-dessus de la piste principale. */
  overlay: Clip[];
  /** Titres. */
  text: Clip[];
  /** Pistes ajoutées par l'utilisateur, par identifiant. */
  extra: Record<string, Clip[]>;
  /** Toutes les pistes, de haut en bas dans la timeline : pistes d'image (titres, incrustations) au-dessus de video, pistes de son en dessous.
   *  Plus une piste d'image est haute, plus elle est dessinée par-dessus. */
  order: TrackId[];
  markers: Marker[];
  tracks: Record<TrackId, TrackState>;
}

export const IMAGE_DURATION = 5;
export const TEXT_DURATION = 5;
export const MIN_CLIP = 0.1;

export function emptyProject(): Project {
  return { version: 3, name: 'Projet sans titre', width: 1920, height: 1080, fps: 30, media: [], video: [], audio: [], sound: [], overlay: [], text: [], extra: {}, order: [...BASE_TRACKS], markers: [], tracks: {} };
}

export function defaultText(): TextStyle {
  return { content: 'Votre titre', font: 'Segoe UI', size: 0.1, weight: 700, color: '#ffffff', align: 'center', stroke: 0, strokeColor: '#000000', shadow: 0.5, box: 0, boxColor: '#000000', animIn: 'fade', animOut: 'fade', animDur: 0.4 };
}
