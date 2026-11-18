/** Lecture d'un fichier de projet. Le contenu peut venir d'un inconnu : tout est vérifié, borné et reconstruit champ par champ. */
import { MIN_CLIP, type Clip, type FxInstance, type Media, type Params, type ParamValue, type Project, type TransitionInstance } from './types';

const MAX_MEDIA = 2000, MAX_CLIPS = 5000, MAX_FX = 32, MAX_PARAMS = 64;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, max: number, def = '') => (typeof v === 'string' ? v.slice(0, max) : def);
const num = (v: unknown, lo: number, hi: number, def: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : def);

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

function clip(v: unknown, mediaIds: Set<string>): Clip | null {
  if (!isObj(v) || typeof v.id !== 'string' || typeof v.mediaId !== 'string' || !mediaIds.has(v.mediaId)) return null;
  const t = isObj(v.transform) ? v.transform : {};
  return {
    id: str(v.id, 80), mediaId: v.mediaId, in: num(v.in, 0, 86400 * 4, 0), dur: num(v.dur, MIN_CLIP, 86400, 1), volume: num(v.volume, 0, 1, 1),
    transform: { scale: num(t.scale, 0.01, 20, 1), x: num(t.x, -5, 5, 0), y: num(t.y, -5, 5, 0), rot: num(t.rot, -3600, 3600, 0) },
    color: params(v.color), fx: (Array.isArray(v.fx) ? v.fx : []).slice(0, MAX_FX).map(fx).filter((f): f is FxInstance => !!f),
    transition: transition(v.transition),
  };
}

/** Renvoie un projet sain, ou null si le fichier n'en est pas un. */
export function parseProject(json: string): Project | null {
  let raw: unknown;
  try { raw = JSON.parse(json); } catch { return null; }
  if (!isObj(raw) || raw.version !== 1 || !Array.isArray(raw.media) || !Array.isArray(raw.video) || !Array.isArray(raw.audio)) return null;
  const seen = new Set<string>();
  const med = raw.media.slice(0, MAX_MEDIA).map(media).filter((m): m is Media => !!m && !seen.has(m.id) && !!seen.add(m.id));
  const ids = new Set(med.map(m => m.id)), kindOf = new Map(med.map(m => [m.id, m.kind]));
  const clipIds = new Set<string>();
  const track = (list: unknown[], audio: boolean) => list.slice(0, MAX_CLIPS).map(c => clip(c, ids))
    .filter((c): c is Clip => !!c && (kindOf.get(c.mediaId) === 'audio') === audio && !clipIds.has(c.id) && !!clipIds.add(c.id));
  const video = track(raw.video, false), audio = track(raw.audio, true);
  // Une transition n'existe qu'entre deux clips vidéo.
  video.forEach((c, i) => { const next = video[i + 1]; if (!next) c.transition = null; else if (c.transition) c.transition.dur = Math.max(0.2, Math.min(c.transition.dur, c.dur, next.dur)); });
  audio.forEach(c => { c.transition = null; c.fx = []; });
  const even = (n: number) => Math.round(n / 2) * 2;
  return { version: 1, name: str(raw.name, 120, 'Projet sans titre'), width: even(num(raw.width, 16, 8192, 1920)), height: even(num(raw.height, 16, 8192, 1080)),
    fps: Math.round(num(raw.fps, 1, 240, 30)), media: med, video, audio };
}
