/** Outil Mouvement : relie les gestes de l'aperçu, de la timeline et de l'inspecteur aux points clés du clip. */
import { useEffect, useState } from 'react';
import { applyPreset, hasMotion, motionAt, moveKey, PRESET_LABELS, recordKeys, setKey, type MotionKey, type Preset, type Sample } from '../core/motion';
import { findClip, isSound, patchClip } from '../core/ops';
import type { Clip } from '../core/types';
import { player } from '../engine/player';
import { useStore } from './store';
import { subscribeTime } from './time';

const S = () => useStore.getState();

/** Clip sélectionné qui peut bouger (image, vidéo, titre), avec son début sur la timeline. */
export function motionTarget(): { clip: Clip; start: number } | null {
  const s = S(), f = s.sel?.kind === 'clip' ? findClip(s.project, s.sel.id) : null;
  return f && !isSound(f.track) ? { clip: f.clip, start: f.start } : null;
}
/** Instant local du clip sous la tête de lecture, borné au clip. */
export const localOf = (clip: Clip, start: number) => Math.max(0, Math.min(clip.dur, player.t - start));

/** Instant de la tête de lecture, mis à jour à chaque image (pour l'inspecteur et le trajet). */
export function usePlayhead(on = true): number {
  const [t, setT] = useState(player.t);
  useEffect(() => (on ? subscribeTime(setT) : undefined), [on]);
  return t;
}

const setKeys = (id: string, keys: MotionKey[] | undefined, record = true) =>
  S().apply(p => patchClip(p, id, c => { if (keys?.length) c.keys = keys; else delete c.keys; }), record);

/** Place la tête de lecture dans le clip s'il en était sorti, pour que le point se pose sur lui. */
function intoClip(clip: Clip, start: number) {
  if (player.t < start || player.t > start + clip.dur) { player.pause(); player.seek(start + Math.min(clip.dur / 2, 0.5)); }
}

/** Premier point : le mouvement démarre de la position actuelle du clip, à la tête de lecture. */
export function startMotion() {
  const tg = motionTarget(); if (!tg) return;
  intoClip(tg.clip, tg.start);
  const r = setKey(tg.clip, localOf(tg.clip, tg.start), {});
  setKeys(tg.clip.id, r.keys);
  S().set({ motionKey: r.index });
  S().notify('Mouvement activé : déplacez la tête de lecture puis l\'image dans l\'aperçu pour poser les points suivants.');
}

/** Pose ou modifie le point à la tête de lecture. record = false pendant un glissement (précédé d'un checkpoint). */
export function keyNow(id: string, patch: Partial<Omit<MotionKey, 't'>>, record = true): boolean {
  const s = S(), f = findClip(s.project, id); if (!f) return false;
  // Tête de lecture hors du clip : il n'est pas à l'image, on ne pose rien à l'aveugle.
  if (player.t < f.start - 1e-6 || player.t > f.start + f.clip.dur + 1e-6) { s.notify('Placez la tête de lecture sur le clip pour régler son mouvement à cet instant.'); return false; }
  const r = setKey(f.clip, localOf(f.clip, f.start), patch);
  if (r.index < 0) { s.notify('200 points au plus par clip.'); return false; }
  setKeys(id, r.keys, record);
  if (S().motionKey !== r.index) S().set({ motionKey: r.index });
  return true;
}

export function presetNow(preset: Preset) {
  const tg = motionTarget(); if (!tg) return;
  intoClip(tg.clip, tg.start);
  const at = localOf(tg.clip, tg.start), half = player.halfSize(tg.clip) ?? { w: 0.5, h: 0.5 };
  const scale = motionAt(tg.clip, at).transform.scale;
  setKeys(tg.clip.id, applyPreset(tg.clip, preset, at, { w: half.w * scale, h: half.h * scale }));
  S().set({ motionKey: null });
  S().notify(`Mouvement « ${PRESET_LABELS[preset]} » posé.`, true);
  // On revoit le mouvement depuis son début.
  const go = Math.min(1, tg.clip.dur / 2), from = preset.startsWith('out') ? tg.clip.dur - go - 0.5 : ['cross', 'zoom-in', 'zoom-out', 'float'].includes(preset) ? 0 : Math.min(at, tg.clip.dur - go) - 0.3;
  player.seek(tg.start + Math.max(0, from)); player.play();
}

export function deleteKey(id: string, index: number) {
  const f = findClip(S().project, id); if (!f?.clip.keys) return;
  const keys = f.clip.keys.filter((_, i) => i !== index);
  // Le dernier point retiré : l'image reste là où il la mettait.
  if (!keys.length) { const k = f.clip.keys[index]; S().apply(p => patchClip(p, id, c => { delete c.keys; c.transform = { ...c.transform, x: k.x, y: k.y, scale: k.scale, rot: k.rot }; c.opacity = k.opacity; })); }
  else setKeys(id, keys);
  S().set({ motionKey: null });
}

export function clearMotion(id: string) {
  const f = findClip(S().project, id); if (!f || !hasMotion(f.clip)) return;
  // L'image garde la position qu'elle avait à la tête de lecture.
  const k = setKey(f.clip, localOf(f.clip, f.start), {}).keys.find(x => Math.abs(x.t - localOf(f.clip, f.start)) < 0.13);
  S().apply(p => patchClip(p, id, c => { delete c.keys; if (k) { c.transform = { ...c.transform, x: k.x, y: k.y, scale: k.scale, rot: k.rot }; c.opacity = k.opacity; } }));
  S().set({ motionKey: null });
  S().notify('Mouvement retiré : l\'image reste à sa place.', true);
}

export function retimeKey(id: string, index: number, t: number) {
  const f = findClip(S().project, id); if (!f?.clip.keys) return index;
  const r = moveKey(f.clip.keys, index, t, f.clip.dur);
  setKeys(id, r.keys, false);
  return r.index;
}

/* ---------- mimer le mouvement ---------- */
let samples: Sample[] = [], before: MotionKey[] | undefined;
// Le mode Mimer (et son ralenti) s'arrête dès qu'on change de clip, de projet ou qu'on exporte ; le point choisi
// est oublié quand le nombre de points du clip change (annulation, commande du lien), pour ne jamais en désigner un autre.
useStore.subscribe((s, prev) => {
  if (s.motionRec && (s.sel?.id !== prev.sel?.id || s.exportOpen || s.project.media !== prev.project.media && s.filePath !== prev.filePath)) setMimic(false);
  if (!s.motionRec && player.rate !== 1) player.rate = 1;
  if (s.motionKey !== null && s.project !== prev.project && s.sel?.kind === 'clip') {
    const a = findClip(s.project, s.sel.id)?.clip.keys?.length ?? 0, b = findClip(prev.project, s.sel.id)?.clip.keys?.length ?? 0;
    if (a !== b || s.motionKey >= a) useStore.setState({ motionKey: null });
  }
});
/** Mode Mimer : lecture au ralenti ; l'aperçu enregistre la position de la souris tant que le bouton est enfoncé. */
export function setMimic(on: boolean) {
  S().set({ motionRec: on });
  player.rate = on ? 0.5 : 1;
  if (!on) { samples = []; return; }
  S().notify('Mimer : appuyez dans l\'aperçu et bougez la souris, l\'image suit votre main. Relâchez pour finir. Échap pour quitter.');
}
export function mimicStart(id: string) {
  samples = []; before = findClip(S().project, id)?.clip.keys;
  S().checkpoint(); if (!player.playing) player.play();
}
export function mimicSample(id: string, x: number, y: number) {
  const f = findClip(S().project, id); if (!f) return;
  const local = player.t - f.start;
  if (local < 0 || local > f.clip.dur) return;
  samples.push({ t: local, x, y });
  // Pendant le geste, l'image suit la main : les points d'avant hors du geste, plus un point provisoire sous la souris.
  // La simplification du geste n'a lieu qu'au relâchement.
  const t0 = samples[0].t, base = { ...motionAt(f.clip, local).transform, opacity: motionAt(f.clip, local).opacity };
  const kept = (before ?? []).filter(k => k.t < t0 - 0.05 || k.t > local + 0.05);
  const keys = [...kept, { t: local, x, y, scale: base.scale, rot: base.rot, opacity: base.opacity, ease: 'linear' as const }].sort((a, b) => a.t - b.t);
  S().apply(p => patchClip(p, id, c => { c.keys = keys; }), false);
}
export function mimicEnd(id: string) {
  const f = findClip(S().project, id);
  player.pause();
  if (f && samples.length > 1 && samples[samples.length - 1].t - samples[0].t > 0.05) {
    const n = recordKeys({ ...f.clip, keys: before }, samples);
    S().apply(p => patchClip(p, id, c => { c.keys = n; }), false);
    S().notify(`Geste enregistré : ${n.length} points. Ils se retouchent comme les autres.`, true);
  } else if (f) {
    // Simple clic sans geste : rien ne change.
    S().apply(p => patchClip(p, id, c => { if (before?.length) c.keys = before; else delete c.keys; }), false);
  }
  samples = []; before = undefined;
  setMimic(false);
}
