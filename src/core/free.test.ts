import { describe, expect, it } from 'vitest';
import { addMedia, addOverlay, addText, appendClip, fadeGain, findClip, freeSlot, moveFree, projectDuration, removeClip, splitAt, trimClip } from './ops';
import { defaultText, emptyProject, type Media, type Project } from './types';

const media = (id: string, duration: number, kind: Media['kind'] = 'video'): Media =>
  ({ id, path: `C:/v/${id}`, url: `ezmedia://local/${id}`, name: id, kind, duration, width: 1920, height: 1080, hasAudio: kind !== 'image' });

function base(): Project {
  let p = addMedia(emptyProject(), [media('a', 10), media('logo', 0, 'image'), media('b', 4)]);
  p = appendClip(p, 'a')!.project;
  return p;
}

describe('pistes libres', () => {
  it('pose une incrustation à l\'instant demandé, réduite de moitié', () => {
    const r = addOverlay(base(), 'logo', 2)!;
    const c = r.project.overlay[0];
    expect([c.start, c.dur, c.transform.scale]).toEqual([2, 5, 0.5]);
    expect(findClip(r.project, r.clipId)).toMatchObject({ track: 'overlay', start: 2 });
  });
  it('ne superpose jamais deux clips : le second est repoussé après le premier', () => {
    let p = addOverlay(base(), 'logo', 2)!.project; // 2 → 7
    p = addOverlay(p, 'b', 4)!.project;             // voulu à 4, placé à 7
    expect(p.overlay.map(c => c.start)).toEqual([2, 7]);
    p = addOverlay(p, 'b', 0)!.project;             // 0 → 4 chevauche 2 → 7 puis 7 → 11 : va à 11
    expect(p.overlay.map(c => c.start)).toEqual([2, 7, 11]);
    expect(freeSlot(p.overlay, 1, 0.5)).toBe(0.5);  // un clip court tient avant le premier
  });
  it('déplace un clip sans le faire chevaucher son voisin, et garde la piste triée', () => {
    let p = addText(base(), defaultText(), 0).project; // 0 → 5
    const r = addText(p, defaultText(), 7);            // 7 → 12
    p = moveFree(r.project, r.clipId, 1);              // chevauche 0 → 5 : placé à 5
    expect(p.text.map(c => c.start)).toEqual([0, 5]);
    p = moveFree(p, p.text[0].id, 20);
    expect(p.text.map(c => c.start)).toEqual([5, 20]);
    expect(moveFree(p, p.text[0].id, 5)).toBe(p);
  });
  it('rogne un titre des deux côtés sans dépasser ses voisins', () => {
    let p = addText(base(), defaultText(), 0).project;        // A : 0 → 5
    p = addText(p, defaultText(), 6).project;                 // B : 6 → 11
    const b = p.text[1].id;
    p = trimClip(p, b, 'start', -5);                          // bute sur la fin de A
    expect([p.text[1].start, p.text[1].dur]).toEqual([5, 6]);
    p = trimClip(p, p.text[0].id, 'end', 10);                 // bute sur le début de B
    expect(p.text[0].dur).toBe(5);
    p = trimClip(p, b, 'end', 100);                           // un titre n'a pas de durée maximale
    expect(p.text[1].dur).toBe(106);
  });
  it('rogne le début d\'une incrustation vidéo en avançant son point d\'entrée', () => {
    let p = addOverlay(base(), 'b', 2)!.project; // b dure 4 s
    const id = p.overlay[0].id;
    p = trimClip(p, id, 'start', 1);
    expect([p.overlay[0].start, p.overlay[0].in, p.overlay[0].dur]).toEqual([3, 1, 3]);
    p = trimClip(p, id, 'start', -9); // ne remonte pas avant le début du fichier
    expect([p.overlay[0].start, p.overlay[0].in, p.overlay[0].dur]).toEqual([2, 0, 4]);
  });
  it('scinde un titre et compte les pistes libres dans la durée du projet', () => {
    let p = addText(base(), defaultText(), 9).project; // 9 → 14, la vidéo s'arrête à 10
    expect(projectDuration(p)).toBe(14);
    p = splitAt(p, 'text', 10);
    expect(p.text.map(c => [c.start, c.dur])).toEqual([[9, 1], [10, 4]]);
    p = removeClip(p, p.text[1].id);
    expect(projectDuration(p)).toBe(10);
  });
});

describe('fondus du son', () => {
  it('monte puis descend, et vaut 1 sans fondu', () => {
    const c = { dur: 10, fadeIn: 2, fadeOut: 4 };
    expect(fadeGain(c, 0)).toBe(0);
    expect(fadeGain(c, 1)).toBe(0.5);
    expect(fadeGain(c, 5)).toBe(1);
    expect(fadeGain(c, 8)).toBe(0.5);
    expect(fadeGain(c, 10)).toBe(0);
    expect(fadeGain({ dur: 10, fadeIn: 0, fadeOut: 0 }, 0)).toBe(1);
  });
});
