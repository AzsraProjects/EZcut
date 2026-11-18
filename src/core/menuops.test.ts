import { describe, expect, it } from 'vitest';
import { addFx, addMedia, addOverlay, appendClip, duplicateClip, freezeAt, insertCopy, projectDuration, removeMedia, setTransition, trimClip } from './ops';
import { parseProject } from './project';
import { emptyProject, type Media, type Project } from './types';

const media = (id: string, duration: number, kind: Media['kind'] = 'video'): Media =>
  ({ id, path: `C:/v/${id}`, url: `ezmedia://local/${id}`, name: id, kind, duration, width: 1920, height: 1080, hasAudio: kind !== 'image' });

function base(): Project {
  let p = addMedia(emptyProject(), [media('a', 6), media('b', 4), media('logo', 0, 'image')]);
  p = appendClip(p, 'a')!.project;
  p = appendClip(p, 'b')!.project;
  p = addFx(p, p.video[0].id, 'isf:Bloom', { intensity: 1 });
  return setTransition(p, p.video[0].id, { effectId: 'glt:Fade', params: {}, dur: 1 });
}

describe('copier, coller, dupliquer', () => {
  it('duplique un clip juste après lui, avec de nouveaux identifiants et sans transition', () => {
    const p0 = base(), r = duplicateClip(p0, p0.video[0].id)!;
    const [a, copy, b] = r.project.video;
    expect([a.mediaId, copy.mediaId, b.mediaId]).toEqual(['a', 'a', 'b']);
    expect(copy.id).not.toBe(a.id);
    expect(copy.fx[0].uid).not.toBe(a.fx[0].uid);
    expect(copy.fx[0].params).toEqual(a.fx[0].params);
    expect(copy.transition).toBeNull();
    expect(a.transition?.effectId).toBe('glt:Fade');
  });
  it('colle sur une piste libre sans chevaucher ce qui s\'y trouve', () => {
    let p = addOverlay(base(), 'logo', 1)!.project; // 1 → 6
    const r = insertCopy(p, 'overlay', p.overlay[0], { start: 3 });
    p = r.project;
    expect(p.overlay.map(c => c.start)).toEqual([1, 6]);
  });
  it('retire un média avec tous ses clips, sur toutes les pistes', () => {
    let p = addOverlay(base(), 'a', 0)!.project;
    p = removeMedia(p, 'a');
    expect(p.media.map(m => m.id)).toEqual(['b', 'logo']);
    expect(p.video.map(c => c.mediaId)).toEqual(['b']);
    expect(p.overlay).toHaveLength(0);
    expect(removeMedia(p, 'inconnu')).toBe(p);
  });
});

describe('arrêt sur image', () => {
  it('fige l\'image sous la tête de lecture et pousse la suite', () => {
    const p0 = base(), r = freezeAt(p0, 2)!;
    const v = r.project.video;
    expect(v.map(c => [c.still, c.in, c.dur])).toEqual([[false, 0, 2], [true, 2, 2], [false, 2, 4], [false, 0, 4]]);
    expect(projectDuration(r.project)).toBe(projectDuration(p0) + 2);
    expect(v[1].fx).toHaveLength(1);             // l'image figée garde le look du clip
    expect(v[2].transition?.effectId).toBe('glt:Fade'); // la transition reste sur la coupe d'origine
    expect(v[0].transition).toBeNull();
  });
  it('se place avant ou après le clip quand la tête est sur un bord', () => {
    const p0 = base();
    expect(freezeAt(p0, 0.01)!.project.video[0].still).toBe(true);
    const end = freezeAt(p0, 9.99)!.project.video;
    expect(end[end.length - 1].still).toBe(true);
  });
  it('n\'a pas de durée maximale, et survit à un enregistrement', () => {
    const r = freezeAt(base(), 2)!;
    const longer = trimClip(r.project, r.clipId, 'end', 60);
    expect(longer.video[1].dur).toBe(62);
    const back = parseProject(JSON.stringify(longer))!;
    expect(back.video[1].still).toBe(true);
    expect(back.video[1].in).toBe(2);
  });
  it('ne fait rien hors de la piste principale', () => {
    expect(freezeAt(emptyProject(), 1)).toBeNull();
  });
});
