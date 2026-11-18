import { beforeEach, describe, expect, it } from 'vitest';
import { addMedia, addText, addTrack, appendClip, clipsOf, moveToTrack, moveTrack, patchClip, removeMedia, removeTrack, setTrack } from '../core/ops';
import { defaultText, emptyProject, type Media } from '../core/types';
import { useStore } from './store';

const media = (id: string): Media => ({ id, path: `C:/v/${id}`, url: `ezmedia://local/${id}`, name: id, kind: 'video', duration: 6, width: 1920, height: 1080, hasAudio: true });
const st = () => useStore.getState();

describe('piste verrouillée', () => {
  beforeEach(() => {
    let p = addMedia(emptyProject(), [media('a'), media('b')]);
    p = appendClip(p, 'a')!.project; p = appendClip(p, 'b')!.project;
    st().load(p, null);
  });
  it('refuse toute modification de ses clips, d\'où qu\'elle vienne', () => {
    const id = st().project.video[0].id;
    st().apply(p => setTrack(p, 'video', { locked: true }));
    const locked = st().project;
    st().apply(p => patchClip(p, id, c => { c.volume = 0.2; }));
    st().apply(p => removeMedia(p, 'a'));
    expect(st().project).toBe(locked);
    st().apply(p => ({ ...p, name: 'Autre nom' })); // ce qui ne touche pas la piste passe
    expect(st().project.name).toBe('Autre nom');
    st().apply(p => setTrack(p, 'video', { locked: false }));
    st().apply(p => patchClip(p, id, c => { c.volume = 0.2; }));
    expect(st().project.video[0].volume).toBe(0.2);
  });
  it('vaut aussi pour une piste ajoutée : ni modifiée, ni supprimée, ni destination d\'un clip', () => {
    st().apply(p => addTrack(p, 'text')!.project);
    st().apply(p => addText(p, defaultText(), 0, undefined, 'text-2').project);
    st().apply(p => addText(p, defaultText(), 0).project);
    const other = st().project.text[0].id;
    st().apply(p => setTrack(p, 'text-2', { locked: true }));
    const locked = st().project;
    st().apply(p => removeTrack(p, 'text-2'));
    st().apply(p => moveToTrack(p, other, 'text-2'));
    expect(st().project).toBe(locked);
    st().apply(p => moveTrack(p, 'text-2', 1)); // changer de rang ne touche pas à ses clips
    expect(st().project.order.slice(0, 2)).toEqual(['text', 'text-2']);
    st().apply(p => setTrack(p, 'text-2', { locked: false }));
    st().apply(p => moveToTrack(p, other, 'text-2'));
    expect(clipsOf(st().project, 'text-2')).toHaveLength(2);
    st().apply(p => removeTrack(p, 'text-2'));
    expect(st().project.order).not.toContain('text-2');
  });
  it('ne laisse pas sélectionner un de ses clips, ni en garder un après une annulation', () => {
    const id = st().project.video[0].id;
    st().select({ kind: 'clip', id });
    expect(st().sel).not.toBeNull();
    st().apply(p => setTrack(p, 'video', { locked: true }));
    st().select({ kind: 'clip', id });
    expect(st().sel).toBeNull();
    st().apply(p => setTrack(p, 'video', { locked: false }));
    st().select({ kind: 'clip', id });
    st().undo(); // retour à l'état verrouillé
    expect(st().project.tracks.video?.locked).toBe(true);
    expect(st().sel).toBeNull();
  });
});
