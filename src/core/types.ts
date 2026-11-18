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

export interface Clip {
  id: string;
  mediaId: string;
  /** Point d'entrée dans le média, en secondes. */
  in: number;
  /** Durée sur la timeline, en secondes. */
  dur: number;
  volume: number;
  transform: Transform;
  color: Params;
  fx: FxInstance[];
  /** Transition vers le clip suivant. */
  transition: TransitionInstance | null;
}

export type TrackId = 'video' | 'audio';

export interface Project {
  version: 1;
  name: string;
  width: number;
  height: number;
  fps: number;
  media: Media[];
  /** Pistes magnétiques : les clips se suivent sans trou. */
  video: Clip[];
  audio: Clip[];
}

export const IMAGE_DURATION = 5;
export const MIN_CLIP = 0.1;

export function emptyProject(): Project {
  return { version: 1, name: 'Projet sans titre', width: 1920, height: 1080, fps: 30, media: [], video: [], audio: [] };
}
