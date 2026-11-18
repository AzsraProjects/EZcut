import { create } from 'zustand';
import { emptyProject, type Project } from '../core/types';

export type Tab = 'media' | 'effects' | 'filters' | 'transitions';
export type Selection = { kind: 'clip'; id: string } | { kind: 'transition'; id: string } | null;

export interface Layout { libW: number; inspW: number; tlH: number; showLib: boolean; showInsp: boolean; showTl: boolean; swap: boolean; }
export const DEFAULT_LAYOUT: Layout = { libW: 460, inspW: 310, tlH: 210, showLib: true, showInsp: true, showTl: true, swap: false };
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
  light: boolean;
  playing: boolean;
  exportOpen: boolean;
  /** Incrémenté quand les vignettes de la banque doivent être recalculées. */
  thumbEpoch: number;
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
  notify(msg: string): void;
  set(patch: Partial<Pick<State, 'pps' | 'catalogReady' | 'light' | 'toast' | 'playing' | 'exportOpen' | 'thumbEpoch'>>): void;
}

const LIMIT = 200;
let toastTimer: ReturnType<typeof setTimeout> | undefined;

export const useStore = create<State>((set, get) => ({
  layout: loadLayout(),
  setLayout(patch) {
    const layout = { ...get().layout, ...patch };
    set({ layout });
    try { localStorage.setItem('ezcut.layout', JSON.stringify(layout)); } catch { /* stockage indisponible : la disposition vaut pour cette session */ }
  },
  project: emptyProject(), past: [], future: [], sel: null, tab: 'media', filePath: null, dirty: false,
  catalogReady: false, pps: 60, toast: null, light: false, playing: false, exportOpen: false, thumbEpoch: 0, thumbs: {},
  setThumb(mediaId, t) { set(s => ({ thumbs: { ...s.thumbs, [mediaId]: { ...s.thumbs[mediaId], ...t } } })); },
  apply(fn, record = true) {
    const { project, past } = get(), next = fn(project);
    if (next === project) return;
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
    set({ project: past[past.length - 1], past: past.slice(0, -1), future: [project, ...future], dirty: true });
  },
  redo() { const { past, project, future } = get(); if (!future.length) return; set({ project: future[0], future: future.slice(1), past: [...past, project], dirty: true }); },
  select(sel) { set({ sel }); },
  setTab(tab) { set({ tab }); },
  load(project, path) { set({ project, past: [], future: [], sel: null, filePath: path, dirty: false }); },
  saved(path) { set({ filePath: path, dirty: false }); },
  notify(msg) { clearTimeout(toastTimer); set({ toast: msg }); toastTimer = setTimeout(() => set({ toast: null }), 3500); },
  set(patch) { set(patch); },
}));
