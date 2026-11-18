import { describe, expect, it } from 'vitest';
import { addMarker, addMedia, addOverlay, addSound, addText, appendClip, closeGap, gapAt, rippleRemove, patchClip, patchMarker, projectDuration, removeMarker, replaceMedia, setTrack, setTransition, splitAll, transitionEverywhere } from './ops';
import { parseProject } from './project';
import { audioPlan } from '../export/exporter';
import { defaultText, emptyProject, type Media, type Project } from './types';

const media = (id: string, duration: number, kind: Media['kind'] = 'video'): Media =>
  ({ id, path: `C:/v/${id}`, url: `ezmedia://local/${id}`, name: id, kind, duration, width: 1920, height: 1080, hasAudio: kind !== 'image' });

function base(): Project {
  let p = addMedia(emptyProject(), [media('a', 6), media('b', 4), media('c', 8), media('song', 30, 'audio'), media('logo', 0, 'image')]);
  for (const id of ['a', 'b', 'c']) p = appendClip(p, id)!.project;
  return p;
}

describe('couper toutes les pistes', () => {
  it('coupe chaque clip traversé, sauf sur une piste verrouillée', () => {
    let p = addText(base(), defaultText(), 1).project;      // titre 1 → 6
    p = addSound(p, 'song', 'audio', 0)!.project;           // musique 0 → 30
    p = setTrack(p, 'audio', { locked: true });
    const n = splitAll(p, 3);
    expect(n.video.map(c => c.dur)).toEqual([3, 3, 4, 8]);
    expect(n.text.map(c => [c.start, c.dur])).toEqual([[1, 2], [3, 3]]);
    expect(n.audio).toHaveLength(1);
    expect(projectDuration(n)).toBe(projectDuration(p));
  });
  it('ne change rien quand aucun clip n\'est traversé', () => {
    const p = base();
    expect(splitAll(p, 100)).toBe(p);
  });
});

describe('vides d\'une piste libre', () => {
  it('trouve le vide sous un instant et le referme', () => {
    let p = addOverlay(base(), 'logo', 2)!.project; // 2 → 7
    p = addOverlay(p, 'logo', 10)!.project;         // 10 → 15
    expect(gapAt(p, 'overlay', 1)).toEqual([0, 2]);
    expect(gapAt(p, 'overlay', 8)).toEqual([7, 10]);
    expect(gapAt(p, 'overlay', 4)).toBeNull();      // dans un clip
    expect(gapAt(p, 'overlay', 20)).toBeNull();     // après le dernier clip
    expect(gapAt(p, 'video', 1)).toBeNull();        // la piste principale n'a pas de vide
    const n = closeGap(p, 'overlay', 8);
    expect(n.overlay.map(c => c.start)).toEqual([2, 7]);
    expect(closeGap(n, 'overlay', 8)).toBe(n);
    expect(closeGap(p, 'overlay', 1).overlay.map(c => c.start)).toEqual([0, 8]);
  });
  it('supprimer en refermant n\'avale que la place du clip retiré', () => {
    let p = addOverlay(base(), 'logo', 0)!.project; // 0 → 5
    p = addOverlay(p, 'logo', 8)!.project;          // 8 → 13
    p = addOverlay(p, 'logo', 20)!.project;         // 20 → 25
    const n = rippleRemove(p, p.overlay[1].id);
    expect(n.overlay.map(c => c.start)).toEqual([0, 15]); // le vide 5 → 8 d'avant reste
    expect(rippleRemove(p, 'inconnu')).toBe(p);
    expect(rippleRemove(p, p.video[0].id).video).toHaveLength(2);
  });
});

describe('transition sur toutes les coupes', () => {
  it('pose la même transition partout, bornée au plus court des deux clips', () => {
    const p = transitionEverywhere(base(), { effectId: 'glt:Fade', params: { a: [1] }, dur: 5 });
    expect(p.video.map(c => c.transition?.effectId ?? null)).toEqual(['glt:Fade', 'glt:Fade', null]);
    expect(p.video.map(c => c.transition?.dur ?? 0)).toEqual([4, 4, 0]);
    expect(p.video[0].transition!.params).not.toBe(p.video[1].transition!.params);
    const one = addMedia(emptyProject(), [media('a', 6)]);
    expect(transitionEverywhere(one, { effectId: 'glt:Fade', params: {}, dur: 1 })).toBe(one);
  });
});

describe('repères', () => {
  it('se posent, restent triés, se modifient et se suppriment', () => {
    let p = addMarker(base(), 5).project;
    const r = addMarker(p, 2); p = r.project;
    expect(p.markers.map(m => m.t)).toEqual([2, 5]);
    p = patchMarker(p, r.id, { name: 'Refrain', t: 9 });
    expect(p.markers.map(m => [m.t, m.name])).toEqual([[5, ''], [9, 'Refrain']]);
    expect(patchMarker(p, 'inconnu', { name: 'x' })).toBe(p);
    expect(removeMarker(p, 'inconnu')).toBe(p);
    expect(removeMarker(p, r.id).markers).toHaveLength(1);
    expect(removeMarker(p, null).markers).toHaveLength(0);
  });
  it('survivent à un enregistrement, avec l\'état des pistes et les retournements', () => {
    let p = addMarker(base(), 3).project;
    p = patchMarker(p, p.markers[0].id, { name: 'Intro', color: '#22e3b6' });
    p = setTrack(p, 'video', { muted: true });
    p = setTrack(p, 'text', { hidden: true, locked: true });
    p = patchClip(p, p.video[0].id, c => { c.transform.flipH = true; });
    const back = parseProject(JSON.stringify(p))!;
    expect(back.markers).toEqual(p.markers);
    expect(back.tracks).toEqual({ video: { muted: true }, text: { hidden: true, locked: true } });
    expect(back.video[0].transform.flipH).toBe(true);
    expect(back.video[1].transform.flipH).toBeUndefined();
  });
  it('refuse les repères et les états de piste mal formés', () => {
    const raw = JSON.parse(JSON.stringify(base()));
    raw.markers = [{ id: 7, t: -4, name: 12, color: 'javascript:alert(1)' }, 'x', null];
    raw.tracks = { video: { muted: 'oui', locked: true }, autre: { muted: true }, text: 3 };
    const back = parseProject(JSON.stringify(raw))!;
    expect(back.markers).toHaveLength(1);
    expect(back.markers[0].t).toBe(0);
    expect(back.markers[0].color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(back.tracks).toEqual({ video: { locked: true } });
  });
  it('un ancien projet sans repères ni pistes s\'ouvre', () => {
    const raw = JSON.parse(JSON.stringify(base()));
    delete raw.markers; delete raw.tracks;
    const back = parseProject(JSON.stringify(raw))!;
    expect(back.markers).toEqual([]);
    expect(back.tracks).toEqual({});
  });
});

describe('pistes muettes', () => {
  it('une piste muette ne donne aucun son à l\'export, sans changer la durée', () => {
    let p = addSound(base(), 'song', 'audio', 0)!.project;
    const [v0, music0] = audioPlan(p);
    expect(v0.every(s => s.path)).toBe(true);
    expect(music0.length).toBeGreaterThan(0);
    p = setTrack(setTrack(p, 'video', { muted: true }), 'audio', { muted: true });
    const [v, music] = audioPlan(p);
    expect(v.map(s => s.path)).toEqual([null, null, null]);
    expect(v.map(s => s.dur)).toEqual(v0.map(s => s.dur));
    expect(music).toEqual([]);
  });
});

describe('remplacer le fichier d\'un média', () => {
  it('garde les clips et les borne à la nouvelle durée', () => {
    const p0 = base(), p = setTransition(p0, p0.video[0].id, { effectId: 'glt:Fade', params: {}, dur: 3 });
    const n = replaceMedia(p, 'a', { path: 'C:/v/a2', url: 'ezmedia://local/a2', name: 'a2', kind: 'video', duration: 2, width: 1280, height: 720, hasAudio: true });
    expect(n.video[0].transition?.dur).toBe(2); // la transition ne dépasse pas le clip raccourci
    expect(n.media.find(m => m.id === 'a')).toMatchObject({ name: 'a2', duration: 2, width: 1280 });
    expect(n.video[0]).toMatchObject({ mediaId: 'a', in: 0, dur: 2 });
    expect(n.video.slice(1).map(c => c.dur)).toEqual([4, 8]);
  });
  it('refuse d\'échanger un son et une image', () => {
    const p = base();
    expect(replaceMedia(p, 'a', { ...media('s', 9, 'audio') })).toBe(p);
    expect(replaceMedia(p, 'inconnu', { ...media('z', 9) })).toBe(p);
  });
});
