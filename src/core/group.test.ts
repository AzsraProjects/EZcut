// Opérations sur plusieurs clips sélectionnés ensemble.
import { describe, expect, it } from 'vitest';
import { addMedia, addOverlay, addText, appendClip, moveGroup, removeClips } from './ops';
import { defaultText, emptyProject, type Media, type Project } from './types';

const media = (id: string, duration: number, kind: Media['kind'] = 'video'): Media =>
  ({ id, path: `C:/v/${id}`, url: `ezmedia://local/${id}`, name: id, kind, duration, width: 1920, height: 1080, hasAudio: kind !== 'image' });

function base(): Project {
  let p = addMedia(emptyProject(), [media('a', 10), media('b', 4), media('logo', 0, 'image')]);
  p = appendClip(p, 'a')!.project;
  p = appendClip(p, 'b')!.project;
  p = addText(p, defaultText(), 0).project;   // titre 0 → 5
  p = addText(p, defaultText(), 8).project;   // titre 8 → 13
  p = addOverlay(p, 'logo', 1)!.project;      // incrustation 1 → 6
  return p;
}

describe('plusieurs clips à la fois', () => {
  it('déplace ensemble des clips de pistes différentes, sans toucher la piste principale', () => {
    const p = base(), ids = [p.text[1].id, p.overlay[0].id, p.video[0].id];
    const n = moveGroup(p, ids, 2);
    expect(n.text.map(c => c.start)).toEqual([0, 10]);
    expect(n.overlay[0].start).toBe(3);
    expect(n.video).toEqual(p.video);
  });
  it('ne passe pas avant 0 : l\'écart est borné par le clip le plus tôt', () => {
    const p = base(), n = moveGroup(p, [p.text[1].id, p.overlay[0].id], -5);
    expect(n.overlay[0].start).toBe(0);
    expect(n.text[1].start).toBe(7);
  });
  it('refuse un déplacement qui ferait chevaucher un clip resté en place', () => {
    const p = base();
    expect(moveGroup(p, [p.text[1].id], -4)).toBe(p); // 4 → 9 chevauche 0 → 5
  });
  it('supprime plusieurs clips, et referme les vides avec ripple', () => {
    let p = base();
    p = addText(p, defaultText(), 14).project; // titre 14 → 19
    const n = removeClips(p, [p.video[0].id, p.text[0].id, p.text[1].id]);
    expect(n.video.map(c => c.mediaId)).toEqual(['b']);
    expect(n.text.map(c => c.start)).toEqual([14]);
    const r = removeClips(p, [p.text[0].id, p.text[1].id], true);
    expect(r.text.map(c => c.start)).toEqual([4]); // 14 − 5 − 5
  });
});
