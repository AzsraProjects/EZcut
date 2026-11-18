// Mouvement par points clés : interpolation, pose de points, mouvements tout faits, geste mimé, coupe, rognage, lecture du projet.
import { describe, expect, it } from 'vitest';
import { applyPreset, motionAt, recordKeys, setKey, simplify, type MotionKey } from './motion';
import { addMedia, addOverlay, appendClip, findClip, freezeAt, splitAt, trimClip } from './ops';
import { parseProject } from './project';
import { emptyProject, type Clip, type Media } from './types';

const media = (id: string, kind: Media['kind'] = 'video', duration = 10): Media =>
  ({ id, path: `C:/v/${id}`, url: `ezmedia://local/${id}`, name: id, kind, duration, width: 1920, height: 1080, hasAudio: kind === 'video' });
const K = (t: number, x: number, o: Partial<MotionKey> = {}): MotionKey => ({ t, x, y: 0, scale: 1, rot: 0, opacity: 1, ease: 'linear', ...o });
function overlay(keys?: MotionKey[]) {
  let p = addMedia(emptyProject(), [media('v'), media('logo', 'image', 0)]);
  p = appendClip(p, 'v')!.project;
  const r = addOverlay(p, 'logo', 0)!;
  p = r.project;
  if (keys) p = { ...p, overlay: p.overlay.map(c => ({ ...c, keys })) };
  return { p, id: r.clipId, clip: () => findClip(p, r.clipId)!.clip };
}

describe('mouvement', () => {
  it('sans point, le clip garde sa transformation et son opacité', () => {
    const { clip } = overlay();
    const c = clip();
    expect(motionAt(c, 1)).toEqual({ transform: c.transform, opacity: c.opacity });
  });
  it('passe exactement par chaque point et reste au premier avant, au dernier après', () => {
    const { clip } = overlay([K(1, -0.4), K(2, 0), K(3, 0.4, { scale: 2, opacity: 0.5 })]);
    const c = clip();
    expect(motionAt(c, 0).transform.x).toBeCloseTo(-0.4);
    expect(motionAt(c, 2).transform.x).toBeCloseTo(0);
    expect(motionAt(c, 3).transform.x).toBeCloseTo(0.4);
    expect(motionAt(c, 4)).toMatchObject({ opacity: 0.5, transform: { scale: 2 } });
    // Points alignés et réguliers : entre deux points intérieurs, la courbe reste une droite à vitesse constante.
    const { clip: c4 } = overlay([K(1, -0.4), K(2, 0), K(3, 0.4), K(4, 0.8)]);
    expect(motionAt(c4(), 2.5).transform.x).toBeCloseTo(0.2, 6);
  });
  it('Saut : immobile jusqu\'au point suivant ; la taille varie en proportion', () => {
    const { clip } = overlay([K(0, 0, { ease: 'hold', scale: 1 }), K(2, 1, { scale: 4 })]);
    expect(motionAt(clip(), 1.99).transform.x).toBe(0);
    const { clip: c2 } = overlay([K(0, 0, { scale: 1 }), K(2, 0, { scale: 4 })]);
    expect(motionAt(c2(), 1).transform.scale).toBeCloseTo(2); // à mi-chemin d'un ×4 : ×2
  });
  it('pose un point, ou modifie celui qui est à moins de 0,12 s', () => {
    const { clip } = overlay([K(1, 0)]);
    let c: Clip = clip();
    const a = setKey(c, 3, { x: 0.3 });
    expect(a.keys.map(k => k.t)).toEqual([1, 3]);
    c = { ...c, keys: a.keys };
    const b = setKey(c, 3.08, { x: 0.5 });
    expect(b.keys).toHaveLength(2);
    expect(b.keys[1]).toMatchObject({ t: 3, x: 0.5 });
  });
  it('« Entrer par la gauche » part hors du cadre et arrive à la position actuelle ; « Sortir » finit hors du cadre', () => {
    const { clip } = overlay();
    const c = { ...clip(), transform: { scale: 0.5, x: 0.2, y: 0.1, rot: 0 } };
    const keys = applyPreset(c, 'in-left', 0, { w: 0.25, h: 0.25 });
    expect(keys[0].x).toBeLessThan(-0.5 - 0.25);
    expect(keys[keys.length - 1]).toMatchObject({ x: 0.2, y: 0.1 });
    const out = applyPreset({ ...c, keys }, 'out-right', 0, { w: 0.25, h: 0.25 });
    expect(out[out.length - 1].t).toBe(c.dur);
    expect(out[out.length - 1].x).toBeGreaterThan(0.75);
    expect(out[0].x).toBeLessThan(-0.75); // l'entrée est gardée
  });
  it('geste mimé : une ligne droite donne deux points, un coin est gardé', () => {
    const line = Array.from({ length: 30 }, (_, i) => ({ t: i / 30, x: i / 30, y: 0 }));
    expect(simplify(line)).toHaveLength(2);
    const corner = Array.from({ length: 30 }, (_, i) => ({ t: i / 30, x: i < 15 ? i / 15 : 1, y: i < 15 ? 0 : (i - 15) / 15 }));
    expect(simplify(corner).length).toBeGreaterThanOrEqual(3);
    const { clip } = overlay([K(0, -1), K(4, 1)]);
    const keys = recordKeys(clip(), line.map(s => ({ ...s, t: s.t + 1 })));
    expect(keys.map(k => k.t)).toEqual([0, 1, 1 + 29 / 30, 4]);
  });
  it('couper un clip animé ne fait pas sauter l\'image à la coupe', () => {
    let p = addMedia(emptyProject(), [media('v')]);
    p = appendClip(p, 'v')!.project;
    p = { ...p, video: [{ ...p.video[0], keys: [K(0, -0.5), K(6, 0.5, { scale: 2 })] }] };
    const before = motionAt(p.video[0], 4);
    const n = splitAt(p, 'video', 4);
    expect(n.video).toHaveLength(2);
    const after = motionAt(n.video[1], 0);
    expect(after.transform.x).toBeCloseTo(before.transform.x, 6);
    expect(after.transform.scale).toBeCloseTo(before.transform.scale, 6);
    expect(motionAt(n.video[0], 2).transform.x).toBeCloseTo(motionAt(p.video[0], 2).transform.x, 6);
  });
  it('un arrêt sur image d\'un clip animé garde le cadrage de l\'instant figé, sans mouvement', () => {
    let p = addMedia(emptyProject(), [media('v')]);
    p = appendClip(p, 'v')!.project;
    p = { ...p, video: [{ ...p.video[0], keys: [K(0, -0.5), K(6, 0.5)] }] };
    const r = freezeAt(p, 3)!, still = findClip(r.project, r.clipId)!.clip;
    expect(still.keys).toBeUndefined();
    expect(still.transform.x).toBeCloseTo(motionAt(p.video[0], 3).transform.x, 6);
  });
  it('« Flotter » sur un très long clip et un long geste tiennent dans 200 points sans perdre la fin', () => {
    const { clip } = overlay();
    const long = { ...clip(), dur: 600 };
    expect(applyPreset(long, 'float', 0, { w: 0.2, h: 0.2 }).at(-1)!.t).toBe(600);
    const zigzag = Array.from({ length: 3000 }, (_, i) => ({ t: i / 30, x: (i % 2) * 0.3, y: 0 }));
    const keys = recordKeys({ ...long, keys: [K(590, 0)] }, zigzag);
    expect(keys.length).toBeLessThanOrEqual(200);
    expect(keys.at(-1)!.t).toBe(590); // le point d'après le geste est gardé
  });
  it('rogner le début garde le mouvement calé sur les mêmes images', () => {
    let p = addMedia(emptyProject(), [media('v')]);
    p = appendClip(p, 'v')!.project;
    p = { ...p, video: [{ ...p.video[0], keys: [K(0, -0.5), K(6, 0.5)] }] };
    const ref = motionAt(p.video[0], 3).transform.x;
    const n = trimClip(p, p.video[0].id, 'start', 1);
    expect(motionAt(n.video[0], 2).transform.x).toBeCloseTo(ref, 6);
  });
  it('lecture du projet : points bornés et triés, façon inconnue remplacée', () => {
    const { p } = overlay();
    const raw = JSON.parse(JSON.stringify(p));
    raw.overlay[0].keys = [{ t: 3, x: 99, ease: 'fusée' }, { t: 1, x: 0.2, scale: -4, opacity: 7 }, 'rien'];
    const q = parseProject(JSON.stringify(raw))!;
    expect(q.overlay[0].keys).toEqual([
      { t: 1, x: 0.2, y: 0, scale: 0.01, rot: 0, opacity: 1, ease: 'smooth' },
      { t: 3, x: 5, y: 0, scale: 1, rot: 0, opacity: 1, ease: 'smooth' },
    ]);
    raw.overlay[0].keys = Array.from({ length: 500 }, (_, i) => ({ t: i }));
    expect(parseProject(JSON.stringify(raw))!.overlay[0].keys).toHaveLength(200);
    delete raw.overlay[0].keys;
    expect(parseProject(JSON.stringify(raw))!.overlay[0].keys).toBeUndefined();
  });
});
