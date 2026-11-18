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

export interface Transform { scale: number; x: number; y: number; rot: number; }

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
  transform: Transform;
  /** Opacité et mode de fusion, pour les pistes au-dessus de la piste principale. */
  opacity: number;
  blend: BlendMode;
  color: Params;
  fx: FxInstance[];
  /** Transition vers le clip suivant (piste principale uniquement). */
  transition: TransitionInstance | null;
  text: TextStyle | null;
}

/** video et audio sont magnétiques (clips à la suite, sans trou) ; overlay et text sont libres. */
export type TrackId = 'video' | 'audio' | 'overlay' | 'text';

export interface Project {
  version: 2;
  name: string;
  width: number;
  height: number;
  fps: number;
  media: Media[];
  video: Clip[];
  audio: Clip[];
  /** Incrustations : vidéos et images posées au-dessus de la piste principale. */
  overlay: Clip[];
  /** Titres. */
  text: Clip[];
}

export const IMAGE_DURATION = 5;
export const TEXT_DURATION = 3;
export const MIN_CLIP = 0.1;

export function emptyProject(): Project {
  return { version: 2, name: 'Projet sans titre', width: 1920, height: 1080, fps: 30, media: [], video: [], audio: [], overlay: [], text: [] };
}

export function defaultText(): TextStyle {
  return { content: 'Votre titre', font: 'Segoe UI', size: 0.1, weight: 700, color: '#ffffff', align: 'center', stroke: 0, strokeColor: '#000000', shadow: 0.5, box: 0, boxColor: '#000000', animIn: 'fade', animOut: 'fade', animDur: 0.4 };
}
