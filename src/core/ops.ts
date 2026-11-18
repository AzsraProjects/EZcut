/** Opérations de montage. Fonctions pures : elles reçoivent un projet et en renvoient un nouveau. */
import { BASE_TRACKS, IMAGE_DURATION, MARKER_COLORS, MAX_EXTRA_TRACKS, MIN_CLIP, TEXT_DURATION, type Marker, type TrackKind, type TrackState, type Clip, type FxInstance, type Media, type ParamValue, type Project, type TextStyle, type TrackId, type TransitionInstance } from './types';
import { hasMotion, motionAt, shiftKeys } from './motion';

let counter = 0;
export const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(counter++).toString(36)}`;

const clone = <T>(v: T): T => structuredClone(v);

/* ---------- pistes ---------- */
/** Identifiant d'une piste ajoutée : genre, tiret, numéro de 2 à 99. */
export const EXTRA_TRACK = /^(text|overlay|sound|audio)-([2-9]|[1-9]\d)$/;
/** Genre d'une piste : la partie de son identifiant avant le tiret. */
export const kindOf = (track: TrackId): TrackKind => { const i = track.indexOf('-'); return (i < 0 ? track : track.slice(0, i)) as TrackKind; };
export const isBase = (track: TrackId) => (BASE_TRACKS as readonly string[]).includes(track);
export const isFree = (track: TrackId) => kindOf(track) !== 'video';
export const isSound = (track: TrackId) => { const k = kindOf(track); return k === 'audio' || k === 'sound'; };
/** Piste d'image posée au-dessus de la piste principale : titres ou incrustations. */
export const isImage = (track: TrackId) => { const k = kindOf(track); return k === 'text' || k === 'overlay'; };
/** Toutes les pistes du projet, de haut en bas dans la timeline. */
export const trackIds = (p: Project): TrackId[] => p.order;
export const hasTrack = (p: Project, track: TrackId) => p.order.includes(track);
/** Clips d'une piste. Sur un clone du projet, le tableau renvoyé se modifie en place. Piste inconnue : tableau vide. */
export function clipsOf(p: Project, track: TrackId): Clip[] {
  if (isBase(track)) return p[track as TrackKind];
  return Object.hasOwn(p.extra, track) ? p.extra[track] : [];
}
function setClips(p: Project, track: TrackId, list: Clip[]) {
  if (isBase(track)) p[track as TrackKind] = list; else if (Object.hasOwn(p.extra, track)) p.extra[track] = list;
}
/** Pistes d'un genre, de haut en bas. */
export const tracksOfKind = (p: Project, kind: TrackKind) => p.order.filter(t => kindOf(t) === kind);
/** Tous les clips des pistes d'un genre. */
export const clipsOfKind = (p: Project, kind: TrackKind) => tracksOfKind(p, kind).flatMap(t => clipsOf(p, t));
/** Nombre total de clips du projet. */
export const clipCount = (p: Project) => p.order.reduce((n, t) => n + clipsOf(p, t).length, 0);

/** Emplacement d'une nouvelle piste dans l'ordre : juste au-dessus des pistes de même genre pour l'image, juste en dessous pour le son. */
function placeTrack(order: TrackId[], id: TrackId): TrackId[] {
  const kind = kindOf(id), same = order.map((t, i) => (kindOf(t) === kind ? i : -1)).filter(i => i >= 0);
  // Aucune piste de ce genre (ordre incomplet d'un fichier) : rang par défaut, titres tout en haut, musique tout en bas.
  const at = !same.length ? (kind === 'text' || kind === 'sound' ? 0 : order.length) : isImage(id) ? same[0] : same[same.length - 1] + 1;
  return [...order.slice(0, at), id, ...order.slice(at)];
}
/** Ordre valide des pistes à partir d'un ordre quelconque : chaque piste connue une seule fois, les pistes manquantes replacées,
 *  l'image au-dessus de video, le son en dessous. L'ordre relatif donné est conservé à l'intérieur de chaque groupe. */
export function fixOrder(order: unknown, extra: string[]): TrackId[] {
  const known = new Set<string>([...BASE_TRACKS, ...extra]);
  let out: TrackId[] = [];
  for (const t of Array.isArray(order) ? order : []) if (typeof t === 'string' && known.has(t) && !out.includes(t)) out.push(t);
  for (const t of [...BASE_TRACKS, ...extra]) if (!out.includes(t)) out = placeTrack(out, t);
  return [...out.filter(isImage), 'video', ...out.filter(isSound)];
}

/** Ajoute une piste libre du genre voulu. Renvoie null pour la piste principale (unique) ou si le nombre maximal est atteint. */
export function addTrack(p: Project, kind: TrackKind): { project: Project; id: TrackId } | null {
  if (kind === 'video' || !BASE_TRACKS.includes(kind) || Object.keys(p.extra).length >= MAX_EXTRA_TRACKS) return null;
  let k = 2;
  while (hasTrack(p, `${kind}-${k}`) || Object.hasOwn(p.extra, `${kind}-${k}`)) k++;
  const n = clone(p), id = `${kind}-${k}`;
  n.extra[id] = []; n.order = placeTrack(n.order, id);
  return { project: n, id };
}
/** Supprime une piste ajoutée, avec ses clips. Sans effet sur une piste de base. */
export function removeTrack(p: Project, id: TrackId): Project {
  if (isBase(id) || !Object.hasOwn(p.extra, id)) return p;
  const n = clone(p);
  delete n.extra[id]; delete n.tracks[id];
  n.order = n.order.filter(t => t !== id);
  return n;
}
/** Déplace une piste de delta rangs (négatif = vers le haut) parmi les pistes d'image ou parmi les pistes de son. La piste principale ne bouge pas. */
export function moveTrack(p: Project, id: TrackId, delta: number): Project {
  if (!hasTrack(p, id) || !isFree(id)) return p;
  const group = p.order.filter(isImage(id) ? isImage : isSound), from = group.indexOf(id);
  const to = Math.max(0, Math.min(group.length - 1, from + (Math.round(delta) || 0)));
  if (to === from) return p;
  group.splice(from, 1); group.splice(to, 0, id);
  const n = clone(p);
  n.order = isImage(id) ? [...group, 'video', ...p.order.filter(isSound)] : [...p.order.filter(isImage), 'video', ...group];
  return n;
}
/** Envoie un clip d'une piste libre sur une autre piste du même genre, au premier emplacement libre à partir de sa position. */
export function moveToTrack(p: Project, clipId: string, track: TrackId): Project {
  const f = findClip(p, clipId);
  if (!f || !isFree(f.track) || f.track === track || !hasTrack(p, track) || kindOf(track) !== kindOf(f.track)) return p;
  const n = clone(p), [c] = clipsOf(n, f.track).splice(f.index, 1), list = clipsOf(n, track);
  c.start = freeSlot(list, c.dur, c.start);
  list.push(c); sortFree(list);
  return n;
}
/** Première piste verrouillée dont les clips changeraient entre deux états du projet (ou qui disparaîtrait), sinon null.
 *  Une piste déverrouillée par la même modification n'est pas concernée. */
export function lockedChange(before: Project, after: Project): TrackId | null {
  for (const t of before.order) {
    if (!before.tracks[t]?.locked) continue;
    if (!hasTrack(after, t)) return t;
    if (after.tracks[t]?.locked && JSON.stringify(clipsOf(before, t)) !== JSON.stringify(clipsOf(after, t))) return t;
  }
  return null;
}

/** Début de chaque clip : cumulé sur une piste magnétique, lu sur le clip pour une piste libre. */
export function trackStarts(clips: Clip[], free = false): number[] {
  if (free) return clips.map(c => c.start);
  let s = 0;
  return clips.map(c => { const r = s; s += c.dur; return r; });
}
export const startsOf = (p: Project, track: TrackId) => trackStarts(clipsOf(p, track), isFree(track));
export const trackDuration = (clips: Clip[], free = false) => (free ? clips.reduce((m, c) => Math.max(m, c.start + c.dur), 0) : clips.reduce((s, c) => s + c.dur, 0));
export const projectDuration = (p: Project) => Math.max(0, ...p.order.map(t => trackDuration(clipsOf(p, t), isFree(t))));

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
  for (const track of p.order) {
    const list = clipsOf(p, track), index = list.findIndex(c => c.id === id);
    if (index >= 0) return { track, index, clip: list[index], start: trackStarts(list, isFree(track))[index] };
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

/** Pose un fichier audio sur une piste de son (Son, Musique ou une piste ajoutée), au premier emplacement libre à partir de l'instant voulu. */
export function addSound(p: Project, mediaId: string, track: TrackId, at: number): { project: Project; clipId: string } | null {
  const media = p.media.find(m => m.id === mediaId);
  if (!media || media.kind !== 'audio' || !isSound(track) || !hasTrack(p, track)) return null;
  const n = clone(p), clip = makeClip(media), list = clipsOf(n, track);
  clip.start = freeSlot(list, clip.dur, at);
  list.push(clip); sortFree(list);
  return { project: n, clipId: clip.id };
}

/** Détache le son d'un clip vidéo : il devient un clip à part sur la piste Son (ou la piste de son visée), au même instant, et le clip d'origine devient muet.
 *  Renvoie null si le clip n'a pas de son ou si la place est déjà prise sur la piste visée. */
export function detachAudio(p: Project, id: string, track: TrackId = 'sound'): { project: Project; clipId: string } | null {
  const f = findClip(p, id);
  const media = f && p.media.find(m => m.id === f.clip.mediaId);
  if (!f || !media || media.kind !== 'video' || !media.hasAudio || f.clip.still || f.clip.volume <= 0 || (f.track !== 'video' && kindOf(f.track) !== 'overlay') || !isSound(track) || !hasTrack(p, track)) return null;
  if (Math.abs(freeSlot(clipsOf(p, track), f.clip.dur, f.start) - f.start) > 1e-6) return null;
  const n = clone(p), src = clipsOf(n, f.track)[f.index];
  const audio: Clip = { ...blankClip(src.dur), mediaId: src.mediaId, start: f.start, in: src.in, volume: src.volume, fadeIn: src.fadeIn, fadeOut: src.fadeOut };
  src.volume = 0; src.fadeIn = 0; src.fadeOut = 0;
  clipsOf(n, track).push(audio); sortFree(clipsOf(n, track));
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

/** Pose une vidéo ou une image en incrustation, au-dessus de la piste principale, sur la piste d'incrustation visée. */
export function addOverlay(p: Project, mediaId: string, at: number, track: TrackId = 'overlay'): { project: Project; clipId: string } | null {
  const media = p.media.find(m => m.id === mediaId);
  if (!media || media.kind === 'audio' || kindOf(track) !== 'overlay' || !hasTrack(p, track)) return null;
  const n = clone(p), clip = makeClip(media), list = clipsOf(n, track);
  clip.transform.scale = 0.5; // image dans l'image par défaut : la piste principale reste visible
  clip.start = freeSlot(list, clip.dur, at);
  list.push(clip); sortFree(list);
  return { project: n, clipId: clip.id };
}

/** Pose un titre sur la piste de titres visée (la piste Titres de base si elle n'est pas donnée ou pas valable). */
export function addText(p: Project, style: TextStyle, at: number, transform?: Partial<Clip['transform']>, track: TrackId = 'text'): { project: Project; clipId: string } {
  const n = clone(p), clip = blankClip(TEXT_DURATION), list = clipsOf(n, kindOf(track) === 'text' && hasTrack(p, track) ? track : 'text');
  clip.text = clone(style);
  Object.assign(clip.transform, transform);
  clip.start = freeSlot(list, clip.dur, at);
  list.push(clip); sortFree(list);
  return { project: n, clipId: clip.id };
}

/** Déplace un clip d'une piste libre. */
export function moveFree(p: Project, id: string, start: number): Project {
  const f = findClip(p, id);
  if (!f || !isFree(f.track)) return p;
  const to = freeSlot(clipsOf(p, f.track), f.clip.dur, start, id);
  if (Math.abs(to - f.clip.start) < 1e-9) return p;
  const n = clone(p);
  clipsOf(n, f.track)[f.index].start = to; sortFree(clipsOf(n, f.track));
  return n;
}

/** Déplace ensemble, du même écart dt, les clips ids posés sur des pistes libres (les clips de la piste principale ne bougent pas).
 *  L'écart est borné pour qu'aucun ne passe avant 0 ; si un clip déplacé chevauchait un clip resté en place, rien ne bouge. */
export function moveGroup(p: Project, ids: string[], dt: number): Project {
  const set = new Set(ids), tracks = p.order.filter(tr => isFree(tr) && clipsOf(p, tr).some(c => set.has(c.id)));
  if (!tracks.length) return p;
  const min = Math.min(...tracks.flatMap(tr => clipsOf(p, tr).filter(c => set.has(c.id)).map(c => c.start)));
  const d = Math.max(-min, dt);
  if (Math.abs(d) < 1e-9) return p;
  const n = clone(p);
  for (const tr of tracks) {
    const list = clipsOf(n, tr);
    for (const c of list) if (set.has(c.id)) c.start += d;
    const still = list.filter(c => !set.has(c.id));
    if (list.some(c => set.has(c.id) && still.some(o => c.start < o.start + o.dur - 1e-9 && c.start + c.dur > o.start + 1e-9))) return p;
    sortFree(list);
  }
  return n;
}

/** Retire plusieurs clips d'un coup. Avec ripple, sur chaque piste libre, les clips suivants avancent pour refermer les vides. */
export function removeClips(p: Project, ids: string[], ripple = false): Project {
  // Du dernier au premier : retirer un clip n'avance que ceux qui le suivent.
  const found = ids.map(id => findClip(p, id)).filter(f => f !== null).sort((a, b) => b.start - a.start);
  let n = p;
  for (const f of found) n = ripple && isFree(f.track) ? rippleRemove(n, f.clip.id) : removeClip(n, f.clip.id);
  return n;
}

/** Scinde le clip de la piste sous l'instant t. Sans effet à moins de MIN_CLIP d'un bord. */
export function splitAt(p: Project, track: TrackId, t: number): Project {
  const free = isFree(track);
  let index: number, local: number;
  if (free) {
    index = clipsOf(p, track).findIndex(c => t >= c.start && t < c.start + c.dur);
    if (index < 0) return p;
    local = t - clipsOf(p, track)[index].start;
  } else {
    const hit = clipAt(clipsOf(p, track), t);
    if (!hit) return p;
    index = hit.index; local = hit.local;
  }
  const src = clipsOf(p, track)[index];
  if (local < MIN_CLIP || src.dur - local < MIN_CLIP) return p;
  const n = clone(p), c = clipsOf(n, track)[index];
  const right: Clip = { ...clone(c), id: newId('clip'), start: c.start + local, in: c.in + local, dur: c.dur - local, fadeIn: 0, vfadeIn: 0, fx: c.fx.map(f => ({ ...clone(f), uid: newId('fx') })) };
  // Mouvement : les deux moitiés gardent tous les points (ceux hors du clip ne s'affichent pas), la partie droite décalée :
  // le mouvement continue sans saut ni ralentissement à la coupe, et se retrouve entier si on recolle.
  shiftKeys(right, local);
  c.dur = local; c.fadeOut = 0; c.vfadeOut = 0; clampFades(c); clampFades(right);
  c.transition = null; // la transition suit la partie droite, qui garde la coupe d'origine
  clipsOf(n, track).splice(index + 1, 0, right);
  clampTransitions(clipsOf(n, track));
  return n;
}

export function removeClip(p: Project, id: string): Project {
  const f = findClip(p, id);
  if (!f) return p;
  const n = clone(p);
  clipsOf(n, f.track).splice(f.index, 1);
  clampTransitions(clipsOf(n, f.track));
  return n;
}

/** Retire un clip d'une piste libre et avance les clips suivants de sa durée : le vide qu'il laisserait est refermé, pas les autres. */
export function rippleRemove(p: Project, id: string): Project {
  const f = findClip(p, id);
  if (!f) return p;
  const n = removeClip(p, id);
  if (isFree(f.track)) for (const c of clipsOf(n, f.track)) if (c.start >= f.start + f.clip.dur - 1e-9) c.start -= f.clip.dur;
  return n;
}

/** Réordonne un clip sur sa piste magnétique. */
export function moveClip(p: Project, id: string, toIndex: number): Project {
  const f = findClip(p, id);
  if (!f || isFree(f.track)) return p;
  const to = Math.max(0, Math.min(clipsOf(p, f.track).length - 1, toIndex > f.index ? toIndex - 1 : toIndex));
  if (to === f.index) return p;
  const n = clone(p), list = clipsOf(n, f.track);
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
  const n = clone(p), list = clipsOf(n, f.track), c = list[f.index], free = isFree(f.track);
  if (edge === 'start') {
    let lo = timed ? -c.in : -Infinity;
    if (free) { const prev = list[f.index - 1]; lo = Math.max(lo, (prev ? prev.start + prev.dur : 0) - c.start); }
    else if (!timed) lo = -Infinity;
    const d = Math.max(lo, Math.min(c.dur - MIN_CLIP, delta));
    shiftKeys(c, d); // le mouvement reste calé sur le contenu
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
  fn(clipsOf(n, f.track)[f.index]);
  clampFades(clipsOf(n, f.track)[f.index]);
  clampTransitions(clipsOf(n, f.track));
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
  if (!f || !isFree(f.track) || total < MIN_CLIP || clipsOf(p, f.track).length > 1) return p;
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
  const n = clone(p), c = copyOf(source), list = clipsOf(n, track);
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
  for (const t of n.order) { setClips(n, t, clipsOf(n, t).filter(c => c.mediaId !== mediaId)); clampTransitions(clipsOf(n, t)); }
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
  // Un arrêt sur image ne bouge pas : il garde le cadrage de l'instant figé.
  if (hasMotion(hit.clip)) { const m = motionAt(hit.clip, hit.local); delete still.keys; still.transform = { ...m.transform }; still.opacity = m.opacity; }
  const index = wasSplit || hit.local >= hit.clip.dur / 2 ? hit.index + 1 : hit.index;
  if (wasSplit) { still.transition = null; src.transition = null; }
  n.video.splice(index, 0, still);
  clampTransitions(n.video);
  return { project: n, clipId: still.id };
}

/** Coupe en deux tous les clips traversés par l'instant t, sur toutes les pistes non verrouillées. */
export function splitAll(p: Project, t: number): Project {
  let n = p;
  for (const track of p.order) if (!p.tracks[track]?.locked) n = splitAt(n, track, t);
  return n;
}

/** Vide d'une piste libre contenant l'instant t : [début, fin], ou null s'il n'y a pas de clip après. */
export function gapAt(p: Project, track: TrackId, t: number): [number, number] | null {
  if (!isFree(track)) return null;
  let from = 0;
  for (const c of clipsOf(p, track)) { // piste triée
    if (c.start > t) return c.start - from > 1e-6 ? [from, c.start] : null;
    from = Math.max(from, c.start + c.dur);
    if (t < from) return null; // t est dans un clip
  }
  return null;
}
/** Referme le vide situé à l'instant t : les clips suivants de la piste avancent d'autant. */
export function closeGap(p: Project, track: TrackId, t: number): Project {
  const gap = gapAt(p, track, t);
  if (!gap) return p;
  const n = clone(p), width = gap[1] - gap[0];
  for (const c of clipsOf(n, track)) if (c.start >= gap[1] - 1e-9) c.start -= width;
  return n;
}

/** Pose la même transition, avec la même durée, sur toutes les coupes de la piste principale. */
export function transitionEverywhere(p: Project, tr: TransitionInstance): Project {
  if (p.video.length < 2) return p;
  const n = clone(p);
  n.video.forEach((c, i) => { c.transition = i < n.video.length - 1 ? clone(tr) : null; });
  clampTransitions(n.video);
  return n;
}

/* ---------- repères ---------- */
export function addMarker(p: Project, t: number): { project: Project; id: string } {
  const n = clone(p), m: Marker = { id: newId('mk'), t: Math.max(0, t), name: '', color: MARKER_COLORS[n.markers.length % MARKER_COLORS.length] };
  n.markers.push(m); n.markers.sort((a, b) => a.t - b.t);
  return { project: n, id: m.id };
}
export function patchMarker(p: Project, id: string, patch: Partial<Pick<Marker, 'name' | 'color' | 't'>>): Project {
  if (!p.markers.some(m => m.id === id)) return p;
  const n = clone(p);
  Object.assign(n.markers.find(m => m.id === id)!, patch); n.markers.sort((a, b) => a.t - b.t);
  return n;
}
export function removeMarker(p: Project, id: string | null): Project {
  if (!p.markers.length || (id && !p.markers.some(m => m.id === id))) return p;
  const n = clone(p);
  n.markers = id ? n.markers.filter(m => m.id !== id) : [];
  return n;
}

/** Change l'état d'une piste (muette, masquée, verrouillée). */
/** Gain de toute une piste (réglage de volume de son en-tête) ; 1 par défaut. */
export const trackGain = (p: Project, track: TrackId) => p.tracks[track]?.volume ?? 1;

export function setTrack(p: Project, track: TrackId, patch: TrackState): Project {
  const n = clone(p);
  n.tracks[track] = { ...n.tracks[track], ...patch };
  return n;
}

/** Remplace le fichier d'un média (fichier déplacé ou remplacé) : tous ses clips suivent, bornés à la nouvelle durée. */
export function replaceMedia(p: Project, mediaId: string, file: Pick<Media, 'path' | 'url' | 'name' | 'kind' | 'duration' | 'width' | 'height' | 'hasAudio'>): Project {
  const old = p.media.find(m => m.id === mediaId);
  if (!old || (old.kind === 'audio') !== (file.kind === 'audio')) return p;
  const n = clone(p);
  Object.assign(n.media.find(m => m.id === mediaId)!, file);
  if (file.kind === 'video' || file.kind === 'audio') for (const t of n.order) for (const c of clipsOf(n, t)) if (c.mediaId === mediaId && !c.still && file.duration > 0) {
    c.in = Math.min(c.in, Math.max(0, file.duration - MIN_CLIP)); c.dur = Math.max(MIN_CLIP, Math.min(c.dur, file.duration - c.in)); clampFades(c);
  }
  // Un arrêt sur image garde un instant qui existe dans le nouveau fichier.
  if (file.kind === 'video' && file.duration > 0) for (const t of n.order) for (const c of clipsOf(n, t)) if (c.mediaId === mediaId && c.still) c.in = Math.min(c.in, Math.max(0, file.duration - 0.05));
  clampTransitions(n.video);
  return n;
}

/** Gain d'un fondu audio à l'instant local du clip, de 0 à 1. */
export const imageGain = (c: Pick<Clip, 'dur' | 'vfadeIn' | 'vfadeOut'>, local: number) => fadeGain({ dur: c.dur, fadeIn: c.vfadeIn, fadeOut: c.vfadeOut }, local);

export function fadeGain(c: Pick<Clip, 'dur' | 'fadeIn' | 'fadeOut'>, local: number): number {
  let g = 1;
  if (c.fadeIn > 0) g = Math.min(g, local / c.fadeIn);
  if (c.fadeOut > 0) g = Math.min(g, (c.dur - local) / c.fadeOut);
  return Math.max(0, Math.min(1, g));
}
