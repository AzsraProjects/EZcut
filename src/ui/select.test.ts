// Sélection de plusieurs clips (store) et volume au-delà de 100 % (lecture du projet, plan audio de l'export).
import { beforeEach, describe, expect, it } from 'vitest';
import { addMedia, addText, appendClip, moveGroup, removeClip, setTrack } from '../core/ops';
import { parseProject } from '../core/project';
import { defaultText, emptyProject, posToVolume, volumeToPos, type Media } from '../core/types';
import { audioPlan } from '../export/exporter';
import { useStore } from './store';

const media = (id: string): Media => ({ id, path: `C:/v/${id}`, url: `ezmedia://local/${id}`, name: id, kind: 'video', duration: 6, width: 1920, height: 1080, hasAudio: true });
const st = () => useStore.getState();

describe('sélection de plusieurs clips', () => {
  beforeEach(() => {
    let p = addMedia(emptyProject(), [media('a'), media('b')]);
    p = appendClip(p, 'a')!.project; p = appendClip(p, 'b')!.project;
    p = addText(p, defaultText(), 0).project; p = addText(p, defaultText(), 8).project;
    st().load(p, null);
  });
  const ids = () => [...st().project.video.map(c => c.id), ...st().project.text.map(c => c.id)];

  it('pick garde le clip principal demandé, sinon le dernier ; select remet le groupe à un seul clip', () => {
    const [v0, v1, t0] = ids();
    st().pick([v0, v1, t0], v1);
    expect(st().picked).toEqual([v0, v1, t0]);
    expect(st().sel).toEqual({ kind: 'clip', id: v1 });
    st().pick([v0, t0]);
    expect(st().sel).toEqual({ kind: 'clip', id: t0 });
    st().select({ kind: 'clip', id: v0 });
    expect(st().picked).toEqual([v0]);
  });
  it('un clip retiré ou verrouillé quitte le groupe, et l\'annulation le rend', () => {
    const [v0, v1, t0, t1] = ids();
    st().pick([v0, v1, t0, t1], t0);
    st().apply(p => removeClip(p, v1));
    expect(st().picked).toEqual([v0, t0, t1]);
    st().apply(p => setTrack(p, 'text', { locked: true }));
    expect(st().picked).toEqual([v0]);
    expect(st().sel).toEqual({ kind: 'clip', id: v0 });
    st().undo(); st().undo();
    expect(st().project.video).toHaveLength(2);
  });
  it('moveGroup ne fait rien si le groupe ne compte que des clips de la piste principale', () => {
    const p = st().project;
    expect(moveGroup(p, p.video.map(c => c.id), 3)).toBe(p);
  });
});

describe('volume au-delà de 100 %', () => {
  it("la lecture du projet garde le volume d'un clip et d'une piste, et le borne à 400 %", () => {
    let p = addMedia(emptyProject(), [media('a')]);
    p = appendClip(p, 'a')!.project;
    const raw = JSON.parse(JSON.stringify(p));
    raw.video[0].volume = 1.8; raw.tracks = { video: { volume: 1.5 }, audio: { volume: 9 } };
    const q = parseProject(JSON.stringify(raw))!;
    expect(q.video[0].volume).toBe(1.8);
    expect(q.tracks.video.volume).toBe(1.5);
    expect(q.tracks.audio.volume).toBe(4);
    raw.video[0].volume = 7;
    expect(parseProject(JSON.stringify(raw))!.video[0].volume).toBe(4);
  });
  it('à l\'export, le volume d\'un segment est celui du clip multiplié par celui de sa piste', () => {
    let p = addMedia(emptyProject(), [media('a')]);
    p = appendClip(p, 'a')!.project;
    p = { ...p, video: [{ ...p.video[0], volume: 1.5 }] };
    expect(audioPlan(setTrack(p, 'video', { volume: 2 }))[0][0].volume).toBe(3);
    expect(audioPlan(p)[0][0].volume).toBe(1.5);
  });
  it('échelle de la ligne de volume : 100 % au milieu, 400 % en haut, aller-retour exact', () => {
    expect(volumeToPos(0)).toBe(0); expect(volumeToPos(1)).toBe(0.5); expect(volumeToPos(4)).toBe(1);
    expect(volumeToPos(2)).toBeCloseTo(0.75, 6); // +6 dB : à mi-chemin entre 100 % et 400 % (+12 dB)
    for (const v of [0, 0.3, 1, 1.7, 2, 3.2, 4]) expect(posToVolume(volumeToPos(v))).toBeCloseTo(v, 6);
  });
});
