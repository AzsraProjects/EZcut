/** Actions de l'interface : relient les gestes de l'utilisateur aux opérations de core. */
import { addFx, addOverlay, addText, appendClip, clipAt, findClip, removeClip, setTransition, splitAt, trackStarts } from '../core/ops';
import { parseProject } from '../core/project';
import { emptyProject, type Project, type TextStyle, type TrackId, type Transform } from '../core/types';
import { ez } from '../desktop/api';
import { catalog, defaultsOf, transitionDefaults, type CatItem } from '../effects/catalog';
import { player } from '../engine/player';
import { relinkMedia } from './media';
import { useStore } from './store';

const S = () => useStore.getState();

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
  const r = overlay ? addOverlay(st.project, mediaId, player.t) : appendClip(st.project, mediaId);
  if (!r) return;
  st.apply(() => r.project);
  selectClip(r.clipId);
}

export function addTitle(style: TextStyle, transform?: Partial<Transform>) {
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

export function splitAtPlayhead() {
  const st = S(), sel = st.sel;
  // La piste du clip sélectionné d'abord ; si rien n'y passe sous la tête de lecture, les autres pistes, vidéo en premier.
  const first = sel?.kind === 'clip' ? findClip(st.project, sel.id)?.track : undefined;
  const order = [...new Set([first, 'video', 'overlay', 'text', 'audio'].filter((t): t is TrackId => !!t))];
  const before = st.project;
  for (const track of order) { st.apply(p => splitAt(p, track, player.t)); if (S().project !== before) return; }
  st.notify('Placez la tête de lecture à l\'intérieur d\'un clip pour le couper en deux.');
}

export function deleteSelection() {
  const st = S(), sel = st.sel;
  if (!sel) return;
  if (sel.kind === 'transition') st.apply(p => setTransition(p, sel.id, null));
  else st.apply(p => removeClip(p, sel.id));
  st.select(null);
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
