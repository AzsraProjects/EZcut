/** Lien de pilotage, côté interface : exécute les commandes envoyées par un assistant (voir electron/control.cjs et tools/mcp).
 *  Chaque commande passe par les mêmes opérations que les gestes de l'utilisateur, donc reste annulable par Ctrl+Z,
 *  et le projet qui en résulte est revalidé comme un fichier venu de l'extérieur. */
import { addFx, addOverlay, addSound, addText, appendClip, detachAudio, findClip, moveClip, moveFree, patchClip, projectDuration, removeClip, removeFx, setTransition, spanWhole, splitAt, startsOf, TRACKS, trimClip } from '../core/ops';
import { parseProject } from '../core/project';
import { defaultText, type Clip, type Project, type TrackId } from '../core/types';
import { ez, type ControlRequest, type ImportedFile } from '../desktop/api';
import { catalog, defaultsOf, transitionDefaults, type CatEffect, type CatItem } from '../effects/catalog';
import { player } from '../engine/player';
import { exportProject, exportSize } from '../export/exporter';
import { canReplaceProject, loadProject, newProject, serialise } from './actions';
import { registerMedia } from './media';
import { useStore } from './store';
import { TITLES } from './titles';

type P = Record<string, unknown>;
const S = () => useStore.getState();
const fail = (msg: string): never => { throw new Error(msg); };
const str = (v: unknown, name: string) => (typeof v === 'string' && v ? v : fail(`Paramètre « ${name} » manquant.`));
const num = (v: unknown, name: string) => (typeof v === 'number' && Number.isFinite(v) ? v : fail(`Paramètre « ${name} » : nombre attendu.`));
const optNum = (v: unknown, name: string) => (v === undefined ? undefined : num(v, name));
const isObj = (v: unknown): v is P => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Applique une modification venue de l'assistant : le résultat est revalidé (types, bornes, pistes sans recouvrement) avant d'entrer dans le projet. */
function commit(next: Project): Project {
  const before = S().project;
  if (next === before) return before;
  const clean = parseProject(JSON.stringify(next)) ?? fail('Modification refusée : le projet obtenu serait invalide.');
  const urls = new Map(before.media.map(m => [m.id, m.url]));
  clean.media.forEach(m => { m.url = urls.get(m.id) ?? ''; });
  S().apply(() => clean);
  return clean;
}
const clipOf = (id: unknown) => findClip(S().project, str(id, 'clipId')) ?? fail('Clip introuvable : relancez ezcut_status pour obtenir les identifiants à jour.');
const itemOf = (id: unknown, kinds: CatItem['kind'][]) => { const it = catalog.byId.get(str(id, 'effectId')); return it && kinds.includes(it.kind) ? it : fail('Effet introuvable dans le catalogue : cherchez son identifiant avec ezcut_catalog.'); };

function describeClip(p: Project, track: TrackId, c: Clip, start: number) {
  const m = p.media.find(x => x.id === c.mediaId);
  return {
    id: c.id, track, start: +start.toFixed(3), duration: +c.dur.toFixed(3), in: +c.in.toFixed(3),
    ...(c.text ? { text: c.text.content } : { mediaId: c.mediaId, media: m?.name ?? null }),
    ...(c.fx.length ? { effects: c.fx.map(f => ({ uid: f.uid, effectId: f.effectId, on: f.on, params: f.params })) } : {}),
    ...(c.transition ? { transition: { effectId: c.transition.effectId, duration: c.transition.dur } } : {}),
    ...(c.volume !== 1 || c.fadeIn || c.fadeOut ? { volume: c.volume, fadeIn: c.fadeIn, fadeOut: c.fadeOut } : {}),
    ...(c.vfadeIn || c.vfadeOut ? { vfadeIn: c.vfadeIn, vfadeOut: c.vfadeOut } : {}),
    ...(c.still ? { still: true } : {}),
    ...(c.opacity !== 1 || c.blend !== 'normal' ? { opacity: c.opacity, blend: c.blend } : {}),
    ...(c.transform.scale !== 1 || c.transform.x || c.transform.y || c.transform.rot ? { transform: c.transform } : {}),
    ...(Object.keys(c.color).length ? { color: c.color } : {}),
  };
}
function status() {
  const st = S(), p = st.project;
  return {
    project: { name: p.name, width: p.width, height: p.height, fps: p.fps, duration: +projectDuration(p).toFixed(3), file: st.filePath, unsaved: st.dirty },
    playhead: +player.t.toFixed(3), playing: player.playing, selection: st.sel,
    media: p.media.map(m => ({ id: m.id, name: m.name, kind: m.kind, duration: +m.duration.toFixed(3), width: m.width, height: m.height, hasAudio: m.hasAudio, path: m.path, missing: !m.url })),
    tracks: Object.fromEntries(TRACKS.map(t => { const s = startsOf(p, t); return [t, p[t].map((c, i) => describeClip(p, t, c, s[i]))]; })),
    notes: 'Pistes : video (principale, clips à la suite, transitions) ; overlay (par-dessus), text (titres), sound (son détaché, voix, bruitages) et audio (musique) sont libres : chaque clip a sa position. Temps en secondes. Positions : fraction du cadre, x vers la droite, y vers le haut, 0 = centre.',
  };
}

const paramsOf = (e: CatEffect) => e.inputs.filter(i => i.TYPE !== 'event').map(i => ({ name: i.NAME, label: i.LABEL, type: i.TYPE, min: i.MIN, max: i.MAX, default: i.DEFAULT, values: i.VALUES, labels: i.LABELS }));
function listCatalog(p: P) {
  const kind = typeof p.kind === 'string' ? p.kind : 'all', q = typeof p.query === 'string' ? p.query.trim().toLowerCase() : '', full = p.details === true;
  const match = (it: { label: string; name: string; cat: string[] }) => !q || [it.label, it.name, ...it.cat].join(' ').toLowerCase().includes(q);
  const fx = (list: CatEffect[]) => list.filter(match).map(e => ({ id: e.id, name: e.label, category: e.cat.join(', '), description: e.desc || undefined, ...(full ? { params: paramsOf(e) } : {}) }));
  const out: P = {};
  if (kind === 'all' || kind === 'effect') out.effects = fx(catalog.effects);
  if (kind === 'all' || kind === 'filter') out.filters = fx(catalog.filters);
  if (kind === 'all' || kind === 'transition') out.transitions = catalog.transitions.filter(match).map(t => ({ id: t.id, name: t.label, category: t.cat.join(', '), ...(full ? { params: t.params } : {}) }));
  if (kind === 'all' || kind === 'title') out.titles = TITLES.filter(t => !q || (t.label + ' ' + t.cat).toLowerCase().includes(q)).map(t => ({ id: t.id, name: t.label, category: t.cat }));
  return out;
}

/** Image composée du projet à un instant donné, en JPEG (base64). */
async function screenshot(p: P) {
  const project = S().project, total = projectDuration(project);
  if (!total) fail('Le projet est vide : rien à montrer.');
  const t = Math.max(0, Math.min(total - 1e-3, optNum(p.time, 'time') ?? player.t));
  const { width, height } = exportSize(project, Math.max(180, Math.min(1080, Math.round(optNum(p.size, 'size') ?? 540))));
  const buf = new Uint8Array(width * height * 4);
  player.pause(); player.exporting = true;
  try { await player.renderExact(project, t, width, height, buf); } finally { player.resetExportState(width, height); player.exporting = false; player.seek(player.t); }
  const c = document.createElement('canvas'); c.width = width; c.height = height;
  const g = c.getContext('2d')!, img = g.createImageData(width, height), row = width * 4;
  for (let y = 0; y < height; y++) img.data.set(buf.subarray((height - 1 - y) * row, (height - y) * row), y * row); // lignes de bas en haut → de haut en bas
  g.putImageData(img, 0, 0);
  return { time: +t.toFixed(3), width, height, image: c.toDataURL('image/jpeg', 0.82).split(',')[1], mimeType: 'image/jpeg' };
}

/** Planche d'images d'un média, pour qu'un assistant voie ce qu'il contient avant de le monter. */
async function mediaPreview(p: P) {
  const m = S().project.media.find(x => x.id === str(p.mediaId, 'mediaId')) ?? fail('Média introuvable.');
  if (m.kind === 'audio') fail('Un fichier audio n\'a pas d\'image.');
  if (!m.url) fail('Ce média est introuvable sur le disque.');
  const n = m.kind === 'image' ? 1 : Math.max(1, Math.min(12, Math.round(optNum(p.count, 'count') ?? 6))), cols = Math.min(n, 3), tw = 320, th = 180;
  const c = document.createElement('canvas'); c.width = cols * tw; c.height = Math.ceil(n / cols) * th;
  const g = c.getContext('2d')!; g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
  const wait = (el: EventTarget, ev: string) => new Promise<boolean>(res => { const t = setTimeout(() => res(false), 8000); el.addEventListener(ev, () => { clearTimeout(t); res(true); }, { once: true }); });
  const place = (src: CanvasImageSource, sw: number, sh: number, i: number, label: string) => {
    const x = (i % cols) * tw, y = Math.floor(i / cols) * th, s = Math.min(tw / sw, th / sh);
    g.drawImage(src, x + (tw - sw * s) / 2, y + (th - sh * s) / 2, sw * s, sh * s);
    g.font = '600 13px sans-serif'; g.fillStyle = 'rgba(0,0,0,.7)'; g.fillRect(x + 4, y + 4, g.measureText(label).width + 10, 20); g.fillStyle = '#fff'; g.fillText(label, x + 9, y + 19);
  };
  const times: number[] = [];
  if (m.kind === 'image') {
    const img = new Image(); img.crossOrigin = 'anonymous'; img.src = m.url;
    if (!await wait(img, 'load')) fail('Image illisible.');
    place(img, img.naturalWidth, img.naturalHeight, 0, m.name);
  } else {
    const v = document.createElement('video'); v.crossOrigin = 'anonymous'; v.muted = true; v.preload = 'auto'; v.src = m.url;
    if (!await wait(v, 'loadeddata')) fail('Vidéo illisible (format non pris en charge ?).');
    for (let i = 0; i < n; i++) {
      const t = Math.min(m.duration - 0.05, m.duration * (i + 0.5) / n);
      v.currentTime = Math.max(0, t); await wait(v, 'seeked');
      place(v, v.videoWidth, v.videoHeight, i, `${t.toFixed(1)} s`); times.push(+t.toFixed(2));
    }
    v.removeAttribute('src'); v.load();
  }
  return { media: m.name, duration: m.duration, times, image: c.toDataURL('image/jpeg', 0.8).split(',')[1], mimeType: 'image/jpeg' };
}

const handlers: Record<string, (p: P) => unknown | Promise<unknown>> = {
  status,
  catalog: listCatalog,
  screenshot,
  mediaPreview,
  serialise: () => ({ json: serialise(S().project) }),
  markSaved: p => { S().saved(str(p.path, 'path')); return {}; },
  registerMedia: p => {
    const files = (Array.isArray(p.files) ? p.files : []) as ImportedFile[], added = registerMedia(files);
    const all = S().project.media;
    return { media: files.map(f => all.find(m => m.path === f.path)).filter(Boolean).map(m => ({ id: m!.id, name: m!.name, kind: m!.kind, duration: m!.duration, width: m!.width, height: m!.height, hasAudio: m!.hasAudio })), added: added.length };
  },
  loadProject: async p => { if (!await canReplaceProject()) fail('L\'utilisateur a refusé de remplacer le projet en cours.'); if (!await loadProject(str(p.json, 'json'), str(p.path, 'path'))) fail('Ce fichier n\'est pas un projet EZcut lisible.'); return status(); },
  newProject: async () => { await newProject(); return status(); },

  addClip: p => {
    const project = S().project, mediaId = str(p.mediaId, 'mediaId'), at = optNum(p.at, 'at') ?? player.t;
    const r = (p.track === 'overlay' ? addOverlay(project, mediaId, at) : p.track === 'sound' || (p.track === 'music' && p.at !== undefined) ? addSound(project, mediaId, p.track === 'sound' ? 'sound' : 'audio', at) : appendClip(project, mediaId, optNum(p.index, 'index'))) ?? fail('Média introuvable, ou type de média incompatible avec cette piste.');
    const f = findClip(commit(r.project), r.clipId);
    return f ? describeClip(S().project, f.track, f.clip, f.start) : {};
  },
  addTitle: p => {
    const preset = TITLES.find(t => t.id === p.preset), style = { ...(preset?.style ?? defaultText()), ...(isObj(p.style) ? p.style : {}), content: str(p.text, 'text') };
    const r = addText(S().project, style as never, optNum(p.at, 'at') ?? player.t, { ...preset?.transform, ...(isObj(p.position) ? p.position : {}) });
    let next = r.project;
    const dur = optNum(p.duration, 'duration');
    if (dur !== undefined) next = trimClip(next, r.clipId, 'end', dur - (findClip(next, r.clipId)?.clip.dur ?? dur));
    const f = findClip(commit(next), r.clipId);
    return f ? describeClip(S().project, f.track, f.clip, f.start) : {};
  },
  editClip: p => {
    const f = clipOf(p.clipId), id = f.clip.id;
    let next = S().project;
    // Temps : par les opérations de montage, qui respectent le média et les voisins.
    if (p.trimStart !== undefined) next = trimClip(next, id, 'start', num(p.trimStart, 'trimStart'));
    if (p.trimEnd !== undefined) next = trimClip(next, id, 'end', num(p.trimEnd, 'trimEnd'));
    if (p.duration !== undefined) next = trimClip(next, id, 'end', num(p.duration, 'duration') - (findClip(next, id)?.clip.dur ?? 0));
    if (p.start !== undefined) next = moveFree(next, id, num(p.start, 'start'));
    if (p.index !== undefined) next = moveClip(next, id, num(p.index, 'index'));
    if (p.wholeVideo === true) next = spanWhole(next, id);
    next = patchClip(next, id, c => {
      for (const k of ['volume', 'fadeIn', 'fadeOut', 'vfadeIn', 'vfadeOut', 'opacity'] as const) if (p[k] !== undefined) c[k] = num(p[k], k);
      if (typeof p.blend === 'string') c.blend = p.blend as Clip['blend'];
      if (isObj(p.transform)) Object.assign(c.transform, p.transform);
      if (isObj(p.color)) Object.assign(c.color, p.color);
      if (isObj(p.text) && c.text) Object.assign(c.text, p.text);
    });
    const g = findClip(commit(next), id);
    return g ? describeClip(S().project, g.track, g.clip, g.start) : {};
  },
  split: p => {
    const track = (typeof p.track === 'string' && (TRACKS as string[]).includes(p.track) ? p.track : 'video') as TrackId, before = S().project;
    const after = commit(splitAt(before, track, num(p.time, 'time')));
    if (after === before) fail('Rien à couper à cet instant sur cette piste (trop près d\'un bord, ou aucun clip).');
    return status().tracks[track];
  },
  removeClip: p => { commit(removeClip(S().project, clipOf(p.clipId).clip.id)); return {}; },
  detachAudio: p => {
    const r = detachAudio(S().project, clipOf(p.clipId).clip.id) ?? fail('Impossible de détacher : ce clip n\'a pas de son, ou la piste sound est déjà occupée à cet endroit.');
    const f = findClip(commit(r.project), r.clipId);
    return f ? describeClip(S().project, f.track, f.clip, f.start) : {};
  },
  applyEffect: p => {
    const f = clipOf(p.clipId), it = itemOf(p.effectId, ['effect', 'filter']) as CatEffect;
    if (f.clip.text || f.track === 'audio') fail('Les effets s\'appliquent aux vidéos et aux images.');
    commit(addFx(S().project, f.clip.id, it.id, { ...defaultsOf(it), ...(isObj(p.params) ? p.params : {}) } as never));
    return describeClip(S().project, f.track, findClip(S().project, f.clip.id)!.clip, f.start);
  },
  editEffect: p => {
    const f = clipOf(p.clipId), uid = str(p.uid, 'uid');
    if (!f.clip.fx.some(x => x.uid === uid)) fail('Effet introuvable sur ce clip.');
    commit(p.remove === true ? removeFx(S().project, f.clip.id, uid) : patchClip(S().project, f.clip.id, c => { const x = c.fx.find(y => y.uid === uid)!; if (typeof p.on === 'boolean') x.on = p.on; if (isObj(p.params)) Object.assign(x.params, p.params); }));
    return describeClip(S().project, f.track, findClip(S().project, f.clip.id)!.clip, f.start);
  },
  setTransition: p => {
    const f = clipOf(p.clipId), before = S().project;
    if (p.effectId === null || p.effectId === undefined) { commit(setTransition(before, f.clip.id, null)); return {}; }
    const it = itemOf(p.effectId, ['transition']);
    if (it.kind !== 'transition') return fail('Ce n\'est pas une transition.');
    const next = before.video[f.index + 1];
    if (f.track !== 'video' || !next) fail('Une transition se pose sur un clip de la piste video qui a un clip après lui.');
    commit(setTransition(before, f.clip.id, { effectId: it.id, params: { ...transitionDefaults(it), ...(isObj(p.params) ? p.params as Record<string, number[]> : {}) }, dur: optNum(p.duration, 'duration') ?? Math.min(1, f.clip.dur, next.dur) }));
    return describeClip(S().project, 'video', findClip(S().project, f.clip.id)!.clip, f.start);
  },
  projectSettings: p => {
    commit({ ...S().project, ...(typeof p.name === 'string' ? { name: p.name } : {}), ...(p.width !== undefined ? { width: num(p.width, 'width') } : {}), ...(p.height !== undefined ? { height: num(p.height, 'height') } : {}), ...(p.fps !== undefined ? { fps: num(p.fps, 'fps') } : {}) });
    return status().project;
  },
  transport: p => {
    if (p.time !== undefined) player.seek(num(p.time, 'time'));
    if (p.action === 'play') player.play(); else if (p.action === 'pause') player.pause();
    return { playhead: +player.t.toFixed(3), playing: player.playing };
  },
  undo: () => { S().undo(); return status(); },
  redo: () => { S().redo(); return status(); },
  export: async p => {
    const r = await exportProject(S().project, { height: optNum(p.height, 'height') ?? 1080, fps: optNum(p.fps, 'fps') ?? S().project.fps, codec: p.codec === 'hevc' ? 'hevc' : 'h264' }, () => {}, () => false);
    if (!r.ok) fail(r.error ?? 'L\'export a échoué.');
    return { path: r.path, frames: r.frames, seconds: r.seconds && +r.seconds.toFixed(1) };
  },
};

/** Branche le lien : à appeler une fois au démarrage de l'interface. */
export function connectControl() {
  ez?.onControl(async (req: ControlRequest) => {
    const h = handlers[req.method];
    try {
      if (!h) throw new Error(`Commande inconnue : ${req.method}`);
      if (!catalog.ready) throw new Error('EZcut démarre encore : réessayez dans un instant.');
      await ez!.controlReply(req.id, true, await h(req.params ?? {}));
    } catch (e) { await ez!.controlReply(req.id, false, String((e as Error).message ?? e)); }
  });
}
