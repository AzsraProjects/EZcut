import { describe, expect, it } from 'vitest';
import { parseProject } from './project';

const base = () => ({
  version: 1, name: 'Test', width: 1920, height: 1080, fps: 30,
  media: [
    { id: 'm1', path: 'C:/v/a.mp4', url: 'file://attaquant/s/a.mp4', name: 'a.mp4', kind: 'video', duration: 6, width: 1920, height: 1080, hasAudio: true },
    { id: 'm2', path: 'C:/v/b.mp3', url: '', name: 'b.mp3', kind: 'audio', duration: 20, width: 0, height: 0, hasAudio: true },
  ],
  video: [
    { id: 'c1', mediaId: 'm1', in: 0, dur: 3, volume: 1, transform: { scale: 1, x: 0, y: 0, rot: 0 }, color: {}, fx: [{ uid: 'f1', effectId: 'isf:Bloom', params: { intensity: 1 }, on: true }], transition: { effectId: 'glt:Fade', params: {}, dur: 1 } },
    { id: 'c2', mediaId: 'm1', in: 3, dur: 3, volume: 1, transform: { scale: 1, x: 0, y: 0, rot: 0 }, color: {}, fx: [], transition: { effectId: 'glt:Fade', params: {}, dur: 1 } },
  ],
  audio: [{ id: 'c3', mediaId: 'm2', in: 0, dur: 20, volume: 0.5, transform: { scale: 1, x: 0, y: 0, rot: 0 }, color: {}, fx: [], transition: null }],
});
const parse = (o: unknown) => parseProject(JSON.stringify(o));

describe('lecture d\'un projet', () => {
  it('relit un projet valide', () => {
    const p = parse(base())!;
    expect(p.video.map(c => c.id)).toEqual(['c1', 'c2']);
    expect(p.audio[0].volume).toBe(0.5);
    expect(p.video[0].fx[0].params).toEqual({ intensity: 1 });
  });
  it('ne reprend jamais l\'URL de lecture écrite dans le fichier', () => {
    expect(parse(base())!.media.every(m => m.url === '')).toBe(true);
  });
  it('retire la transition du dernier clip', () => {
    const p = parse(base())!;
    expect(p.video[0].transition?.effectId).toBe('glt:Fade');
    expect(p.video[1].transition).toBeNull();
  });
  it('refuse ce qui n\'est pas un projet', () => {
    expect(parseProject('pas du json')).toBeNull();
    expect(parse({ version: 3, media: [], video: [], audio: [] })).toBeNull();
    expect(parse({ version: 1, media: {}, video: [], audio: [] })).toBeNull();
    expect(parse(null)).toBeNull();
  });
  it('borne les valeurs absurdes au lieu de les propager', () => {
    const o = base();
    Object.assign(o, { width: 1e9, fps: -5, name: 'x'.repeat(1000) });
    Object.assign(o.video[0], { dur: 1e308, in: -4, volume: 99, transform: { scale: 'grand', x: 1e9, y: null, rot: 0 } });
    const p = parse(o)!;
    expect(p.width).toBe(8192); expect(p.fps).toBe(1); expect(p.name).toHaveLength(120);
    expect(p.video[0].dur).toBe(86400); expect(p.video[0].in).toBe(0); expect(p.video[0].volume).toBe(1);
    expect(p.video[0].transform).toEqual({ scale: 1, x: 5, y: 0, rot: 0 });
  });
  it('écarte les clips sans média, en double, ou sur la mauvaise piste', () => {
    const o = base();
    o.video.push({ ...o.video[0], id: 'c9', mediaId: 'inconnu' }, { ...o.video[0] }, { ...o.audio[0], id: 'c8' } as never);
    expect(parse(o)!.video.map(c => c.id)).toEqual(['c1', 'c2']);
  });
  it('reprend un projet de version 1 et lui ajoute les pistes libres vides', () => {
    const p = parse(base())!;
    expect(p.version).toBe(2);
    expect(p.overlay).toEqual([]); expect(p.text).toEqual([]);
    expect(p.video[0].opacity).toBe(1); expect(p.video[0].blend).toBe('normal'); expect(p.video[0].fadeIn).toBe(0);
  });
  it('nettoie les titres et sépare les clips qui se chevauchent sur une piste libre', () => {
    const o = { ...base(), version: 2, text: [
      { id: 't1', start: 1, dur: 3, text: { content: 'Bonjour', font: 'Arial"; x', size: 9, color: 'rouge', align: 'milieu', animIn: 'explosion' } },
      { id: 't2', start: 2, dur: 2, text: { content: 'Deux' } },
      { id: 't3', start: 0, dur: 1 },
    ] };
    const p = parse(o)!;
    expect(p.text.map(c => c.id)).toEqual(['t1', 't2']);
    expect(p.text[0].text).toMatchObject({ content: 'Bonjour', font: 'Arial x', size: 1, color: '#ffffff', align: 'center', animIn: 'none' });
    expect(p.text[1].start).toBe(4);
  });
  it('ne garde que des paramètres numériques, booléens ou vecteurs courts', () => {
    const o = base();
    o.video[0].fx[0].params = { ok: 0.5, flag: true, vec: [1, 2], texte: '<script>', objet: { a: 1 }, long: [1, 2, 3, 4, 5], 'nom invalide !': 1 } as never;
    expect(parse(o)!.video[0].fx[0].params).toEqual({ ok: 0.5, flag: true, vec: [1, 2] });
  });
});
