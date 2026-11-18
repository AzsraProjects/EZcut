import { create } from 'zustand';
import { findClip, TRACKS } from '../core/ops';
import { emptyProject, type Project } from '../core/types';
import type { MenuEntry } from './ContextMenu';

export type Tab = 'media' | 'titles' | 'effects' | 'filters' | 'transitions';
export type Tool = 'select' | 'razor';
export type Selection = { kind: 'clip'; id: string } | { kind: 'transition'; id: string } | null;

export interface Layout { libW: number; inspW: number; tlH: number; showLib: boolean; showInsp: boolean; showTl: boolean; swap: boolean; /** Hauteur choisie pour chaque piste, en pixels ; absente = hauteur par défaut. */ laneH: Record<string, number>; }
export const DEFAULT_LAYOUT: Layout = { libW: 460, inspW: 310, tlH: 300, showLib: true, showInsp: true, showTl: true, swap: false, laneH: {} };
function loadFavs(): string[] {
  try { const v: unknown = JSON.parse(localStorage.getItem('ezcut.favs') ?? '[]'); return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 500) : []; } catch { return []; }
}
function loadLayout(): Layout {
  try { return { ...DEFAULT_LAYOUT, ...JSON.parse(localStorage.getItem('ezcut.layout') ?? '{}') }; } catch { return DEFAULT_LAYOUT; }
}

interface State {
  /** Disposition des panneaux, mémorisée d'une session à l'autre. */
  layout: Layout;
  setLayout(patch: Partial<Layout>): void;
  project: Project;
  past: Project[];
  future: Project[];
  sel: Selection;
  tab: Tab;
  filePath: string | null;
  dirty: boolean;
  catalogReady: boolean;
  pps: number;
  toast: string | null;
  /** Le message en cours propose d'annuler l'action qu'il annonce. */
  toastUndo: boolean;
  light: boolean;
  playing: boolean;
  exportOpen: boolean;
  /** Incrémenté quand les vignettes de la banque doivent être recalculées. */
  thumbEpoch: number;
  /** Outil de la timeline : sélection, ou lame (un clic coupe le clip). */
  tool: Tool;
  /** Aimantation des clips aux coupes, aux repères et à la tête de lecture. */
  snap: boolean;
  /** Repère dont on règle le nom et la couleur, ou null. */
  markerEdit: string | null;
  /** Effets, filtres et transitions favoris (identifiants), mémorisés sur cet ordinateur. */
  favs: string[];
  toggleFav(id: string): void;
  /** Menu contextuel ouvert, ou null. */
  menu: { x: number; y: number; items: MenuEntry[] } | null;
  /** Vignettes des médias (data URL), hors projet et hors annulation. */
  thumbs: Record<string, { poster?: string; strip?: string }>;
  setThumb(mediaId: string, t: { poster?: string; strip?: string }): void;
  /** Applique une opération. record=false pour les réglages en cours de glissement (précédés de checkpoint). */
  apply(fn: (p: Project) => Project, record?: boolean): void;
  checkpoint(): void;
  /** Mise à jour technique (adresse de lecture, dimensions d'un média) : ni annulable, ni comptée comme une modification. */
  applySilent(fn: (p: Project) => Project): void;
  undo(): void;
  redo(): void;
  select(sel: Selection): void;
  setTab(tab: Tab): void;
  load(project: Project, path: string | null): void;
  saved(path: string): void;
  notify(msg: string, undoable?: boolean): void;
  set(patch: Partial<Pick<State, 'pps' | 'catalogReady' | 'light' | 'toast' | 'playing' | 'exportOpen' | 'thumbEpoch' | 'menu' | 'tool' | 'snap' | 'markerEdit'>>): void;
}

const LIMIT = 200;
/** Une sélection ne peut pas désigner un clip disparu, ni un clip d'une piste verrouillée. */
function validSel(p: Project, sel: Selection): Selection {
  const f = sel ? findClip(p, sel.id) : null;
  return f && !p.tracks[f.track]?.locked ? sel : null;
}
let toastTimer: ReturnType<typeof setTimeout> | undefined;

export const useStore = create<State>((set, get) => ({
  layout: loadLayout(),
  setLayout(patch) {
    const layout = { ...get().layout, ...patch };
    set({ layout });
    try { localStorage.setItem('ezcut.layout', JSON.stringify(layout)); } catch { /* stockage indisponible : la disposition vaut pour cette session */ }
  },
  project: emptyProject(), past: [], future: [], sel: null, tab: 'media', filePath: null, dirty: false,
  catalogReady: false, pps: 60, toast: null, toastUndo: false, light: false, playing: false, exportOpen: false, thumbEpoch: 0, menu: null, thumbs: {}, tool: 'select', snap: true, markerEdit: null, favs: loadFavs(),
  toggleFav(id) {
    const favs = get().favs.includes(id) ? get().favs.filter(x => x !== id) : [...get().favs, id];
    set({ favs });
    try { localStorage.setItem('ezcut.favs', JSON.stringify(favs)); } catch { /* stockage indisponible : les favoris valent pour cette session */ }
  },
  setThumb(mediaId, t) { set(s => ({ thumbs: { ...s.thumbs, [mediaId]: { ...s.thumbs[mediaId], ...t } } })); },
  apply(fn, record = true) {
    const { project, past } = get(), next = fn(project);
    if (next === project) return;
    // Piste verrouillée : aucune action, d'où qu'elle vienne, ne change ses clips tant qu'elle le reste.
    for (const t of TRACKS) if (project.tracks[t]?.locked && next.tracks[t]?.locked && JSON.stringify(project[t]) !== JSON.stringify(next[t])) { get().notify('Cette piste est verrouillée : cliquez sur son cadenas pour la modifier.'); return; }
    set(record ? { project: next, past: [...past, project].slice(-LIMIT), future: [], dirty: true } : { project: next, future: [], dirty: true });
  },
  applySilent(fn) { const next = fn(get().project); if (next !== get().project) set({ project: next }); },
  // « Rétablir » n'est effacé qu'au premier changement réel, pas au simple début d'un geste.
  checkpoint() { const { project, past } = get(); if (past[past.length - 1] !== project) set({ past: [...past, project].slice(-LIMIT) }); },
  undo() {
    const { project, future } = get();
    // Un point d'annulation posé au début d'un geste resté sans effet est ignoré.
    const past = get().past.slice();
    while (past.length && past[past.length - 1] === project) past.pop();
    if (!past.length) { set({ past }); return; }
    const back = past[past.length - 1];
    set({ project: back, past: past.slice(0, -1), future: [project, ...future], dirty: true, sel: validSel(back, get().sel) });
  },
  redo() { const { past, project, future } = get(); if (!future.length) return; set({ project: future[0], future: future.slice(1), past: [...past, project], dirty: true, sel: validSel(future[0], get().sel) }); },
  select(sel) { set({ sel: validSel(get().project, sel) }); },
  setTab(tab) { set({ tab }); },
  load(project, path) { set({ project, past: [], future: [], sel: null, filePath: path, dirty: false, markerEdit: null }); },
  saved(path) { set({ filePath: path, dirty: false }); },
  notify(msg, undoable = false) { clearTimeout(toastTimer); set({ toast: msg, toastUndo: undoable }); toastTimer = setTimeout(() => set({ toast: null }), undoable ? 5000 : 3500); },
  set(patch) { set(patch); },
}));
