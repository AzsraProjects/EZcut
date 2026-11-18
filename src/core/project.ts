/** Lecture d'un fichier de projet. Le contenu peut venir d'un inconnu : tout est vérifié, borné et reconstruit champ par champ.
 *  Les projets de version 1 (sans incrustations ni titres) et 2 (cinq pistes fixes) sont repris tels quels. */
import { EXTRA_TRACK, fixOrder, kindOf, isSound } from './ops';
import { BASE_TRACKS, MAX_EXTRA_TRACKS, BLEND_MODES, MARKER_COLORS, MIN_CLIP, TEXT_ANIMS, defaultText, type BlendMode, type Marker, type TrackState, type Clip, type FxInstance, type Media, type Params, type ParamValue, type Project, type TextAnim, type TextStyle, type TransitionInstance } from './types';

const MAX_MEDIA = 2000, MAX_CLIPS = 5000, MAX_FX = 32, MAX_PARAMS = 64;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, max: number, def = '') => (typeof v === 'string' ? v.slice(0, max) : def);
const num = (v: unknown, lo: number, hi: number, def: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : def);
const color = (v: unknown, def: string) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : def);
const oneOf = <T extends string>(v: unknown, list: readonly T[], def: T): T => (list.includes(v as T) ? (v as T) : def);

function paramValue(v: unknown): ParamValue | undefined {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (Array.isArray(v) && v.length <= 4 && v.every(x => typeof x === 'number' && Number.isFinite(x))) return v as number[];
  return undefined;
}
function params(v: unknown): Params {
  const out: Params = {};
  if (isObj(v)) for (const [k, x] of Object.entries(v).slice(0, MAX_PARAMS)) { const p = paramValue(x); if (p !== undefined && /^\w{1,64}$/.test(k)) out[k] = p; }
  return out;
}

function media(v: unknown): Media | null {
  if (!isObj(v) || typeof v.id !== 'string' || typeof v.path !== 'string') return null;
  const kind = v.kind === 'audio' || v.kind === 'image' ? v.kind : 'video';
  // L'URL de lecture n'est jamais reprise du fichier : elle est redonnée par l'application pour les fichiers acceptés.
  return { id: str(v.id, 80), path: str(v.path, 1024), url: '', name: str(v.name, 260, 'média'), kind,
    duration: num(v.duration, 0, 86400 * 4, 0), width: num(v.width, 0, 16384, 0), height: num(v.height, 0, 16384, 0), hasAudio: v.hasAudio === true };
}

function fx(v: unknown): FxInstance | null {
  if (!isObj(v) || typeof v.uid !== 'string' || typeof v.effectId !== 'string') return null;
  return { uid: str(v.uid, 80), effectId: str(v.effectId, 200), params: params(v.params), on: v.on !== false };
}

function transition(v: unknown): TransitionInstance | null {
  if (!isObj(v) || typeof v.effectId !== 'string') return null;
  const p: Record<string, number[]> = {};
  for (const [k, x] of Object.entries(params(v.params))) p[k] = Array.isArray(x) ? x : [Number(x)];
  return { effectId: str(v.effectId, 200), params: p, dur: num(v.dur, 0.2, 10, 1) };
}

function text(v: unknown): TextStyle | null {
  if (!isObj(v)) return null;
  const d = defaultText();
  return {
    content: str(v.content, 2000, d.content), font: str(v.font, 80, d.font).replace(/["'<>;{}\\]/g, ''), size: num(v.size, 0.01, 1, d.size), weight: Math.round(num(v.weight, 100, 900, d.weight)),
    color: color(v.color, d.color), align: oneOf(v.align, ['left', 'center', 'right'] as const, d.align),
    stroke: num(v.stroke, 0, 0.5, 0), strokeColor: color(v.strokeColor, d.strokeColor), shadow: num(v.shadow, 0, 1, 0),
    box: num(v.box, 0, 1, 0), boxColor: color(v.boxColor, d.boxColor),
    animIn: oneOf<TextAnim>(v.animIn, TEXT_ANIMS, 'none'), animOut: oneOf<TextAnim>(v.animOut, TEXT_ANIMS, 'none'), animDur: num(v.animDur, 0.05, 5, d.animDur),
  };
}

function clip(v: unknown, mediaIds: Set<string>, isText: boolean): Clip | null {
  if (!isObj(v) || typeof v.id !== 'string') return null;
  const style = isText ? text(v.text) : null;
  if (isText ? !style : typeof v.mediaId !== 'string' || !mediaIds.has(v.mediaId)) return null;
  const t = isObj(v.transform) ? v.transform : {};
  const dur = num(v.dur, MIN_CLIP, 86400, 1);
  return {
    id: str(v.id, 80), mediaId: isText ? '' : (v.mediaId as string), start: num(v.start, 0, 86400 * 4, 0), in: num(v.in, 0, 86400 * 4, 0), dur,
    volume: num(v.volume, 0, 1, 1), fadeIn: num(v.fadeIn, 0, dur, 0), fadeOut: num(v.fadeOut, 0, dur - num(v.fadeIn, 0, dur, 0), 0),
    vfadeIn: num(v.vfadeIn, 0, dur, 0), vfadeOut: num(v.vfadeOut, 0, dur - num(v.vfadeIn, 0, dur, 0), 0),
    transform: { scale: num(t.scale, 0.01, 20, 1), x: num(t.x, -5, 5, 0), y: num(t.y, -5, 5, 0), rot: num(t.rot, -3600, 3600, 0), ...(t.flipH === true ? { flipH: true } : {}), ...(t.flipV === true ? { flipV: true } : {}) },
    opacity: num(v.opacity, 0, 1, 1), blend: oneOf<BlendMode>(v.blend, BLEND_MODES, 'normal'),
    color: params(v.color), fx: isText ? [] : (Array.isArray(v.fx) ? v.fx : []).slice(0, MAX_FX).map(fx).filter((f): f is FxInstance => !!f),
    transition: transition(v.transition), text: style, still: !isText && v.still === true, off: v.off === true,
  };
}

/** Renvoie un projet sain, ou null si le fichier n'en est pas un. */
export function parseProject(json: string): Project | null {
  let raw: unknown;
  try { raw = JSON.parse(json); } catch { return null; }
  if (!isObj(raw) || (raw.version !== 1 && raw.version !== 2 && raw.version !== 3) || !Array.isArray(raw.media) || !Array.isArray(raw.video) || !Array.isArray(raw.audio)) return null;
  const seen = new Set<string>();
  const med = raw.media.slice(0, MAX_MEDIA).map(media).filter((m): m is Media => !!m && !seen.has(m.id) && !!seen.add(m.id));
  const ids = new Set(med.map(m => m.id)), mediaKind = new Map(med.map(m => [m.id, m.kind]));
  const clipIds = new Set<string>();
  const fresh = (c: Clip | null): c is Clip => !!c && !clipIds.has(c.id) && !!clipIds.add(c.id);
  // Pistes d'image : vidéos et images. Pistes de son : fichiers audio, et vidéos dont le son a été détaché.
  const mediaTrack = (list: unknown, sound: boolean) => (Array.isArray(list) ? list : []).slice(0, MAX_CLIPS).map(c => clip(c, ids, false))
    .filter((c): c is Clip => !!c && (sound ? mediaKind.get(c.mediaId) !== 'image' : mediaKind.get(c.mediaId) !== 'audio')).filter(fresh);
  const video = mediaTrack(raw.video, false), audio = mediaTrack(raw.audio, true), sound = mediaTrack(raw.sound, true), overlay = mediaTrack(raw.overlay, false);
  // Version 1 : la piste audio était magnétique, les clips s'y suivaient sans position propre.
  if (raw.version === 1) { let at = 0; for (const c of audio) { c.start = at; at += c.dur; } }
  const textTrack = (list: unknown) => (Array.isArray(list) ? list : []).slice(0, MAX_CLIPS).map(c => clip(c, ids, true)).filter(fresh);
  const titles = textTrack(raw.text);
  // Pistes ajoutées : identifiant « genre-numéro », en nombre borné, chacune lue comme la piste de base de son genre.
  const extra: Record<string, Clip[]> = {};
  if (isObj(raw.extra)) for (const [id, list] of Object.entries(raw.extra)) {
    if (!EXTRA_TRACK.test(id) || Object.keys(extra).length >= MAX_EXTRA_TRACKS) continue;
    extra[id] = kindOf(id) === 'text' ? textTrack(list) : mediaTrack(list, isSound(id));
  }
  const extraIds = Object.keys(extra), added = (sound: boolean) => extraIds.filter(id => isSound(id) === sound).map(id => extra[id]);
  // Une transition n'existe qu'entre deux clips de la piste principale.
  video.forEach((c, i) => { const next = video[i + 1]; if (!next) c.transition = null; else if (c.transition) c.transition.dur = Math.min(c.dur, next.dur, Math.max(0.2, c.transition.dur)); });
  for (const c of [audio, sound, ...added(true)].flat()) { c.transition = null; c.fx = []; c.still = false; c.vfadeIn = 0; c.vfadeOut = 0; }
  // Pistes libres : triées, sans recouvrement (un clip qui en chevauche un autre est repoussé après lui).
  for (const list of [overlay, titles, audio, sound, ...added(false), ...added(true)]) {
    list.sort((a, b) => a.start - b.start);
    list.forEach((c, i) => { c.transition = null; const prev = list[i - 1]; if (prev && c.start < prev.start + prev.dur) c.start = prev.start + prev.dur; });
  }
  const markers: Marker[] = (Array.isArray(raw.markers) ? raw.markers : []).slice(0, 500).filter(isObj)
    .map((m, i) => ({ id: str(m.id, 80, 'mk-' + i), t: num(m.t, 0, 86400 * 4, 0), name: str(m.name, 80), color: color(m.color, MARKER_COLORS[0]) })).sort((a, b) => a.t - b.t);
  const tracks: Record<string, TrackState> = {};
  if (isObj(raw.tracks)) for (const k of [...BASE_TRACKS, ...extraIds]) { const s = Object.hasOwn(raw.tracks, k) ? raw.tracks[k] : null; if (isObj(s)) tracks[k] = { ...(s.muted === true ? { muted: true } : {}), ...(s.hidden === true ? { hidden: true } : {}), ...(s.locked === true ? { locked: true } : {}) }; }
  const even = (n: number) => Math.round(n / 2) * 2;
  return { version: 3, name: str(raw.name, 120, 'Projet sans titre'), width: even(num(raw.width, 16, 8192, 1920)), height: even(num(raw.height, 16, 8192, 1080)),
    fps: Math.round(num(raw.fps, 1, 240, 30)), media: med, video, audio, sound, overlay, text: titles, extra, order: fixOrder(raw.order, extraIds), markers, tracks };
}
