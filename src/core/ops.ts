/** Opérations de montage. Fonctions pures : elles reçoivent un projet et en renvoient un nouveau. */
import { IMAGE_DURATION, MIN_CLIP, type Clip, type FxInstance, type Media, type ParamValue, type Project, type TrackId, type TransitionInstance } from './types';

let counter = 0;
export const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(counter++).toString(36)}`;

const clone = <T>(v: T): T => structuredClone(v);

export function trackStarts(clips: Clip[]): number[] {
  let s = 0;
  return clips.map(c => { const r = s; s += c.dur; return r; });
}
export const trackDuration = (clips: Clip[]) => clips.reduce((s, c) => s + c.dur, 0);
export const projectDuration = (p: Project) => Math.max(trackDuration(p.video), trackDuration(p.audio));

/** Clip sous l'instant t d'une piste, avec son index et le temps local. */
export function clipAt(clips: Clip[], t: number): { index: number; clip: Clip; local: number; start: number } | null {
  let s = 0;
  for (let i = 0; i < clips.length; i++) {
    const c = clips[i];
    if (t < s + c.dur || i === clips.length - 1) {
      if (t > s + c.dur + 1e-6) return null;
      return { index: i, clip: c, local: Math.min(Math.max(0, t - s), c.dur), start: s };
    }
    s += c.dur;
  }
  return null;
}

export function findClip(p: Project, id: string): { track: TrackId; index: number; clip: Clip } | null {
  for (const track of ['video', 'audio'] as const) {
    const index = p[track].findIndex(c => c.id === id);
    if (index >= 0) return { track, index, clip: p[track][index] };
  }
  return null;
}

export function makeClip(media: Media): Clip {
  return {
    id: newId('clip'), mediaId: media.id, in: 0,
    dur: media.kind === 'image' ? IMAGE_DURATION : Math.max(MIN_CLIP, media.duration),
    volume: 1, transform: { scale: 1, x: 0, y: 0, rot: 0 }, color: {}, fx: [], transition: null,
  };
}

export function addMedia(p: Project, media: Media[]): Project {
  const n = clone(p);
  for (const m of media) if (!n.media.some(x => x.path === m.path)) n.media.push(m);
  return n;
}

/** Ajoute un média à la fin de sa piste (ou à l'index donné). Renvoie le projet et l'id du clip créé. */
export function appendClip(p: Project, mediaId: string, index?: number): { project: Project; clipId: string } | null {
  const media = p.media.find(m => m.id === mediaId);
  if (!media) return null;
  const n = clone(p), clip = makeClip(media), track = media.kind === 'audio' ? n.audio : n.video;
  track.splice(index ?? track.length, 0, clip);
  return { project: n, clipId: clip.id };
}

/** Scinde le clip de la piste sous l'instant t. Sans effet à moins de MIN_CLIP d'un bord. */
export function splitAt(p: Project, track: TrackId, t: number): Project {
  const hit = clipAt(p[track], t);
  if (!hit || hit.local < MIN_CLIP || hit.clip.dur - hit.local < MIN_CLIP) return p;
  const n = clone(p), c = n[track][hit.index];
  const right: Clip = { ...clone(c), id: newId('clip'), in: c.in + hit.local, dur: c.dur - hit.local, fx: c.fx.map(f => ({ ...clone(f), uid: newId('fx') })) };
  c.dur = hit.local;
  c.transition = null; // la transition suit la partie droite, qui garde la coupe d'origine
  n[track].splice(hit.index + 1, 0, right);
  clampTransitions(n[track]);
  return n;
}

export function removeClip(p: Project, id: string): Project {
  const f = findClip(p, id);
  if (!f) return p;
  const n = clone(p);
  n[f.track].splice(f.index, 1);
  clampTransitions(n[f.track]);
  return n;
}

export function moveClip(p: Project, id: string, toIndex: number): Project {
  const f = findClip(p, id);
  if (!f) return p;
  const to = Math.max(0, Math.min(p[f.track].length - 1, toIndex > f.index ? toIndex - 1 : toIndex));
  if (to === f.index) return p;
  const n = clone(p), list = n[f.track];
  const [c] = list.splice(f.index, 1);
  list.splice(to, 0, c);
  clampTransitions(list);
  return n;
}

/** Rogne un bord. delta en secondes, positif vers la droite. Borné par le média et MIN_CLIP. */
export function trimClip(p: Project, id: string, edge: 'start' | 'end', delta: number): Project {
  const f = findClip(p, id);
  if (!f) return p;
  const media = p.media.find(m => m.id === f.clip.mediaId);
  const max = media && media.kind !== 'image' ? media.duration : Infinity;
  const n = clone(p), c = n[f.track][f.index];
  if (edge === 'start') {
    const d = Math.max(-c.in, Math.min(c.dur - MIN_CLIP, delta));
    c.in += d; c.dur -= d;
  } else {
    c.dur = Math.max(MIN_CLIP, Math.min(max - c.in, c.dur + delta));
  }
  clampTransitions(n[f.track]);
  return n;
}

function clampTransitions(list: Clip[]) {
  list.forEach((c, i) => {
    if (!c.transition) return;
    const next = list[i + 1];
    if (!next) { c.transition = null; return; }
    // Jamais plus longue que le plus court des deux clips qu'elle relie.
    c.transition.dur = Math.min(c.dur, next.dur, Math.max(0.2, c.transition.dur));
  });
}

export function patchClip(p: Project, id: string, fn: (c: Clip) => void): Project {
  const f = findClip(p, id);
  if (!f) return p;
  const n = clone(p);
  fn(n[f.track][f.index]);
  clampTransitions(n[f.track]);
  return n;
}

export function addFx(p: Project, clipId: string, effectId: string, params: Record<string, ParamValue>): Project {
  const fx: FxInstance = { uid: newId('fx'), effectId, params: clone(params), on: true };
  return patchClip(p, clipId, c => { c.fx.push(fx); });
}
export const removeFx = (p: Project, clipId: string, uid: string) => patchClip(p, clipId, c => { c.fx = c.fx.filter(f => f.uid !== uid); });

/** Pose une transition entre le clip et le suivant. Sans effet sur le dernier clip. */
export function setTransition(p: Project, clipId: string, tr: TransitionInstance | null): Project {
  const f = findClip(p, clipId);
  if (!f || f.track !== 'video' || (tr && f.index >= p.video.length - 1)) return p;
  return patchClip(p, clipId, c => { c.transition = tr ? clone(tr) : null; });
}
