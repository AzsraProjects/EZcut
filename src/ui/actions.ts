/** Actions de l'interface : relient les gestes de l'utilisateur aux opérations de core. */
import { addFx, appendClip, clipAt, findClip, removeClip, setTransition, splitAt, trackStarts } from '../core/ops';
import { emptyProject, type Project } from '../core/types';
import { parseProject } from '../core/project';
import { ez } from '../desktop/api';
import { catalog, defaultsOf, transitionDefaults, type CatItem } from '../effects/catalog';
import { player } from '../engine/player';
import { relinkMedia } from './media';
import { useStore } from './store';

const S = () => useStore.getState();

/** Clip vidéo visé par une action : le clip sélectionné, sinon celui sous la tête de lecture. */
export function targetVideoClip(): { id: string; index: number } | null {
  const { project: p, sel } = S();
  if (sel?.kind === 'clip') { const i = p.video.findIndex(c => c.id === sel.id); if (i >= 0) return { id: sel.id, index: i }; }
  const hit = clipAt(p.video, player.t);
  return hit ? { id: hit.clip.id, index: hit.index } : null;
}

export function addToTimeline(mediaId: string) {
  const r = appendClip(S().project, mediaId);
  if (!r) return;
  S().apply(() => r.project);
  selectClip(r.clipId);
}

export function selectClip(id: string) {
  const st = S(), f = findClip(st.project, id);
  if (!f) return;
  st.select({ kind: 'clip', id });
  const start = trackStarts(st.project[f.track])[f.index];
  if (player.t < start || player.t >= start + f.clip.dur) player.seek(start + 0.001);
}

export function applyItem(item: CatItem, clipId?: string) {
  const st = S(), p = st.project;
  if (item.kind !== 'transition') {
    const target = clipId ? { id: clipId } : targetVideoClip();
    if (!target) { st.notify('Ajoutez d\'abord une vidéo à la timeline.'); return; }
    st.apply(pr => addFx(pr, target.id, item.id, defaultsOf(item)));
    st.select({ kind: 'clip', id: target.id });
    return;
  }
  if (p.video.length < 2) { st.notify('Une transition se pose entre deux clips : ajoutez-en au moins deux.'); return; }
  const t = clipId ? { id: clipId, index: p.video.findIndex(c => c.id === clipId) } : targetVideoClip();
  let i = t ? t.index : 0;
  if (i >= p.video.length - 1) i = p.video.length - 2;
  const a = p.video[i], b = p.video[i + 1];
  st.apply(pr => setTransition(pr, a.id, { effectId: item.id, params: transitionDefaults(item), dur: Math.min(1, a.dur, b.dur) }));
  st.select({ kind: 'transition', id: a.id });
  const cut = trackStarts(p.video)[i] + a.dur;
  player.seek(Math.max(0, cut - 1.5)); player.play();
}

export function splitAtPlayhead() {
  const st = S(), sel = st.sel;
  const track = sel?.kind === 'clip' ? findClip(st.project, sel.id)?.track ?? 'video' : 'video';
  const before = st.project;
  st.apply(p => splitAt(p, track, player.t));
  if (S().project === before) st.notify('Placez la tête de lecture à l\'intérieur d\'un clip pour le scinder.');
}

export function deleteSelection() {
  const st = S(), sel = st.sel;
  if (!sel) return;
  if (sel.kind === 'transition') st.apply(p => setTransition(p, sel.id, null));
  else st.apply(p => removeClip(p, sel.id));
  st.select(null);
}

/* ---------- projet ---------- */
function serialise(p: Project): string {
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

export async function openProject() {
  const st = S();
  if (!ez) { st.notify('L\'ouverture n\'est disponible que dans l\'application de bureau.'); return; }
  const r = await ez.openProject();
  if (!r) return;
  const p = parseProject(r.json);
  if (!p) { st.notify('Ce fichier n\'est pas un projet EZcut lisible.'); return; }
  // Les effets inconnus de cette version sont conservés mais ignorés au rendu.
  player.pause(); player.seek(0);
  st.load(p, r.path);
  const missing = await relinkMedia();
  if (missing) S().notify(`${missing} média(s) introuvable(s) : ils ont été déplacés ou supprimés.`);
}

export function newProject() {
  void ez?.newProject();
  player.pause(); player.seek(0);
  S().load(emptyProject(), null);
}

export const catalogList = (tab: string) => tab === 'effects' ? catalog.effects : tab === 'filters' ? catalog.filters : catalog.transitions;
