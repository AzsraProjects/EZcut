/** Menus du clic droit et actions du presse-papiers. Chaque entrée appelle une opération de montage déjà annulable. */
import { addSound, clipAt, detachAudio, duplicateClip, findClip, isSound, freezeAt, insertCopy, isFree, patchClip, removeClip, removeMedia, setTransition, spanWhole, startsOf, trimClip } from '../core/ops';
import type { Clip, FxInstance, Params, TrackId } from '../core/types';
import { ez } from '../desktop/api';
import { catalog } from '../effects/catalog';
import { player } from '../engine/player';
import { addToTimeline, applyItem, deleteSelection, selectClip, splitAtPlayhead } from './actions';
import type { MenuEntry } from './ContextMenu';
import { useStore } from './store';

const S = () => useStore.getState();
const selectedClip = () => { const st = S(); return st.sel?.kind === 'clip' ? findClip(st.project, st.sel.id) : null; };

/* ---------- presse-papiers (interne à l'application) ---------- */
let clipboard: { clip: Clip; track: TrackId } | null = null;
let fxClipboard: { fx: FxInstance[]; color: Params } | null = null;

export function copyClip(cut = false) {
  const f = selectedClip();
  if (!f) return;
  clipboard = { clip: structuredClone(f.clip), track: f.track };
  if (cut) { S().apply(p => removeClip(p, f.clip.id)); S().select(null); }
  S().notify(cut ? 'Clip coupé.' : 'Clip copié.');
}
/** Colle le clip copié : après le clip sélectionné (ou en fin) sur une piste magnétique, à la tête de lecture sur une piste libre. */
export function pasteClip(at?: number) {
  if (!clipboard) { S().notify('Rien à coller : copiez d\'abord un clip.'); return; }
  const st = S(), p = st.project, { clip, track } = clipboard;
  if (clip.mediaId && !p.media.some(m => m.id === clip.mediaId)) { st.notify('Le média de ce clip n\'est plus dans la bibliothèque.'); return; }
  const sel = selectedClip();
  const index = sel && sel.track === track ? sel.index + 1 : (at !== undefined ? p[track].filter((c, i) => startsOf(p, track)[i] + c.dur / 2 < at).length : p[track].length);
  const r = insertCopy(p, track, clip, { index, start: at ?? player.t });
  st.apply(() => r.project); selectClip(r.clipId);
}
export function duplicateSelection() {
  const f = selectedClip(); if (!f) return;
  const r = duplicateClip(S().project, f.clip.id);
  if (r) { S().apply(() => r.project); selectClip(r.clipId); }
}

/* ---------- actions sur le clip sélectionné ---------- */
/** Rogne un bord jusqu'à la tête de lecture. */
export function trimToPlayhead(edge: 'start' | 'end') {
  const f = selectedClip() ?? (() => { const h = clipAt(S().project.video, player.t); return h ? findClip(S().project, h.clip.id) : null; })();
  if (!f) return;
  const t = player.t, end = f.start + f.clip.dur;
  if (t <= f.start + 0.02 || t >= end - 0.02) { S().notify('Placez la tête de lecture à l\'intérieur du clip.'); return; }
  S().apply(p => trimClip(p, f.clip.id, edge, edge === 'start' ? t - f.start : t - end));
  if (edge === 'start' && !isFree(f.track)) player.seek(f.start); // la suite a reculé : la tête reste sur la même image
}
const volumes = new Map<string, number>();
export function toggleMute(id: string) {
  const f = findClip(S().project, id); if (!f) return;
  if (f.clip.volume > 0) { volumes.set(id, f.clip.volume); S().apply(p => patchClip(p, id, c => { c.volume = 0; })); }
  else S().apply(p => patchClip(p, id, c => { c.volume = volumes.get(id) ?? 1; }));
}
export function rotateClip(id: string, deg: number) {
  S().apply(p => patchClip(p, id, c => { c.transform.rot = ((c.transform.rot + deg + 180) % 360 + 360) % 360 - 180; }));
}
/** Détache le son d'un clip vidéo vers la piste Son, où il se règle, se coupe et se déplace à part. */
export function detachSound(id?: string) {
  const target = id ?? selectedClip()?.clip.id;
  if (!target) return;
  const r = detachAudio(S().project, target);
  if (!r) { S().notify('Impossible de détacher : ce clip n\'a pas de son, ou la piste Son est déjà occupée à cet endroit.'); return; }
  S().apply(() => r.project); S().select({ kind: 'clip', id: r.clipId });
  S().notify('Son détaché sur la piste Son. Il ne suit plus le clip vidéo : déplacez-les ensemble si besoin.', true);
}
export function freezeFrame() {
  const r = freezeAt(S().project, player.t);
  if (!r) { S().notify('Placez la tête de lecture sur une vidéo de la piste principale.'); return; }
  S().apply(() => r.project); selectClip(r.clipId);
  S().notify('Arrêt sur image de 2 secondes ajouté : tirez son bord pour changer sa durée.', true);
}

function clipMenu(id: string): MenuEntry[] {
  const st = S(), f = findClip(st.project, id);
  if (!f) return [];
  const c = f.clip, media = st.project.media.find(m => m.id === c.mediaId), track = f.track;
  const visual = track === 'video' || track === 'overlay', hasSound = isSound(track) || (!!media?.hasAudio && media.kind !== 'image' && !c.still);
  const inside = player.t > f.start + 0.02 && player.t < f.start + c.dur - 0.02;
  const fit = (ids: string) => { const it = catalog.byId.get(ids); if (it) applyItem(it, id); };
  return [
    { label: 'Couper', shortcut: 'Ctrl+X', action: () => copyClip(true) },
    { label: 'Copier', shortcut: 'Ctrl+C', action: () => copyClip() },
    { label: 'Coller après', shortcut: 'Ctrl+V', disabled: !clipboard, action: () => pasteClip() },
    { label: 'Dupliquer', shortcut: 'Ctrl+D', action: duplicateSelection },
    { label: 'Supprimer', shortcut: 'Suppr', danger: true, action: deleteSelection },
    null,
    { label: 'Couper en deux à la tête de lecture', shortcut: 'S', disabled: !inside, action: splitAtPlayhead },
    { label: 'Rogner le début jusqu\'à la tête de lecture', shortcut: 'Q', disabled: !inside, action: () => trimToPlayhead('start') },
    { label: 'Rogner la fin jusqu\'à la tête de lecture', shortcut: 'W', disabled: !inside, action: () => trimToPlayhead('end') },
    track === 'video' && !c.text ? { label: 'Arrêt sur image ici', shortcut: 'Alt+F', disabled: media?.kind !== 'video', action: freezeFrame } : null,
    isFree(track) && media?.kind !== 'video' ? { label: 'Étendre à toute la vidéo', action: () => { const b = S().project; S().apply(p => spanWhole(p, id)); if (S().project === b) S().notify('Impossible : la piste principale est vide, ou un autre clip occupe déjà cette piste.'); } } : null,
    null,
    hasSound ? { label: c.volume > 0 ? 'Couper le son du clip' : 'Rétablir le son du clip', shortcut: 'Ctrl+Maj+M', action: () => toggleMute(id) } : null,
    visual && hasSound ? { label: 'Détacher le son sur la piste Son', shortcut: 'Ctrl+Alt+D', disabled: c.volume <= 0, action: () => detachSound(id) } : null,
    hasSound ? { label: 'Fondu du son au début et à la fin', action: () => S().apply(p => patchClip(p, id, x => { const d = Math.min(1, x.dur / 4); x.fadeIn = d; x.fadeOut = d; })) } : null,
    null,
    visual && !c.text ? { label: 'Pivoter de 90° vers la droite', action: () => rotateClip(id, -90) } : null,
    visual && !c.text ? { label: 'Pivoter de 90° vers la gauche', action: () => rotateClip(id, 90) } : null,
    visual && !c.text ? { label: 'Retourner horizontalement', disabled: !catalog.byId.has('isf:Flip H'), action: () => fit('isf:Flip H') } : null,
    visual && !c.text ? { label: 'Retourner verticalement', disabled: !catalog.byId.has('isf:Flip V'), action: () => fit('isf:Flip V') } : null,
    !isSound(track) ? { label: 'Fondu de l\'image au début et à la fin', action: () => S().apply(p => patchClip(p, id, x => { const d = Math.min(0.5, x.dur / 4); x.vfadeIn = d; x.vfadeOut = d; })) } : null,
    !isSound(track) ? { label: 'Réinitialiser le cadrage', disabled: c.transform.scale === 1 && !c.transform.x && !c.transform.y && !c.transform.rot, action: () => S().apply(p => patchClip(p, id, x => { x.transform = { scale: 1, x: 0, y: 0, rot: 0 }; })) } : null,
    null,
    visual && !c.text ? { label: 'Copier les effets et la couleur', disabled: !c.fx.length && !Object.keys(c.color).length, action: () => { fxClipboard = { fx: structuredClone(c.fx), color: structuredClone(c.color) }; S().notify('Effets copiés.'); } } : null,
    visual && !c.text ? { label: 'Coller les effets et la couleur', disabled: !fxClipboard, action: () => { const b = fxClipboard; if (b) S().apply(p => patchClip(p, id, x => { x.fx.push(...b.fx.map(e => ({ ...structuredClone(e), uid: 'fx-' + Math.random().toString(36).slice(2, 10) }))); Object.assign(x.color, b.color); })); } } : null,
    visual && !c.text ? { label: 'Retirer tous les effets', disabled: !c.fx.length && !Object.keys(c.color).length, action: () => S().apply(p => patchClip(p, id, x => { x.fx = []; x.color = {}; })) } : null,
    null,
    track === 'video' && f.index < st.project.video.length - 1 ? (c.transition
      ? { label: 'Retirer la transition vers le clip suivant', action: () => S().apply(p => setTransition(p, id, null)) }
      : { label: 'Ajouter une transition vers le clip suivant…', action: () => { S().select({ kind: 'clip', id }); S().setTab('transitions'); } }) : null,
    media && ez ? { label: 'Afficher le fichier dans l\'explorateur', action: () => void ez!.revealMedia(media.path) } : null,
  ];
}
/** Menu d'un clip de la timeline. Le clip est d'abord sélectionné : les entrées agissent sur lui. */
export function menuForClip(id: string): MenuEntry[] { S().select({ kind: 'clip', id }); return clipMenu(id); }

/** Menu d'une zone vide d'une piste, à l'instant time. */
export function menuForLane(track: TrackId, time: number): MenuEntry[] {
  return [
    { label: 'Coller ici', shortcut: 'Ctrl+V', disabled: !clipboard || clipboard.track !== track, action: () => { S().select(null); pasteClip(time); } },
    { label: 'Placer la tête de lecture ici', action: () => { player.pause(); player.seek(time); } },
    track === 'video' ? { label: 'Arrêt sur image à la tête de lecture', shortcut: 'Alt+F', action: freezeFrame } : null,
    track === 'text' ? { label: 'Ajouter un titre…', action: () => S().setTab('titles') } : null,
    track !== 'text' ? { label: 'Importer des médias…', action: () => S().setTab('media') } : null,
  ];
}

export function menuForTransition(clipId: string): MenuEntry[] {
  return [
    { label: 'Régler la transition', action: () => S().select({ kind: 'transition', id: clipId }) },
    { label: 'Remplacer par une autre…', action: () => { S().select({ kind: 'transition', id: clipId }); S().setTab('transitions'); } },
    { label: 'Retirer la transition', danger: true, action: () => { S().apply(p => setTransition(p, clipId, null)); S().select(null); } },
  ];
}

/** Menu d'un média de la bibliothèque. */
export function menuForMedia(mediaId: string): MenuEntry[] {
  const st = S(), m = st.project.media.find(x => x.id === mediaId);
  if (!m) return [];
  const used = [...st.project.video, ...st.project.audio, ...st.project.sound, ...st.project.overlay].filter(c => c.mediaId === mediaId).length;
  return [
    { label: m.kind === 'audio' ? 'Ajouter à la suite sur la piste Musique' : 'Ajouter à la suite sur la piste Vidéo', action: () => addToTimeline(mediaId) },
    m.kind === 'audio' ? { label: 'Poser sur la piste Son, à la tête de lecture', action: () => { const r = addSound(S().project, mediaId, 'sound', player.t); if (r) { S().apply(() => r.project); selectClip(r.clipId); } } } : null,
    m.kind !== 'audio' ? { label: 'Poser par-dessus la vidéo, à la tête de lecture', shortcut: 'Maj+clic', action: () => addToTimeline(mediaId, true) } : null,
    null,
    ez ? { label: 'Afficher le fichier dans l\'explorateur', action: () => void ez!.revealMedia(m.path) } : null,
    { label: used ? `Retirer de la bibliothèque (et ses ${used} clip${used > 1 ? 's' : ''})` : 'Retirer de la bibliothèque', danger: true, action: () => { S().apply(p => removeMedia(p, mediaId)); S().select(null); S().notify(`« ${m.name} » retiré du projet. Le fichier n'est pas supprimé du disque.`, true); } },
  ];
}
