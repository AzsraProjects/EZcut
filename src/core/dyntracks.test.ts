import { describe, expect, it } from 'vitest';
import { addMedia, addOverlay, addSound, addText, addTrack, appendClip, clipsOf, detachAudio, findClip, fixOrder, insertCopy, kindOf, lockedChange, moveToTrack, moveTrack, projectDuration, removeMedia, removeTrack, setTrack, splitAll, trackIds } from './ops';
import { parseProject } from './project';
import { audioPlan } from '../export/exporter';
import { defaultText, emptyProject, MAX_EXTRA_TRACKS, type Media, type Project } from './types';

const media = (id: string, duration: number, kind: Media['kind'] = 'video'): Media =>
  ({ id, path: `C:/v/${id}`, url: `ezmedia://local/${id}`, name: id, kind, duration, width: 1920, height: 1080, hasAudio: kind !== 'image' });

function base(): Project {
  let p = addMedia(emptyProject(), [media('a', 6), media('b', 4), media('song', 30, 'audio'), media('logo', 0, 'image'), media('pip', 8)]);
  for (const id of ['a', 'b']) p = appendClip(p, id)!.project;
  return p;
}
const add = (p: Project, kind: Parameters<typeof addTrack>[1]) => addTrack(p, kind)!;

describe('ajouter et supprimer des pistes', () => {
  it('un projet neuf a ses cinq pistes de base, dans l\'ordre', () => {
    const p = emptyProject();
    expect(trackIds(p)).toEqual(['text', 'overlay', 'video', 'sound', 'audio']);
    expect(p.version).toBe(3);
    expect(kindOf('overlay-2')).toBe('overlay'); expect(kindOf('video')).toBe('video');
  });
  it('place une piste d\'image au-dessus de celles de son genre, une piste de son en dessous', () => {
    let r = add(base(), 'overlay');
    expect(r.id).toBe('overlay-2');
    expect(r.project.order).toEqual(['text', 'overlay-2', 'overlay', 'video', 'sound', 'audio']);
    r = add(r.project, 'text');
    expect(r.project.order).toEqual(['text-2', 'text', 'overlay-2', 'overlay', 'video', 'sound', 'audio']);
    r = add(r.project, 'sound');
    r = add(r.project, 'audio');
    expect(r.project.order).toEqual(['text-2', 'text', 'overlay-2', 'overlay', 'video', 'sound', 'sound-2', 'audio', 'audio-2']);
    r = add(r.project, 'overlay');
    expect(r.id).toBe('overlay-3');
    expect(r.project.order.slice(0, 5)).toEqual(['text-2', 'text', 'overlay-3', 'overlay-2', 'overlay']);
    expect(r.project.extra['overlay-3']).toEqual([]);
  });
  it('refuse une seconde piste principale et borne le nombre de pistes ajoutées', () => {
    let p = base();
    expect(addTrack(p, 'video')).toBeNull();
    expect(addTrack(p, 'autre' as never)).toBeNull();
    for (let i = 0; i < MAX_EXTRA_TRACKS; i++) p = add(p, i % 2 ? 'text' : 'sound').project;
    expect(Object.keys(p.extra)).toHaveLength(MAX_EXTRA_TRACKS);
    expect(addTrack(p, 'overlay')).toBeNull();
  });
  it('supprime une piste ajoutée avec ses clips et son état, jamais une piste de base', () => {
    let p = add(base(), 'overlay').project;
    p = addOverlay(p, 'logo', 1, 'overlay-2')!.project;
    p = setTrack(p, 'overlay-2', { hidden: true });
    const n = removeTrack(p, 'overlay-2');
    expect(n.order).toEqual(['text', 'overlay', 'video', 'sound', 'audio']);
    expect(n.extra).toEqual({}); expect(n.tracks).toEqual({});
    expect(removeTrack(p, 'overlay')).toBe(p);
    expect(removeTrack(p, 'video')).toBe(p);
    expect(removeTrack(p, 'overlay-9')).toBe(p);
    // le numéro libéré est repris
    expect(add(n, 'overlay').id).toBe('overlay-2');
  });
});

describe('déplacer une piste', () => {
  it('réordonne à l\'intérieur de son groupe, titres et incrustations mêlés', () => {
    const p = add(add(base(), 'overlay').project, 'sound').project; // text, overlay-2, overlay, video, sound, sound-2, audio
    expect(moveTrack(p, 'text', 1).order.slice(0, 3)).toEqual(['overlay-2', 'text', 'overlay']);
    expect(moveTrack(p, 'text', 5).order.slice(0, 4)).toEqual(['overlay-2', 'overlay', 'text', 'video']);
    expect(moveTrack(p, 'overlay', -2).order.slice(0, 3)).toEqual(['overlay', 'text', 'overlay-2']);
    expect(moveTrack(p, 'audio', -2).order.slice(3)).toEqual(['video', 'audio', 'sound', 'sound-2']);
    expect(moveTrack(p, 'sound-2', 1).order.slice(4)).toEqual(['sound', 'audio', 'sound-2']);
  });
  it('ne franchit jamais la piste principale et ne bouge pas aux limites', () => {
    const p = add(base(), 'overlay').project;
    expect(moveTrack(p, 'text', -1)).toBe(p);
    expect(moveTrack(p, 'audio', 1)).toBe(p);
    expect(moveTrack(p, 'video', 1)).toBe(p);
    expect(moveTrack(p, 'inconnue', 1)).toBe(p);
    expect(moveTrack(p, 'overlay', 0)).toBe(p);
    expect(moveTrack(p, 'overlay', NaN)).toBe(p);
    for (const d of [-9, 9]) for (const t of p.order) {
      const o = moveTrack(p, t, d).order, v = o.indexOf('video');
      expect(o.slice(0, v).every(x => ['text', 'overlay'].includes(kindOf(x)))).toBe(true);
      expect(o.slice(v + 1).every(x => ['sound', 'audio'].includes(kindOf(x)))).toBe(true);
      expect([...o].sort()).toEqual([...p.order].sort());
    }
  });
});

describe('clips sur les pistes ajoutées', () => {
  it('les opérations d\'ajout visent la piste donnée et refusent un genre qui ne convient pas', () => {
    let p = base();
    for (const k of ['overlay', 'text', 'sound', 'audio'] as const) p = add(p, k).project;
    const o = addOverlay(p, 'logo', 2, 'overlay-2')!; p = o.project;
    const t = addText(p, defaultText(), 1, undefined, 'text-2'); p = t.project;
    const s = addSound(p, 'song', 'sound-2', 0)!; p = s.project;
    const m = addSound(p, 'song', 'audio-2', 4)!; p = m.project;
    expect(findClip(p, o.clipId)).toMatchObject({ track: 'overlay-2', start: 2 });
    expect(findClip(p, t.clipId)).toMatchObject({ track: 'text-2', start: 1 });
    expect(findClip(p, s.clipId)!.track).toBe('sound-2');
    expect(findClip(p, m.clipId)).toMatchObject({ track: 'audio-2', start: 4 });
    expect(p.overlay).toHaveLength(0); expect(p.text).toHaveLength(0);
    expect(projectDuration(p)).toBe(34);
    expect(addOverlay(p, 'logo', 0, 'text-2')).toBeNull();
    expect(addOverlay(p, 'logo', 0, 'overlay-7')).toBeNull();
    expect(addSound(p, 'song', 'overlay-2', 0)).toBeNull();
    expect(addSound(p, 'song', 'sound-5', 0)).toBeNull();
    expect(findClip(addText(p, defaultText(), 0, undefined, 'sound-2').project, 'x')).toBeNull(); // piste invalide : le titre va sur Titres
    expect(addText(p, defaultText(), 0, undefined, 'sound-2').project.text).toHaveLength(1);
    const c = insertCopy(p, 'overlay-2', findClip(p, o.clipId)!.clip, { start: 2 });
    expect(clipsOf(c.project, 'overlay-2').map(x => x.start)).toEqual([2, 7]);
  });
  it('détache le son vers la piste de son visée', () => {
    const p = add(base(), 'sound').project;
    const busy = addSound(p, 'song', 'sound', 0)!.project;
    expect(detachAudio(busy, busy.video[0].id)).toBeNull();
    const r = detachAudio(busy, busy.video[0].id, 'sound-2')!;
    expect(findClip(r.project, r.clipId)).toMatchObject({ track: 'sound-2', start: 0 });
    expect(r.project.video[0].volume).toBe(0);
    expect(detachAudio(busy, busy.video[0].id, 'overlay')).toBeNull();
  });
  it('un clip change de piste vers une piste libre du même genre, sans chevauchement', () => {
    let p = add(base(), 'overlay').project;
    const a = addOverlay(p, 'logo', 1)!; p = a.project;                 // overlay : 1 → 6
    const b = addOverlay(p, 'logo', 3, 'overlay-2')!; p = b.project;    // overlay-2 : 3 → 8
    const n = moveToTrack(p, a.clipId, 'overlay-2');
    expect(n.overlay).toHaveLength(0);
    expect(clipsOf(n, 'overlay-2').map(c => [c.id, c.start])).toEqual([[b.clipId, 3], [a.clipId, 8]]); // place prise : repoussé après
    expect(moveToTrack(p, a.clipId, 'overlay')).toBe(p);    // déjà dessus
    expect(moveToTrack(p, a.clipId, 'text')).toBe(p);       // autre genre
    expect(moveToTrack(p, a.clipId, 'overlay-5')).toBe(p);  // piste inconnue
    expect(moveToTrack(p, p.video[0].id, 'overlay')).toBe(p); // piste magnétique
    expect(moveToTrack(p, 'inconnu', 'overlay-2')).toBe(p);
  });
  it('couper partout, retirer un média et la durée tiennent compte des pistes ajoutées', () => {
    let p = add(base(), 'overlay').project;
    p = addOverlay(p, 'pip', 0, 'overlay-2')!.project; // 0 → 8
    const cut = splitAll(p, 3);
    expect(clipsOf(cut, 'overlay-2').map(c => c.dur)).toEqual([3, 5]);
    expect(splitAll(setTrack(p, 'overlay-2', { locked: true }), 3).extra['overlay-2']).toHaveLength(1);
    expect(removeMedia(p, 'pip').extra['overlay-2']).toEqual([]);
  });
  it('une piste verrouillée ne change pas et ne se supprime pas', () => {
    let p = add(base(), 'text').project;
    p = addText(p, defaultText(), 0, undefined, 'text-2').project;
    const locked = setTrack(p, 'text-2', { locked: true });
    expect(lockedChange(locked, removeTrack(locked, 'text-2'))).toBe('text-2');
    expect(lockedChange(locked, splitAll(locked, 2))).toBeNull(); // splitAll épargne la piste verrouillée
    expect(lockedChange(locked, moveTrack(locked, 'text-2', 1))).toBeNull(); // changer de rang ne touche pas aux clips
    expect(lockedChange(locked, addText(locked, defaultText(), 9, undefined, 'text-2').project)).toBe('text-2');
    expect(lockedChange(p, removeTrack(p, 'text-2'))).toBeNull();
  });
});

describe('export du son', () => {
  it('une liste de segments par piste sonore ou d\'incrustation qui a du son', () => {
    let p = add(add(base(), 'sound').project, 'overlay').project;
    p = addSound(p, 'song', 'audio', 0)!.project;
    p = addSound(p, 'song', 'sound-2', 5)!.project;
    p = addOverlay(p, 'pip', 1, 'overlay-2')!.project;
    p = addOverlay(p, 'logo', 0)!.project; // image : pas de son, piste omise
    const plan = audioPlan(p);
    expect(plan).toHaveLength(4); // principale, overlay-2, sound-2, audio — dans l'ordre de la timeline
    expect(plan[1].map(s => [s.path, s.dur])).toEqual([[null, 1], ['C:/v/pip', 8]]);
    expect(plan[2].map(s => [s.path, s.dur])).toEqual([[null, 5], ['C:/v/song', 30]]);
    expect(audioPlan(setTrack(p, 'sound-2', { muted: true }))).toHaveLength(3);
    expect(audioPlan(setTrack(p, 'overlay-2', { hidden: true }))).toHaveLength(3);
    expect(audioPlan(setTrack(p, 'overlay', { muted: true }))).toHaveLength(4); // l'autre piste d'incrustation garde son son
  });
});

describe('fichier de projet à pistes dynamiques', () => {
  const v2 = () => { const { extra: _e, order: _o, ...rest } = JSON.parse(JSON.stringify(addText(addOverlay(base(), 'logo', 1)!.project, defaultText(), 2).project)); return { ...rest, version: 2 }; };
  it('un projet de version 2 s\'ouvre en version 3, avec l\'ordre par défaut et aucune piste ajoutée', () => {
    const p = parseProject(JSON.stringify(v2()))!;
    expect(p.version).toBe(3);
    expect(p.order).toEqual(['text', 'overlay', 'video', 'sound', 'audio']);
    expect(p.extra).toEqual({});
    expect(p.video).toHaveLength(2); expect(p.overlay).toHaveLength(1); expect(p.text).toHaveLength(1);
  });
  it('un projet de version 3 garde ses pistes, leur ordre, leur état et leurs clips', () => {
    let p = base();
    for (const k of ['overlay', 'text', 'sound', 'audio'] as const) p = add(p, k).project;
    p = addOverlay(p, 'logo', 2, 'overlay-2')!.project;
    p = addText(p, defaultText(), 1, undefined, 'text-2').project;
    p = addSound(p, 'song', 'sound-2', 0)!.project;
    p = moveTrack(p, 'text', 3);
    p = setTrack(p, 'overlay-2', { hidden: true, muted: true });
    const back = parseProject(JSON.stringify(p))!;
    expect(back.order).toEqual(p.order);
    expect(back.tracks).toEqual({ 'overlay-2': { muted: true, hidden: true } });
    expect(Object.keys(back.extra).sort()).toEqual(['audio-2', 'overlay-2', 'sound-2', 'text-2']);
    expect(back.extra['overlay-2'][0]).toMatchObject({ mediaId: 'logo', start: 2 });
    expect(back.extra['text-2'][0].text?.content).toBe(defaultText().content);
    expect(back.extra['sound-2'][0].mediaId).toBe('song');
    expect(JSON.stringify(parseProject(JSON.stringify(back)))).toBe(JSON.stringify(back)); // stable d'un enregistrement à l'autre
  });
  it('écarte les pistes ajoutées mal nommées ou trop nombreuses, et les clips qui n\'y ont pas leur place', () => {
    const raw = JSON.parse(JSON.stringify(base()));
    const ov = { id: 'o1', mediaId: 'logo', start: 0, dur: 4 }, ov2 = { id: 'o2', mediaId: 'logo', start: 2, dur: 4 };
    raw.extra = {
      'overlay-2': [ov, ov2, { id: 'o3', mediaId: 'song', start: 20, dur: 4 }, { ...ov, start: 30 }, 'x', null], // chevauchement, son sur l'image, doublon
      'video-2': [ov], 'overlay-1': [], 'overlay-100': [], 'overlay': [ov], '__proto__x': [], 'text-2 ': [], 'Overlay-3': [], 'sound-2': 'pas une liste',
      'text-2': [{ id: 't1', start: 0, dur: 2, text: { content: 'ok' } }, { id: 't2', mediaId: 'logo', start: 5, dur: 2 }],
      'audio-2': [{ id: 's1', mediaId: 'song', start: 0, dur: 5, fx: [{ uid: 'f', effectId: 'isf:Bloom', params: {} }], still: true }, { id: 's2', mediaId: 'logo', start: 9, dur: 2 }],
    };
    for (let i = 3; i < 30; i++) raw.extra['sound-' + i] = [];
    const p = parseProject(JSON.stringify(raw))!;
    expect(Object.keys(p.extra)).toHaveLength(MAX_EXTRA_TRACKS);
    expect(Object.keys(p.extra).slice(0, 4)).toEqual(['overlay-2', 'sound-2', 'text-2', 'audio-2']);
    expect(p.extra['overlay-2'].map(c => [c.id, c.start])).toEqual([['o1', 0], ['o2', 4]]);
    expect(p.extra['sound-2']).toEqual([]);
    expect(p.extra['text-2'].map(c => c.id)).toEqual(['t1']);
    expect(p.extra['audio-2'].map(c => c.id)).toEqual(['s1']);
    expect(p.extra['audio-2'][0]).toMatchObject({ fx: [], still: false });
    expect(p.overlay).toEqual([]);
    expect([...p.order].sort()).toEqual([...Object.keys(p.extra), 'text', 'overlay', 'video', 'sound', 'audio'].sort());
  });
  it('reconstruit un ordre valide quand il est absent, incomplet ou incohérent', () => {
    const raw = JSON.parse(JSON.stringify(add(add(base(), 'overlay').project, 'sound').project));
    const order = (o: unknown) => parseProject(JSON.stringify({ ...raw, order: o }))!.order;
    const def = ['text', 'overlay-2', 'overlay', 'video', 'sound', 'sound-2', 'audio'];
    expect(order(undefined)).toEqual(def);
    expect(order('n\'importe quoi')).toEqual(def);
    expect(order([3, null, {}, 'inconnue', '__proto__'])).toEqual(def);
    // son au-dessus, image en dessous, doublons : chaque piste revient dans son groupe, l'ordre relatif est gardé
    expect(order(['audio', 'overlay', 'video', 'text', 'text', 'sound-2', 'overlay-2', 'sound'])).toEqual(['overlay', 'text', 'overlay-2', 'video', 'audio', 'sound-2', 'sound']);
    // pistes manquantes : replacées près de leur genre
    expect(order(['overlay', 'video', 'audio'])).toEqual(['text', 'overlay-2', 'overlay', 'video', 'sound', 'sound-2', 'audio']);
    expect(fixOrder(['video'], [])).toEqual(['text', 'overlay', 'video', 'sound', 'audio']);
  });
  it('ne garde l\'état que des pistes qui existent', () => {
    const raw = JSON.parse(JSON.stringify(add(base(), 'text').project));
    raw.tracks = { 'text-2': { locked: true, hidden: 1 }, 'text-3': { locked: true }, constructor: { muted: true } };
    expect(parseProject(JSON.stringify(raw))!.tracks).toEqual({ 'text-2': { locked: true } });
  });
});
