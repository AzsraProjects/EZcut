/** Actions de l'interface : relient les gestes de l'utilisateur aux opérations de core. */
import { addFx, addMarker, addOverlay, addText, appendClip, clipAt, findClip, isFree, projectDuration, removeClip, rippleRemove, setTrack, setTransition, splitAll, splitAt, startsOf, TRACKS, trackStarts } from '../core/ops';
import { parseProject } from '../core/project';
import { emptyProject, type Project, type TextStyle, type TrackId, type TrackState, type Transform } from '../core/types';
import { ez } from '../desktop/api';
import { catalog, defaultsOf, transitionDefaults, type CatItem } from '../effects/catalog';
import { player } from '../engine/player';
import { renderFrame } from './frame';
import { relinkMedia } from './media';
import { useStore } from './store';
import { timecode } from './time';

const S = () => useStore.getState();

/** Vrai si la piste est verrouillée ; prévient alors l'utilisateur, sauf si quiet. */
export function isLocked(track: TrackId, quiet = false): boolean {
  if (!S().project.tracks[track]?.locked) return false;
  if (!quiet) S().notify('Cette piste est verrouillée : cliquez sur son cadenas pour la modifier.');
  return true;
}

/** Clip qui reçoit un effet : le clip vidéo ou l'incrustation sélectionné, sinon le clip principal sous la tête de lecture. */
export function targetFxClip(): string | null {
  const { project: p, sel } = S();
  if (sel?.kind === 'clip') { const f = findClip(p, sel.id); if (f && (f.track === 'video' || f.track === 'overlay')) return sel.id; }
  return clipAt(p.video, player.t)?.clip.id ?? null;
}

/** Ajoute un média au montage : à la suite sur sa piste, ou en incrustation à la tête de lecture. */
export function addToTimeline(mediaId: string, overlay = false) {
  const st = S(), media = st.project.media.find(m => m.id === mediaId);
  if (!media) return;
  if (overlay && media.kind === 'audio') { st.notify('Un son ne peut pas être posé en incrustation : il va sur la piste audio.'); overlay = false; }
  if (isLocked(overlay ? 'overlay' : media.kind === 'audio' ? 'audio' : 'video')) return;
  const r = overlay ? addOverlay(st.project, mediaId, player.t) : appendClip(st.project, mediaId);
  if (!r) return;
  st.apply(() => r.project);
  selectClip(r.clipId);
}

export function addTitle(style: TextStyle, transform?: Partial<Transform>) {
  if (isLocked('text')) return;
  const st = S(), r = addText(st.project, style, player.t, transform);
  st.apply(() => r.project);
  // La tête de lecture se place là où le titre est lisible, pas pendant son animation d'entrée.
  const f = findClip(r.project, r.clipId);
  st.select({ kind: 'clip', id: r.clipId });
  if (f) player.seek(f.start + Math.min(f.clip.dur / 2, 1));
}

/** Sélectionne un clip. Avec at (clic dans la timeline), la tête de lecture se place à cet instant ; sinon elle rejoint le clip si elle en était sortie. */
export function selectClip(id: string, at?: number) {
  const st = S(), f = findClip(st.project, id);
  if (!f) return;
  st.select({ kind: 'clip', id });
  if (at !== undefined) { player.pause(); player.seek(at); }
  else if (player.t < f.start || player.t >= f.start + f.clip.dur) player.seek(f.start + 0.001);
}

export function applyItem(item: CatItem, clipId?: string) {
  const st = S(), p = st.project;
  if (item.kind !== 'transition') {
    const target = clipId ?? targetFxClip();
    if (!target) { st.notify('Ajoutez d\'abord une vidéo à la timeline.'); return; }
    if (findClip(p, target)?.clip.text) { st.notify('Les effets s\'appliquent aux vidéos et aux images, pas aux titres.'); return; }
    const f = findClip(p, target), name = f ? p.media.find(m => m.id === f.clip.mediaId)?.name ?? 'le clip' : 'le clip';
    st.apply(pr => addFx(pr, target, item.id, defaultsOf(item)));
    st.select({ kind: 'clip', id: target });
    st.notify(`${item.kind === 'filter' ? 'Filtre' : 'Effet'} « ${item.label} » ajouté à « ${name} ».`, true);
    return;
  }
  if (p.video.length < 2) { st.notify('Une transition se pose entre deux clips de la piste principale : ajoutez-en au moins deux.'); return; }
  const sel = st.sel?.kind === 'clip' || st.sel?.kind === 'transition' ? st.sel.id : null;
  let i = p.video.findIndex(c => c.id === (clipId ?? sel));
  if (i < 0) i = clipAt(p.video, player.t)?.index ?? 0;
  if (i >= p.video.length - 1) i = p.video.length - 2;
  const a = p.video[i], b = p.video[i + 1];
  const replaced = !!a.transition;
  st.apply(pr => setTransition(pr, a.id, { effectId: item.id, params: transitionDefaults(item), dur: Math.min(1, a.dur, b.dur) }));
  st.notify(`Transition « ${item.label} » ${replaced ? 'remplace la précédente' : 'posée sur la coupe'}.`, true);
  st.select({ kind: 'transition', id: a.id });
  const cut = trackStarts(p.video)[i] + a.dur;
  player.seek(Math.max(0, cut - 1.5)); player.play();
}

/** Coupe à la tête de lecture : le clip sélectionné s'il est dessous, sinon tous les clips traversés, sur toutes les pistes non verrouillées. */
export function splitAtPlayhead() {
  const st = S(), sel = st.sel, before = st.project, t = player.t;
  const f = sel?.kind === 'clip' ? findClip(before, sel.id) : null;
  // Le clip sélectionné est sous la tête : lui seul est concerné, même s'il est trop près d'un bord pour être coupé.
  if (f && t > f.start && t < f.start + f.clip.dur) {
    if (isLocked(f.track)) return;
    st.apply(p => splitAt(p, f.track, t));
    if (S().project === before) st.notify('Trop près du bord du clip pour couper ici.');
    return;
  }
  st.apply(p => splitAll(p, t));
  if (S().project === before) st.notify('Placez la tête de lecture à l\'intérieur d\'un clip pour le couper en deux.');
}
/** Outil lame : coupe un clip à l'instant cliqué. */
export function splitClipAt(id: string, t: number) {
  const st = S(), before = st.project, f = findClip(before, id);
  if (!f || isLocked(f.track)) return;
  st.apply(p => splitAt(p, f.track, t));
  if (S().project === before) st.notify('Trop près du bord du clip pour couper ici.');
}

/** Supprime la sélection. Avec ripple, sur une piste libre, les clips suivants avancent pour refermer le vide. */
export function deleteSelection(ripple = false) {
  const st = S(), sel = st.sel;
  if (!sel) return;
  if (sel.kind === 'transition') st.apply(p => setTransition(p, sel.id, null));
  else {
    const f = findClip(st.project, sel.id);
    if (!f || isLocked(f.track)) return;
    st.apply(p => (ripple && isFree(f.track) ? rippleRemove(p, sel.id) : removeClip(p, sel.id)));
  }
  st.select(null);
}

/* ---------- repères, navigation, pistes ---------- */
export function addMarkerAtPlayhead() {
  const st = S(), t = player.t;
  if (st.project.markers.some(m => Math.abs(m.t - t) < 0.5 / st.project.fps)) { st.notify('Il y a déjà un repère ici. Double-cliquez dessus pour le nommer.'); return; }
  st.apply(p => addMarker(p, t).project);
  st.notify('Repère posé. Double-clic pour le nommer, clic droit pour le supprimer.', true);
}
/** Bords de tous les clips, toutes pistes confondues, triés. */
function cutPoints(p: Project): number[] {
  const pts = new Set<number>([0, projectDuration(p)]);
  for (const tr of TRACKS) { const s = startsOf(p, tr); p[tr].forEach((c, i) => { pts.add(s[i]); pts.add(s[i] + c.dur); }); }
  return [...pts].sort((a, b) => a - b);
}
const jumpTo = (pts: number[], dir: -1 | 1) => {
  const t = player.t, to = dir < 0 ? [...pts].reverse().find(x => x < t - 0.02) : pts.find(x => x > t + 0.02);
  if (to !== undefined) { player.pause(); player.seek(to); }
  return to !== undefined;
};
/** Place la tête de lecture sur la coupe précédente ou suivante. */
export function jumpCut(dir: -1 | 1) { jumpTo(cutPoints(S().project), dir); }
/** Place la tête de lecture sur le repère précédent ou suivant. */
export function jumpMarker(dir: -1 | 1) {
  const m = S().project.markers;
  if (!m.length) { S().notify('Aucun repère : appuyez sur M pour en poser un à la tête de lecture.'); return; }
  jumpTo(m.map(x => x.t), dir);
}
/** Début ou fin du clip sélectionné, ou à défaut du clip principal sous la tête de lecture. */
export function jumpClipEdge(edge: 'start' | 'end') {
  const st = S(), sel = st.sel;
  const f = (sel ? findClip(st.project, sel.id) : null) ?? (() => { const h = clipAt(st.project.video, player.t); return h ? findClip(st.project, h.clip.id) : null; })();
  if (!f) return;
  player.pause(); player.seek(edge === 'start' ? f.start : f.start + f.clip.dur - 1 / st.project.fps);
}
export function zoomTimeline(factor: number) { S().set({ pps: Math.max(4, Math.min(240, S().pps * factor)) }); }
/** Bascule un état de piste. Verrouiller une piste désélectionne le clip qui s'y trouve. */
export function toggleTrack(track: TrackId, key: keyof TrackState) {
  const st = S(), on = !st.project.tracks[track]?.[key];
  st.apply(p => setTrack(p, track, { [key]: on }));
  if (key === 'locked' && on && st.sel && findClip(st.project, st.sel.id)?.track === track) st.select(null);
}

let capturing = false;
/** Enregistre en PNG l'image affichée dans l'aperçu, à la résolution du projet. */
export async function snapshot() {
  const st = S(), p = st.project, total = projectDuration(p);
  if (capturing || player.exporting || st.exportOpen) return; // une capture à la fois, jamais pendant un export
  if (!total) { st.notify('Le projet est vide : rien à capturer.'); return; }
  if (!ez) { st.notify('La capture d\'image n\'est disponible que dans l\'application de bureau.'); return; }
  const t = Math.min(player.t, total - 1e-3);
  capturing = true;
  try {
    const canvas = await renderFrame(p, t, p.width, p.height);
    const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/png'));
    if (!blob) throw new Error('image vide');
    if (await ez.saveSnapshot(new Uint8Array(await blob.arrayBuffer()), `${p.name} ${timecode(t, p.fps).replace(/:/g, '-')}`)) S().notify('Image enregistrée.');
  } catch { S().notify('La capture de l\'image a échoué.'); } finally { capturing = false; }
}

/* ---------- projet ---------- */
export function serialise(p: Project): string {
  // Les URL de lecture ne sont valables que pour cette session : seul le chemin est conservé.
  return JSON.stringify({ ...p, media: p.media.map(m => ({ ...m, url: '' })) }, null, 1);
}

export async function saveProject(saveAs = false): Promise<boolean> {
  const st = S();
  if (!ez) { st.notify('L\'enregistrement n\'est disponible que dans l\'application de bureau.'); return false; }
  const path = await ez.saveProject(serialise(st.project), saveAs);
  if (!path) return false;
  st.saved(path); st.notify('Projet enregistré.');
  return true;
}

/** Charge un projet lu depuis un fichier ou une sauvegarde automatique, puis redonne accès à ses médias. */
export async function loadProject(json: string, path: string | null, dirty = false): Promise<boolean> {
  const st = S(), p = parseProject(json);
  if (!p) { st.notify('Ce fichier n\'est pas un projet EZcut lisible.'); return false; }
  // Les effets inconnus de cette version sont conservés mais ignorés au rendu.
  if (path) await ez?.projectOpened();
  player.pause(); player.seek(0);
  st.load(p, path);
  const missing = await relinkMedia();
  if (dirty) useStore.setState({ dirty: true });
  if (missing) S().notify(`${missing} média(s) introuvable(s) : ils ont été déplacés, supprimés ou refusés.`);
  return true;
}

/** Vrai si le projet en cours peut être remplacé : il est enregistré, ou l'utilisateur vient de trancher. */
export async function canReplaceProject(): Promise<boolean> {
  if (!S().dirty) return true;
  if (!ez) return window.confirm('Abandonner les modifications du projet en cours ?');
  const r = await ez.confirmDiscard();
  return r === 'discard' || (r === 'save' && await saveProject());
}

export async function openProject() {
  if (!ez) { S().notify('L\'ouverture n\'est disponible que dans l\'application de bureau.'); return; }
  if (!await canReplaceProject()) return;
  const r = await ez.openProject();
  if (r) await loadProject(r.json, r.path);
}

export async function newProject() {
  if (!await canReplaceProject()) return;
  void ez?.newProject();
  player.pause(); player.seek(0);
  S().load(emptyProject(), null);
}

export const catalogList = (tab: string) => tab === 'effects' ? catalog.effects : tab === 'filters' ? catalog.filters : catalog.transitions;
