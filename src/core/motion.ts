/** Mouvement d'un clip par points clés : position, taille, rotation et opacité qui évoluent pendant le clip.
 *  Fonctions pures, partagées par l'aperçu, l'export, la timeline et l'inspecteur. */
import type { Clip, Transform } from './types';

/** Façon d'aller d'un point au suivant. */
export const EASES = ['smooth', 'linear', 'back', 'hold'] as const;
export type Ease = typeof EASES[number];
export const EASE_LABELS: Record<Ease, string> = { smooth: 'Doux', linear: 'Régulier', back: 'Rebond', hold: 'Saut' };

/** Point du mouvement. t : secondes depuis le début du clip ; x, y, scale, rot comme Transform ; opacity de 0 à 1. */
export interface MotionKey { t: number; x: number; y: number; scale: number; rot: number; opacity: number; ease: Ease; }

export const MAX_KEYS = 200;
/** Écart sous lequel un geste modifie le point existant au lieu d'en poser un nouveau. */
export const KEY_SNAP = 0.12;

const curve: Record<Ease, (k: number) => number> = {
  linear: k => k,
  smooth: k => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2),
  back: k => { const c = 1.70158 * 1.3, c3 = c + 1; return 1 + c3 * (k - 1) ** 3 + c * (k - 1) ** 2; },
  hold: k => (k < 1 ? 0 : 1),
};
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
/** Courbe de Catmull-Rom : passe par p1 (k = 0) et p2 (k = 1), infléchie par les voisins p0 et p3. */
const cr = (p0: number, p1: number, p2: number, p3: number, k: number) => {
  const k2 = k * k, k3 = k2 * k;
  return 0.5 * (2 * p1 + (-p0 + p2) * k + (2 * p0 - 5 * p1 + 4 * p2 - p3) * k2 + (-p0 + 3 * p1 - 3 * p2 + p3) * k3);
};

export const hasMotion = (c: Clip) => !!c.keys && c.keys.length > 0;

/** Transformation et opacité du clip à l'instant local (secondes depuis son début). Sans point : celles du clip. */
export function motionAt(c: Clip, local: number): { transform: Transform; opacity: number } {
  const keys = c.keys;
  if (!keys || !keys.length) return { transform: c.transform, opacity: c.opacity };
  const flip = { ...(c.transform.flipH ? { flipH: true } : {}), ...(c.transform.flipV ? { flipV: true } : {}) };
  const at = (k: MotionKey) => ({ transform: { scale: k.scale, x: k.x, y: k.y, rot: k.rot, ...flip }, opacity: k.opacity });
  const n = keys.length - 1;
  if (local <= keys[0].t) return at(keys[0]);
  if (local >= keys[n].t) return at(keys[n]);
  let i = 0;
  while (keys[i + 1].t < local) i++;
  const a = keys[i], b = keys[i + 1], k = curve[a.ease]((local - a.t) / Math.max(1e-6, b.t - a.t));
  const p0 = keys[Math.max(0, i - 1)], p3 = keys[Math.min(n, i + 2)];
  // La taille varie en proportion (doubler puis redoubler prend le même temps), la position suit une courbe.
  const scale = a.scale > 0 && b.scale > 0 ? a.scale * (b.scale / a.scale) ** k : lerp(a.scale, b.scale, k);
  return {
    transform: { scale, x: cr(p0.x, a.x, b.x, p3.x, k), y: cr(p0.y, a.y, b.y, p3.y, k), rot: lerp(a.rot, b.rot, k), ...flip },
    opacity: Math.max(0, Math.min(1, lerp(a.opacity, b.opacity, k))),
  };
}

const sortKeys = (keys: MotionKey[]) => keys.sort((a, b) => a.t - b.t);
const keyOf = (c: Clip, t: number): MotionKey => {
  const m = motionAt(c, t);
  return { t, x: m.transform.x, y: m.transform.y, scale: m.transform.scale, rot: m.transform.rot, opacity: m.opacity, ease: 'smooth' };
};

/** Pose un point à l'instant local, ou modifie celui qui est à moins de KEY_SNAP. Renvoie les nouveaux points et le rang du point. */
export function setKey(c: Clip, local: number, patch: Partial<Omit<MotionKey, 't'>>): { keys: MotionKey[]; index: number } {
  const keys = (c.keys ?? []).map(k => ({ ...k }));
  let k = keys.find(x => Math.abs(x.t - local) < KEY_SNAP);
  if (k) Object.assign(k, patch);
  else {
    if (keys.length >= MAX_KEYS) return { keys, index: -1 };
    k = { ...keyOf(c, local), ...patch, t: local };
    keys.push(k);
  }
  sortKeys(keys);
  return { keys, index: keys.indexOf(k) };
}

/** Déplace un point dans le temps (dans le clip). */
export function moveKey(keys: MotionKey[], index: number, t: number, dur: number): { keys: MotionKey[]; index: number } {
  const out = keys.map(k => ({ ...k })), k = out[index];
  if (!k) return { keys: out, index };
  k.t = Math.max(0, Math.min(dur, t));
  sortKeys(out);
  return { keys: out, index: out.indexOf(k) };
}

/** Décale tous les points (rognage du début) : ils restent sur les mêmes images du contenu. */
export function shiftKeys(c: Clip, d: number) {
  if (c.keys?.length) c.keys = c.keys.map(k => ({ ...k, t: k.t - d }));
}

/* ---------- mouvements tout faits ---------- */
export const PRESETS = ['in-left', 'in-right', 'in-top', 'in-bottom', 'out-left', 'out-right', 'out-top', 'out-bottom', 'cross', 'drop', 'zoom-in', 'zoom-out', 'float', 'pop'] as const;
export type Preset = typeof PRESETS[number];
export const PRESET_LABELS: Record<Preset, string> = {
  'in-left': 'Entrer par la gauche', 'in-right': 'Entrer par la droite', 'in-top': 'Entrer par le haut', 'in-bottom': 'Entrer par le bas',
  'out-left': 'Sortir par la gauche', 'out-right': 'Sortir par la droite', 'out-top': 'Sortir par le haut', 'out-bottom': 'Sortir par le bas',
  cross: 'Traverser', drop: 'Tomber et rebondir', 'zoom-in': 'Zoom avant', 'zoom-out': 'Zoom arrière', float: 'Flotter', pop: 'Apparaître (pop)',
};

/** Points d'un mouvement tout fait. at : instant local de départ (« entrer » finit à at + 1 s, « sortir » finit à la fin du clip).
 *  Le mouvement part de la position que l'image a à cet instant ; les points existants hors de sa durée sont gardés.
 *  half : demi-largeur et demi-hauteur de l'image en fraction du cadre, pour la sortir juste assez. */
export function applyPreset(c: Clip, preset: Preset, at: number, half: { w: number; h: number }): MotionKey[] {
  const d = c.dur, here = keyOf(c, Math.max(0, Math.min(d, at)));
  const go = Math.min(1, d / 2);
  const offX = 0.5 + half.w + 0.02, offY = 0.5 + half.h + 0.02; // juste hors du cadre (x, y : 0 au centre, ±0,5 au bord)
  const K = (t: number, o: Partial<MotionKey> = {}, ease: Ease = 'smooth'): MotionKey => ({ ...here, ...o, t: Math.max(0, Math.min(d, t)), ease });
  const keep = (from: number, to: number) => (c.keys ?? []).filter(k => k.t < from - 0.05 || k.t > to + 0.05).map(k => ({ ...k }));
  const s = Math.max(0, Math.min(d - go, at)), e = d;
  let keys: MotionKey[];
  switch (preset) {
    case 'in-left': keys = [...keep(s, s + go), K(s, { x: -offX }), K(s + go)]; break;
    case 'in-right': keys = [...keep(s, s + go), K(s, { x: offX }), K(s + go)]; break;
    case 'in-top': keys = [...keep(s, s + go), K(s, { y: offY }), K(s + go)]; break;
    case 'in-bottom': keys = [...keep(s, s + go), K(s, { y: -offY }), K(s + go)]; break;
    case 'out-left': keys = [...keep(e - go, e), K(e - go), K(e, { x: -offX })]; break;
    case 'out-right': keys = [...keep(e - go, e), K(e - go), K(e, { x: offX })]; break;
    case 'out-top': keys = [...keep(e - go, e), K(e - go), K(e, { y: offY })]; break;
    case 'out-bottom': keys = [...keep(e - go, e), K(e - go), K(e, { y: -offY })]; break;
    case 'cross': keys = [K(0, { x: -offX, y: here.y - 0.12, rot: here.rot - 10 }), K(d / 2, { y: here.y + 0.06 }), K(d, { x: offX, y: here.y - 0.12, rot: here.rot + 10 })]; break;
    case 'drop': keys = [...keep(s, s + go * 1.2), K(s, { y: offY }, 'back'), K(s + go * 1.2)]; break;
    case 'zoom-in': keys = [K(0, { scale: here.scale * 0.8 }, 'linear'), K(d, { scale: here.scale * 1.25 })]; break;
    case 'zoom-out': keys = [K(0, { scale: here.scale * 1.25 }, 'linear'), K(d, { scale: here.scale * 0.8 })]; break;
    case 'float': { const n = Math.max(3, Math.min(61, Math.round(d / 1.5) + 1)); keys = Array.from({ length: n }, (_, i) => K(i * d / (n - 1), { y: here.y + (i % 2 ? 0.02 : -0.02), rot: here.rot + (i % 2 ? 1.5 : -1.5) })); break; }
    case 'pop': keys = [...keep(s, s + 0.5), K(s, { scale: here.scale * 0.2, opacity: 0 }, 'back'), K(s + Math.min(0.5, d / 2))]; break;
  }
  return sortKeys(keys).slice(0, MAX_KEYS);
}

/* ---------- geste mimé ---------- */
export interface Sample { t: number; x: number; y: number; }
/** Simplifie un geste en quelques points : on garde ceux qui s'écartent le plus du trajet en ligne droite (Douglas-Peucker),
 *  à tol près (fraction du cadre). */
export function simplify(pts: Sample[], tol = 0.01): Sample[] {
  if (pts.length <= 2) return pts.slice();
  const keep = new Set([0, pts.length - 1]);
  const walk = (a: number, b: number) => {
    let m = -1, best = tol;
    for (let i = a + 1; i < b; i++) {
      const k = (pts[i].t - pts[a].t) / (pts[b].t - pts[a].t || 1);
      const e = Math.hypot(pts[i].x - lerp(pts[a].x, pts[b].x, k), pts[i].y - lerp(pts[a].y, pts[b].y, k));
      if (e > best) { best = e; m = i; }
    }
    if (m > 0) { keep.add(m); walk(a, m); walk(m, b); }
  };
  walk(0, pts.length - 1);
  return [...keep].sort((a, b) => a - b).map(i => pts[i]);
}
/** Remplace les points de la durée du geste par ceux du geste simplifié (taille, rotation, opacité gardées). */
export function recordKeys(c: Clip, samples: Sample[]): MotionKey[] {
  if (samples.length < 2) return c.keys ?? [];
  const t0 = samples[0].t, t1 = samples[samples.length - 1].t, ref = keyOf(c, t0);
  const kept = (c.keys ?? []).filter(k => k.t < t0 - 0.05 || k.t > t1 + 0.05).map(k => ({ ...k }));
  // Un geste long est simplifié davantage jusqu'à tenir dans le budget de points, sans jamais couper les points gardés.
  let tol = 0.01, simple = simplify(samples, tol);
  while (kept.length + simple.length > MAX_KEYS && tol < 1) { tol *= 1.6; simple = simplify(samples, tol); }
  const fresh = simple.map(s => ({ ...ref, t: s.t, x: s.x, y: s.y, ease: 'linear' as Ease }));
  return sortKeys([...kept, ...fresh]).slice(0, MAX_KEYS);
}
