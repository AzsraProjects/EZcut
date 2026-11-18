/** Catalogue d'effets, filtres et transitions. Les shaders viennent de public/catalog/effets.json (voir tools/catalog). */
import type { EffectDef, TransitionDef } from '../engine/gl';
import type { Params } from '../core/types';

export interface CatEffect extends EffectDef {
  kind: 'effect' | 'filter' | 'tool';
  cats: string[]; credit: string; desc: string; license: string; source: string;
  /** Valeurs appliquées à la pose quand les réglages par défaut du shader ne changent rien à l'image. */
  preview: Params | null;
  /** Réglages accentués, pour la vignette fixe de la banque uniquement. */
  thumb?: Params | null;
  temporal: boolean;
  by: string; cat: string[]; label: string;
}
export interface CatTransition extends TransitionDef {
  kind: 'transition';
  tags: string[]; credit: string; license: string; source: string;
  featured?: boolean;
  by: string; cat: string[]; label: string;
}
export type CatItem = CatEffect | CatTransition;

const FX_CATS: Record<string, string> = {
  'Stylize': 'Stylisation', 'Retro': 'Rétro', 'Glitch': 'Glitch', 'Blur': 'Flou', 'Distortion Effect': 'Distorsion', 'Distortion': 'Distorsion',
  'Halftone Effect': 'Trame', 'Feedback': 'Traînées', 'Kaleidoscope': 'Kaléidoscope', 'Tile Effect': 'Mosaïque', 'Noise': 'Bruit',
  'Sharpen': 'Netteté', 'Geometry Adjustment': 'Mouvement et cadre', 'Mouvement': 'Mouvement et cadre', 'Color Effect': 'Couleur', 'Film': 'Film',
};
const FILTER_CATS: Record<string, string> = { 'Color Effect': 'Couleur', 'Color Adjustment': 'Réglages', 'Film': 'Film', 'v002': 'Film', 'Retro': 'Rétro', 'Stylize': 'Stylisé' };
const TR_CATS: Record<string, string> = {
  fade: 'Fondu', dissolve: 'Fondu', blend: 'Fondu', wipe: 'Volet', reveal: 'Volet', slide: 'Glissement', directional: 'Glissement', zoom: 'Zoom',
  '3d': '3D et rotation', rotate: '3D et rotation', distort: 'Distorsion', light: 'Lumière', retro: 'Rétro', grid: 'Grille', tiles: 'Grille',
  organic: 'Organique', paper: 'Organique', shape: 'Formes',
};
const COLOR_LABELS: Record<string, string> = { bright: 'Luminosité', contrast: 'Contraste', hue: 'Teinte', saturation: 'Saturation' };

/** Catégorie des transitions mises en avant, toujours affichée en premier. */
export const FEATURED = 'Essentielles';

export const catalog = {
  ready: false,
  effects: [] as CatEffect[],
  filters: [] as CatEffect[],
  transitions: [] as CatTransition[],
  /** Réglage de couleur de base, affiché dans l'inspecteur. */
  color: null as CatEffect | null,
  byId: new Map<string, CatItem>(),
};

const uniq = (a: string[]) => [...new Set(a)];

export async function loadCatalog(url = './catalog/effets.json'): Promise<void> {
  const d = await (await fetch(url)).json() as { effects: CatEffect[]; transitions: CatTransition[] };
  for (const e of d.effects) {
    e.by = e.credit.replace(/^by\s+/i, '').replace(/\s*\(.*$/, '') || 'VIDVOX';
    e.label = e.name.replace(/^v002[ -]/, '');
    const map = e.kind === 'filter' ? FILTER_CATS : FX_CATS;
    e.cat = uniq(e.cats.map(c => map[c]).filter(Boolean));
    if (!e.cat.length) e.cat = [e.kind === 'filter' ? 'Couleur' : 'Stylisation'];
    catalog.byId.set(e.id, e);
  }
  for (const t of d.transitions) {
    t.kind = 'transition';
    t.by = t.credit || 'gl-transitions';
    t.label = t.name.replace(/([a-z])([A-Z0-9])/g, '$1 $2');
    t.cat = uniq((t.tags ?? []).map(x => TR_CATS[x]).filter(Boolean));
    if (!t.cat.length) t.cat = ['Autres'];
    if (t.featured) t.cat.unshift(FEATURED);
    catalog.byId.set(t.id, t);
  }
  catalog.color = d.effects.find(e => e.kind === 'tool' && e.id === 'isf:Color Controls') ?? null;
  catalog.color?.inputs.forEach(i => { i.LABEL = COLOR_LABELS[i.NAME] ?? i.NAME; });
  catalog.effects = d.effects.filter(e => e.kind === 'effect');
  catalog.filters = d.effects.filter(e => e.kind === 'filter');
  catalog.transitions = d.transitions;
  catalog.ready = true;
}

/** Valeurs initiales d'un effet posé sur un clip. */
export function defaultsOf(e: CatEffect): Params {
  const o: Params = {};
  for (const i of e.inputs) if (i.DEFAULT !== undefined && i.TYPE !== 'event') o[i.NAME] = i.DEFAULT as Params[string];
  return Object.assign(o, e.preview ?? {});
}

export function transitionDefaults(t: CatTransition): Record<string, number[]> {
  const o: Record<string, number[]> = {};
  for (const u of t.params) o[u.name] = u.def.slice();
  return o;
}
