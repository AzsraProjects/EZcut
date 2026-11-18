import { describe, expect, it } from 'vitest';
import { addFx, addMedia, appendClip, clipAt, moveClip, projectDuration, removeClip, setTransition, splitAt, trackStarts, trimClip } from './ops';
import { emptyProject, type Media, type Project } from './types';

const media = (id: string, duration: number, kind: Media['kind'] = 'video'): Media =>
  ({ id, path: `C:/v/${id}.mp4`, url: `ezmedia://local/${id}`, name: `${id}.mp4`, kind, duration, width: 1920, height: 1080, hasAudio: true });

function sample(): Project {
  let p = addMedia(emptyProject(), [media('a', 6), media('b', 4), media('m', 20, 'audio')]);
  p = appendClip(p, 'a')!.project;
  p = appendClip(p, 'b')!.project;
  p = appendClip(p, 'm')!.project;
  return p;
}

describe('pistes', () => {
  it('place les clips à la suite et route l\'audio sur sa piste', () => {
    const p = sample();
    expect(p.video.map(c => c.mediaId)).toEqual(['a', 'b']);
    expect(p.audio.map(c => c.mediaId)).toEqual(['m']);
    expect(trackStarts(p.video)).toEqual([0, 6]);
    expect(projectDuration(p)).toBe(20);
  });
  it('n\'importe pas deux fois le même fichier', () => {
    expect(addMedia(sample(), [media('a', 6)]).media).toHaveLength(3);
  });
  it('trouve le clip sous un instant', () => {
    const p = sample();
    expect(clipAt(p.video, 0)!.index).toBe(0);
    expect(clipAt(p.video, 6)!.index).toBe(1);
    expect(clipAt(p.video, 7.5)!.local).toBeCloseTo(1.5);
    expect(clipAt(p.video, 10)!.index).toBe(1);
    expect(clipAt(p.video, 11)).toBeNull();
    expect(clipAt([], 0)).toBeNull();
  });
});

describe('scinder', () => {
  it('coupe en deux sans changer la durée totale', () => {
    const p = splitAt(sample(), 'video', 2);
    expect(p.video.map(c => [c.in, c.dur])).toEqual([[0, 2], [2, 4], [0, 4]]);
    expect(projectDuration(p)).toBe(20);
    expect(new Set(p.video.map(c => c.id)).size).toBe(3);
  });
  it('ne fait rien sur un bord', () => {
    const p = sample();
    expect(splitAt(p, 'video', 6)).toBe(p);
    expect(splitAt(p, 'video', 0.01)).toBe(p);
  });
  it('donne des identifiants d\'effet distincts aux deux moitiés et garde la transition à droite', () => {
    let p = sample();
    p = addFx(p, p.video[0].id, 'isf:Bloom', { intensity: 1 });
    p = setTransition(p, p.video[0].id, { effectId: 'glt:Fade', params: {}, dur: 1 });
    p = splitAt(p, 'video', 3);
    expect(p.video[0].fx[0].uid).not.toBe(p.video[1].fx[0].uid);
    expect(p.video[0].transition).toBeNull();
    expect(p.video[1].transition?.effectId).toBe('glt:Fade');
  });
});

describe('supprimer, déplacer, rogner', () => {
  it('referme le trou et retire la transition devenue orpheline', () => {
    let p = sample();
    p = setTransition(p, p.video[0].id, { effectId: 'glt:Fade', params: {}, dur: 1 });
    p = removeClip(p, p.video[1].id);
    expect(p.video).toHaveLength(1);
    expect(p.video[0].transition).toBeNull();
  });
  it('réordonne', () => {
    const p0 = sample();
    const p = moveClip(p0, p0.video[0].id, 2);
    expect(p.video.map(c => c.mediaId)).toEqual(['b', 'a']);
  });
  it('borne le rognage par le média', () => {
    let p = sample();
    const id = p.video[0].id;
    p = trimClip(p, id, 'start', 2);
    expect([p.video[0].in, p.video[0].dur]).toEqual([2, 4]);
    p = trimClip(p, id, 'start', -10);
    expect([p.video[0].in, p.video[0].dur]).toEqual([0, 6]);
    p = trimClip(p, id, 'end', 99);
    expect(p.video[0].dur).toBe(6);
    p = trimClip(p, id, 'end', -99);
    expect(p.video[0].dur).toBeCloseTo(0.1);
  });
  it('raccourcit la transition quand un clip devient plus court qu\'elle', () => {
    let p = sample();
    p = setTransition(p, p.video[0].id, { effectId: 'glt:Fade', params: {}, dur: 2 });
    p = trimClip(p, p.video[1].id, 'end', -3.5);
    expect(p.video[0].transition!.dur).toBeCloseTo(0.5);
  });
  it('refuse une transition sur le dernier clip', () => {
    const p = sample();
    expect(setTransition(p, p.video[1].id, { effectId: 'glt:Fade', params: {}, dur: 1 })).toBe(p);
  });
});
