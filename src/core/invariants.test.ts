import { describe, expect, it } from 'vitest';
import { addMedia, appendClip, moveClip, removeClip, setTransition, splitAt, trimClip } from './ops';
import { emptyProject, type Media, type Project } from './types';

const media = (id: string, duration: number): Media =>
  ({ id, path: `C:/v/${id}.mp4`, url: `ezmedia://local/${id}`, name: `${id}.mp4`, kind: 'video', duration, width: 1920, height: 1080, hasAudio: true });

function three(): Project {
  let p = addMedia(emptyProject(), [media('a', 6), media('b', 4), media('c', 5)]);
  for (const id of ['a', 'b', 'c']) p = appendClip(p, id)!.project;
  p = setTransition(p, p.video[0].id, { effectId: 'glt:Fade', params: {}, dur: 2 });
  p = setTransition(p, p.video[1].id, { effectId: 'glt:Fade', params: {}, dur: 2 });
  return p;
}

/** Une transition ne dépasse jamais le plus court des deux clips qu'elle relie, et le dernier clip n'en a pas. */
function check(p: Project) {
  p.video.forEach((c, i) => {
    const next = p.video[i + 1];
    if (!next) expect(c.transition).toBeNull();
    else if (c.transition) expect(c.transition.dur).toBeLessThanOrEqual(Math.min(c.dur, next.dur) + 1e-9);
  });
}

describe('invariants des transitions', () => {
  it('scinder juste après une coupe raccourcit la transition qui y mène', () => {
    const p = splitAt(three(), 'video', 6.5); // B devient 0,5 s + 3,5 s
    expect(p.video[0].transition!.dur).toBeCloseTo(0.5);
    check(p);
  });
  it('scinder juste avant une coupe garde la transition sur la partie droite, bornée', () => {
    const p = splitAt(three(), 'video', 5.5); // A devient 5,5 s + 0,5 s
    expect(p.video[0].transition).toBeNull();
    expect(p.video[1].transition!.dur).toBeCloseTo(0.5);
    check(p);
  });
  it('supprimer ou déplacer un clip ne laisse pas de transition trop longue', () => {
    let p = splitAt(three(), 'video', 10.2); // C devient 0,2 s + 4,8 s
    check(p);
    p = moveClip(p, p.video[2].id, 1); // le clip de 0,2 s passe après A
    check(p);
    p = removeClip(p, p.video[2].id);
    check(p);
    p = moveClip(p, p.video[0].id, p.video.length); // A en dernier : plus de transition sortante
    check(p);
  });
  it('tient sur un clip de durée minimale', () => {
    let p = three();
    p = trimClip(p, p.video[1].id, 'end', -99); // B à 0,1 s
    expect(p.video[0].transition!.dur).toBeCloseTo(0.1);
    check(p);
  });
  it('ne crée rien quand un clip est déplacé à sa propre place', () => {
    const p = three();
    expect(moveClip(p, p.video[1].id, 1)).toBe(p);
    expect(moveClip(p, p.video[1].id, 2)).toBe(p);
  });
});
