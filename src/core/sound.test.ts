import { describe, expect, it } from 'vitest';
import { addMedia, addSound, appendClip, detachAudio, imageGain, patchClip, projectDuration, splitAt, trimClip } from './ops';
import { parseProject } from './project';
import { emptyProject, type Media, type Project } from './types';

const media = (id: string, duration: number, kind: Media['kind'] = 'video', hasAudio = kind !== 'image'): Media =>
  ({ id, path: `C:/v/${id}`, url: `ezmedia://local/${id}`, name: id, kind, duration, width: 1920, height: 1080, hasAudio });

function base(): Project {
  let p = addMedia(emptyProject(), [media('a', 6), media('b', 4), media('zik', 30, 'audio'), media('muet', 5, 'video', false)]);
  p = appendClip(p, 'a')!.project;
  return appendClip(p, 'b')!.project;
}

describe('détacher le son', () => {
  it('crée un clip sur la piste Son au même instant et rend la vidéo muette', () => {
    let p = base();
    p = trimClip(p, p.video[1].id, 'start', 1); // b : entrée à 1 s, dure 3 s
    p = patchClip(p, p.video[1].id, c => { c.volume = 0.8; c.fadeIn = 0.5; });
    const r = detachAudio(p, p.video[1].id)!;
    const s = r.project.sound[0], v = r.project.video[1];
    expect([s.mediaId, s.start, s.in, s.dur, s.volume, s.fadeIn]).toEqual(['b', 6, 1, 3, 0.8, 0.5]);
    expect([v.volume, v.fadeIn]).toEqual([0, 0]);
  });
  it('refuse un clip sans son, déjà muet, ou une place déjà prise', () => {
    let p = base();
    p = appendClip(p, 'muet')!.project;
    expect(detachAudio(p, p.video[2].id)).toBeNull();
    const once = detachAudio(p, p.video[0].id)!.project;
    expect(detachAudio(once, once.video[0].id)).toBeNull();               // déjà muet
    const busy = addSound(p, 'zik', 'sound', 0)!.project;                 // la piste Son est occupée de 0 à 30 s
    expect(detachAudio(busy, busy.video[0].id)).toBeNull();
  });
  it('le son détaché se coupe et se rogne comme un clip', () => {
    let p = base();
    p = detachAudio(p, p.video[0].id)!.project;
    p = splitAt(p, 'sound', 2);
    expect(p.sound.map(c => [c.start, c.in, c.dur])).toEqual([[0, 0, 2], [2, 2, 4]]);
    p = trimClip(p, p.sound[1].id, 'end', 99); // ne dépasse pas la durée du fichier
    expect(p.sound[1].dur).toBe(4);
  });
});

describe('pistes de son', () => {
  it('place la musique à la suite, ou à l\'instant demandé', () => {
    let p = appendClip(base(), 'zik')!.project;
    expect(p.audio[0].start).toBe(0);
    p = addSound(p, 'zik', 'audio', 10)!.project; // 10 s est occupé : repoussé après la première
    expect(p.audio.map(c => c.start)).toEqual([0, 30]);
    expect(projectDuration(p)).toBe(60);
    expect(addSound(p, 'a', 'sound', 0)).toBeNull(); // une vidéo n'est pas un fichier audio
  });
  it('reprend un projet de version 1, dont la musique n\'avait pas de position', () => {
    const v1 = { version: 1, name: 'x', width: 1920, height: 1080, fps: 30, media: [media('zik', 30, 'audio')], video: [],
      audio: [{ id: 'c1', mediaId: 'zik', in: 0, dur: 10 }, { id: 'c2', mediaId: 'zik', in: 10, dur: 5 }] };
    const p = parseProject(JSON.stringify(v1))!;
    expect(p.audio.map(c => c.start)).toEqual([0, 10]);
    expect(p.sound).toEqual([]);
  });
  it('garde le son détaché d\'une vidéo à la relecture, mais pas une image sur une piste de son', () => {
    const b0 = base(), p = detachAudio(b0, b0.video[0].id)!.project;
    const back = parseProject(JSON.stringify(p))!;
    expect(back.sound).toHaveLength(1);
    expect(back.sound[0].mediaId).toBe('a');
  });
});

describe('fondu de l\'image', () => {
  it('s\'ouvre et se ferme, sans que les deux fondus dépassent le clip', () => {
    let p = base();
    p = patchClip(p, p.video[0].id, c => { c.vfadeIn = 2; c.vfadeOut = 99; });
    const c = p.video[0];
    expect([c.vfadeIn, c.vfadeOut]).toEqual([2, 4]);
    expect(imageGain(c, 0)).toBe(0);
    expect(imageGain(c, 1)).toBe(0.5);
    expect(imageGain(c, 2)).toBe(1);
    expect(imageGain(c, 5)).toBe(0.25);
    p = splitAt(p, 'video', 3); // chaque moitié garde le fondu de son côté
    expect([p.video[0].vfadeIn, p.video[0].vfadeOut, p.video[1].vfadeIn, p.video[1].vfadeOut]).toEqual([2, 0, 0, 3]);
  });
});
