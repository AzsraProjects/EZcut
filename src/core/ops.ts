/** Opérations de montage. Fonctions pures : elles reçoivent un projet et en renvoient un nouveau. */
import { IMAGE_DURATION, MIN_CLIP, TEXT_DURATION, type Clip, type FxInstance, type Media, type ParamValue, type Project, type TextStyle, type TrackId, type TransitionInstance } from './types';

let counter = 0;
export const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(counter++).toString(36)}`;

const clone = <T>(v: T): T => structuredClone(v);

/** Ordre d'affichage et de composition, du dessus vers le dessous. */
export const TRACKS: TrackId[] = ['text', 'overlay', 'video', 'sound', 'audio'];
export const isFree = (track: TrackId) => track !== 'video';
export const isSound = (track: TrackId) => track === 'audio' || track === 'sound';

/** Début de chaque clip : cumulé sur une piste magnétique, lu sur le clip pour une piste libre. */
export function trackStarts(clips: Clip[], free = false): number[] {
  if (free) return clips.map(c => c.start);
  let s = 0;
  return clips.map(c => { const r = s; s += c.dur; return r; });
}
export const startsOf = (p: Project, track: TrackId) => trackStarts(p[track], isFree(track));
export const trackDuration = (clips: Clip[], free = false) => (free ? clips.reduce((m, c) => Math.max(m, c.start + c.dur), 0) : clips.reduce((s, c) => s + c.dur, 0));
export const projectDuration = (p: Project) => Math.max(...TRACKS.map(t => trackDuration(p[t], isFree(t))));

/** Clip d'une piste magnétique sous l'instant t, avec son index et le temps local. */
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
/** Clips d'une piste libre présents à l'instant t. */
export const activeAt = (clips: Clip[], t: number) => clips.filter(c => t >= c.start && t < c.start + c.dur);

export function findClip(p: Project, id: string): { track: TrackId; index: number; clip: Clip; start: number } | null {
  for (const track of TRACKS) {
    const index = p[track].findIndex(c => c.id === id);
    if (index >= 0) return { track, index, clip: p[track][index], start: startsOf(p, track)[index] };
  }
  return null;
}

function blankClip(dur: number): Clip {
  return { id: newId('clip'), mediaId: '', start: 0, in: 0, dur, volume: 1, fadeIn: 0, fadeOut: 0, vfadeIn: 0, vfadeOut: 0, transform: { scale: 1, x: 0, y: 0, rot: 0 }, opacity: 1, blend: 'normal', color: {}, fx: [], transition: null, text: null, still: false, off: false };
}
export function makeClip(media: Media): Clip {
  return { ...blankClip(media.kind === 'image' ? IMAGE_DURATION : Math.max(MIN_CLIP, media.duration)), mediaId: media.id };
}

export function addMedia(p: Project, media: Media[]): Project {
  const n = clone(p);
  for (const m of media) if (!n.media.some(x => x.path === m.path)) n.media.push(m);
  return n;
}

/** Ajoute un média à son montage : une vidéo ou une image à la fin de la piste principale (ou à l'index donné), un son à la suite de la musique. */
export function appendClip(p: Project, mediaId: string, index?: number): { project: Project; clipId: string } | null {
  const media = p.media.find(m => m.id === mediaId);
  if (!media) return null;
  if (media.kind === 'audio') return addSound(p, mediaId, 'audio', trackDuration(p.audio, true));
  const n = clone(p), clip = makeClip(media);
  n.video.splice(index ?? n.video.length, 0, clip);
  return { project: n, clipId: clip.id };
}

/** Pose un fichier audio sur une piste son, au premier emplacement libre à partir de l'instant voulu. */
export function addSound(p: Project, mediaId: string, track: 'audio' | 'sound', at: number): { project: Project; clipId: string } | null {
  const media = p.media.find(m => m.id === mediaId);
  if (!media || media.kind !== 'audio') return null;
  const n = clone(p), clip = makeClip(media);
  clip.start = freeSlot(n[track], clip.dur, at);
  n[track].push(clip); sortFree(n[track]);
  return { project: n, clipId: clip.id };
}

/** Détache le son d'un clip vidéo : il devient un clip à part sur la piste Son, au même instant, et le clip d'origine devient muet.
 *  Renvoie null si le clip n'a pas de son ou si la place est déjà prise sur la piste Son. */
export function detachAudio(p: Project, id: string): { project: Project; clipId: string } | null {
  const f = findClip(p, id);
  const media = f && p.media.find(m => m.id === f.clip.mediaId);
  if (!f || !media || media.kind !== 'video' || !media.hasAudio || f.clip.still || f.clip.volume <= 0 || (f.track !== 'video' && f.track !== 'overlay')) return null;
  if (Math.abs(freeSlot(p.sound, f.clip.dur, f.start) - f.start) > 1e-6) return null;
  const n = clone(p), src = n[f.track][f.index];
  const audio: Clip = { ...blankClip(src.dur), mediaId: src.mediaId, start: f.start, in: src.in, volume: src.volume, fadeIn: src.fadeIn, fadeOut: src.fadeOut };
  src.volume = 0; src.fadeIn = 0; src.fadeOut = 0;
  n.sound.push(audio); sortFree(n.sound);
  return { project: n, clipId: audio.id };
}

/** Premier emplacement libre à partir de l'instant voulu : deux clips d'une même piste libre ne se recouvrent jamais. */
export function freeSlot(list: Clip[], dur: number, start: number, ignoreId?: string): number {
  let s = Math.max(0, start);
  for (const o of list.filter(c => c.id !== ignoreId).sort((a, b) => a.start - b.start))
    if (s < o.start + o.dur - 1e-9 && s + dur > o.start + 1e-9) s = o.start + o.dur;
  return s;
}
const sortFree = (list: Clip[]) => list.sort((a, b) => a.start - b.start);

/** Pose une vidéo ou une image en incrustation, au-dessus de la piste principale. */
export function addOverlay(p: Project, mediaId: string, at: number): { project: Project; clipId: string } | null {
  const media = p.media.find(m => m.id === mediaId);
  if (!media || media.kind === 'audio') return null;
  const n = clone(p), clip = makeClip(media);
  clip.transform.scale = 0.5; // image dans l'image par défaut : la piste principale reste visible
  clip.start = freeSlot(n.overlay, clip.dur, at);
  n.overlay.push(clip); sortFree(n.overlay);
  return { project: n, clipId: clip.id };
}

export function addText(p: Project, style: TextStyle, at: number, transform?: Partial<Clip['transform']>): { project: Project; clipId: string } {
  const n = clone(p), clip = blankClip(TEXT_DURATION);
  clip.text = clone(style);
  Object.assign(clip.transform, transform);
  clip.start = freeSlot(n.text, clip.dur, at);
  n.text.push(clip); sortFree(n.text);
  return { project: n, clipId: clip.id };
}

/** Déplace un clip d'une piste libre. */
export function moveFree(p: Project, id: string, start: number): Project {
  const f = findClip(p, id);
  if (!f || !isFree(f.track)) return p;
  const to = freeSlot(p[f.track], f.clip.dur, start, id);
  if (Math.abs(to - f.clip.start) < 1e-9) return p;
  const n = clone(p);
  n[f.track][f.index].start = to; sortFree(n[f.track]);
  return n;
}

/** Scinde le clip de la piste sous l'instant t. Sans effet à moins de MIN_CLIP d'un bord. */
export function splitAt(p: Project, track: TrackId, t: number): Project {
  const free = isFree(track);
  let index: number, local: number;
  if (free) {
    index = p[track].findIndex(c => t >= c.start && t < c.start + c.dur);
    if (index < 0) return p;
    local = t - p[track][index].start;
  } else {
    const hit = clipAt(p[track], t);
    if (!hit) return p;
    index = hit.index; local = hit.local;
  }
  const src = p[track][index];
  if (local < MIN_CLIP || src.dur - local < MIN_CLIP) return p;
  const n = clone(p), c = n[track][index];
  const right: Clip = { ...clone(c), id: newId('clip'), start: c.start + local, in: c.in + local, dur: c.dur - local, fadeIn: 0, vfadeIn: 0, fx: c.fx.map(f => ({ ...clone(f), uid: newId('fx') })) };
  c.dur = local; c.fadeOut = 0; c.vfadeOut = 0; clampFades(c); clampFades(right);
  c.transition = null; // la transition suit la partie droite, qui garde la coupe d'origine
  n[track].splice(index + 1, 0, right);
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

/** Réordonne un clip sur sa piste magnétique. */
export function moveClip(p: Project, id: string, toIndex: number): Project {
  const f = findClip(p, id);
  if (!f || isFree(f.track)) return p;
  const to = Math.max(0, Math.min(p[f.track].length - 1, toIndex > f.index ? toIndex - 1 : toIndex));
  if (to === f.index) return p;
  const n = clone(p), list = n[f.track];
  const [c] = list.splice(f.index, 1);
  list.splice(to, 0, c);
  clampTransitions(list);
  return n;
}

/** Rogne un bord. delta en secondes, positif vers la droite. Borné par le média, les voisins et MIN_CLIP. */
export function trimClip(p: Project, id: string, edge: 'start' | 'end', delta: number): Project {
  const f = findClip(p, id);
  if (!f) return p;
  const media = p.media.find(m => m.id === f.clip.mediaId);
  const timed = !!media && media.kind !== 'image' && !f.clip.still; // un titre, une image ou un arrêt sur image n'a pas de durée propre
  const max = timed ? media.duration : Infinity;
  const n = clone(p), list = n[f.track], c = list[f.index], free = isFree(f.track);
  if (edge === 'start') {
    let lo = timed ? -c.in : -Infinity;
    if (free) { const prev = list[f.index - 1]; lo = Math.max(lo, (prev ? prev.start + prev.dur : 0) - c.start); }
    else if (!timed) lo = -Infinity;
    const d = Math.max(lo, Math.min(c.dur - MIN_CLIP, delta));
    if (timed) c.in += d;
    if (free) c.start += d;
    c.dur -= d;
  } else {
    let hi = max - c.in;
    if (free) { const next = list[f.index + 1]; if (next) hi = Math.min(hi, next.start - c.start); }
    c.dur = Math.max(MIN_CLIP, Math.min(hi, c.dur + delta));
  }
  clampFades(c);
  clampTransitions(list);
  return n;
}

/** Les deux fondus tiennent ensemble dans la durée du clip. */
export function clampFades(c: Clip) {
  c.fadeIn = Math.max(0, Math.min(c.fadeIn, c.dur));
  c.fadeOut = Math.max(0, Math.min(c.fadeOut, c.dur - c.fadeIn));
  c.vfadeIn = Math.max(0, Math.min(c.vfadeIn, c.dur));
  c.vfadeOut = Math.max(0, Math.min(c.vfadeOut, c.dur - c.vfadeIn));
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
  clampFades(n[f.track][f.index]);
  clampTransitions(n[f.track]);
  return n;
}

export function addFx(p: Project, clipId: string, effectId: string, params: Record<string, ParamValue>): Project {
  const fx: FxInstance = { uid: newId('fx'), effectId, params: clone(params), on: true };
  return patchClip(p, clipId, c => { c.fx.push(fx); });
}
export const removeFx = (p: Project, clipId: string, uid: string) => patchClip(p, clipId, c => { c.fx = c.fx.filter(f => f.uid !== uid); });

/** Pose une transition entre le clip et le suivant. Sans effet hors de la piste principale et sur le dernier clip. */
export function setTransition(p: Project, clipId: string, tr: TransitionInstance | null): Project {
  const f = findClip(p, clipId);
  if (!f || f.track !== 'video' || (tr && f.index >= p.video.length - 1)) return p;
  return patchClip(p, clipId, c => { c.transition = tr ? clone(tr) : null; });
}

/** Étend un clip de piste libre à toute la durée de la piste principale. Sans effet si un autre clip de sa piste est sur le chemin. */
export function spanWhole(p: Project, id: string): Project {
  const f = findClip(p, id), total = trackDuration(p.video);
  if (!f || !isFree(f.track) || total < MIN_CLIP || p[f.track].length > 1) return p;
  const media = p.media.find(m => m.id === f.clip.mediaId);
  if (media && media.kind === 'video') return p; // une vidéo a sa propre durée
  return patchClip(p, id, c => { c.start = 0; c.dur = total; });
}

/** Copie d'un clip avec de nouveaux identifiants (clip et effets), sans transition. */
function copyOf(c: Clip): Clip {
  return { ...clone(c), id: newId('clip'), transition: null, fx: c.fx.map(f => ({ ...clone(f), uid: newId('fx') })) };
}

/** Insère la copie d'un clip : à l'index donné sur une piste magnétique, au premier emplacement libre à partir de start sur une piste libre. */
export function insertCopy(p: Project, track: TrackId, source: Clip, at: { index?: number; start?: number }): { project: Project; clipId: string } {
  const n = clone(p), c = copyOf(source), list = n[track];
  if (isFree(track)) { c.start = freeSlot(list, c.dur, at.start ?? 0); list.push(c); list.sort((a, b) => a.start - b.start); }
  else { list.splice(Math.max(0, Math.min(list.length, at.index ?? list.length)), 0, c); clampTransitions(list); }
  return { project: n, clipId: c.id };
}

/** Duplique un clip, juste après l'original. */
export function duplicateClip(p: Project, id: string): { project: Project; clipId: string } | null {
  const f = findClip(p, id);
  return f ? insertCopy(p, f.track, f.clip, { index: f.index + 1, start: f.clip.start + f.clip.dur }) : null;
}

/** Retire un média de la bibliothèque, avec tous les clips qui l'utilisent. */
export function removeMedia(p: Project, mediaId: string): Project {
  if (!p.media.some(m => m.id === mediaId)) return p;
  const n = clone(p);
  n.media = n.media.filter(m => m.id !== mediaId);
  for (const t of TRACKS) { n[t] = n[t].filter(c => c.mediaId !== mediaId); clampTransitions(n[t]); }
  return n;
}

/** Insère un média sur la piste principale à l'instant t : le clip en cours est coupé en deux et le média glissé entre les moitiés. */
export function insertAt(p: Project, mediaId: string, t: number): { project: Project; clipId: string } | null {
  const media = p.media.find(m => m.id === mediaId);
  if (!media || media.kind === 'audio') return null;
  const hit = clipAt(p.video, t);
  if (!hit) return appendClip(p, mediaId);
  const cut = splitAt(p, 'video', t);
  return appendClip(cut, mediaId, cut !== p || hit.local >= hit.clip.dur / 2 ? hit.index + 1 : hit.index);
}

/** Arrêt sur image : fige l'image sous l'instant t de la piste principale pendant dur secondes, en poussant la suite. */
export function freezeAt(p: Project, t: number, dur = 5): { project: Project; clipId: string } | null {
  const hit = clipAt(p.video, t);
  if (!hit || hit.clip.text) return null;
  const media = p.media.find(m => m.id === hit.clip.mediaId);
  if (!media || media.kind === 'audio') return null;
  // On coupe le clip à cet instant (si la coupe est possible), puis on glisse l'image figée entre les deux moitiés.
  const cut = splitAt(p, 'video', t), wasSplit = cut !== p;
  const n = clone(cut), src = n.video[hit.index];
  const still: Clip = { ...copyOf(hit.clip), in: hit.clip.still ? hit.clip.in : hit.clip.in + hit.local, dur: Math.max(MIN_CLIP, dur), still: true, fadeIn: 0, fadeOut: 0, vfadeIn: 0, vfadeOut: 0 };
  const index = wasSplit || hit.local >= hit.clip.dur / 2 ? hit.index + 1 : hit.index;
  if (wasSplit) { still.transition = null; src.transition = null; }
  n.video.splice(index, 0, still);
  clampTransitions(n.video);
  return { project: n, clipId: still.id };
}

/** Gain d'un fondu audio à l'instant local du clip, de 0 à 1. */
export const imageGain = (c: Pick<Clip, 'dur' | 'vfadeIn' | 'vfadeOut'>, local: number) => fadeGain({ dur: c.dur, fadeIn: c.vfadeIn, fadeOut: c.vfadeOut }, local);

export function fadeGain(c: Pick<Clip, 'dur' | 'fadeIn' | 'fadeOut'>, local: number): number {
  let g = 1;
  if (c.fadeIn > 0) g = Math.min(g, local / c.fadeIn);
  if (c.fadeOut > 0) g = Math.min(g, (c.dur - local) / c.fadeOut);
  return Math.max(0, Math.min(1, g));
}
