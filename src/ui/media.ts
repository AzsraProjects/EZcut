/** Import de médias et génération de leurs vignettes. */
import { addMedia, newId, replaceMedia } from '../core/ops';
import type { Media } from '../core/types';
import { ez, type ImportedFile } from '../desktop/api';
import { useStore } from './store';

const waitEvent = (el: EventTarget, ok: string, ms = 8000) => new Promise<boolean>(res => {
  const done = (v: boolean) => { clearTimeout(t); el.removeEventListener(ok, yes); el.removeEventListener('error', no); res(v); };
  const yes = () => done(true), no = () => done(false), t = setTimeout(no, ms);
  el.addEventListener(ok, yes); el.addEventListener('error', no);
});

/** Hauteur d'une image de la planche (nette sur une piste haute), largeur selon le format du média, nombre d'images par média. */
const SPRITE_H = 180, SPRITE_MIN = 6, SPRITE_MAX = 48;
/** Analyse en cours par média : seule la plus récente publie sa planche (un fichier remplacé deux fois de suite). */
const latest = new Map<string, number>();
let runs = 0;

/** Complète durée et dimensions à partir du fichier, puis fabrique la vignette et la bande d'images. */
async function analyse(m: Media): Promise<void> {
  const { setThumb, applySilent } = useStore.getState();
  const run = ++runs; latest.set(m.id, run);
  const current = () => latest.get(m.id) === run;
  const patch = (fn: (x: Media) => void) => applySilent(p => { const n = structuredClone(p), x = n.media.find(y => y.id === m.id); if (x) fn(x); return n; });
  if (m.kind === 'audio') {
    if (!m.duration) { const a = new Audio(m.url); if (await waitEvent(a, 'loadedmetadata')) patch(x => { x.duration = a.duration || 0; }); }
    return;
  }
  const c = document.createElement('canvas'), g = c.getContext('2d')!;
  const draw = (src: CanvasImageSource, sw: number, sh: number, dx: number, w: number, h: number) => {
    const s = Math.max(w / sw, h / sh), dw = sw * s, dh = sh * s;
    g.save(); g.beginPath(); g.rect(dx, 0, w, h); g.clip(); g.drawImage(src, dx + (w - dw) / 2, (h - dh) / 2, dw, dh); g.restore();
  };
  // Planche de la timeline : des images nettes jusqu'à la hauteur maximale d'une piste, en adresse blob (courte à recopier).
  const sprite = async (n: number, dur: number, frame: (i: number) => Promise<CanvasImageSource | null>, sw: number, sh: number) => {
    // Format du média, borné : une vidéo verticale donne des cases verticales, un panorama ne s'étire pas sans fin.
    const W = Math.round(SPRITE_H * Math.max(0.5, Math.min(2.4, sw && sh ? sw / sh : 16 / 9)));
    c.width = W * n; c.height = SPRITE_H; g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
    for (let i = 0; i < n; i++) { if (!current()) return; const src = await frame(i); if (src) draw(src, sw, sh, i * W, W, SPRITE_H); }
    const blob = await new Promise<Blob | null>(res => c.toBlob(res, 'image/jpeg', 0.72));
    if (!blob || !current()) return;
    const old = useStore.getState().thumbs[m.id]?.sprite?.url;
    setThumb(m.id, { sprite: { url: URL.createObjectURL(blob), n, dur, w: W, h: SPRITE_H } });
    if (old) URL.revokeObjectURL(old);
  };
  // Échec : la planche d'un fichier précédent ne reste pas affichée sous un autre fichier.
  const forget = () => { const old = useStore.getState().thumbs[m.id]?.sprite?.url; if (old && current()) { setThumb(m.id, { sprite: undefined }); URL.revokeObjectURL(old); } };
  if (m.kind === 'image') {
    const img = new Image(); img.crossOrigin = 'anonymous'; img.src = m.url;
    if (!await waitEvent(img, 'load')) { forget(); return; }
    patch(x => { x.width = img.naturalWidth; x.height = img.naturalHeight; });
    c.width = 240; c.height = 135; g.fillStyle = '#000'; g.fillRect(0, 0, 240, 135); draw(img, img.naturalWidth, img.naturalHeight, 0, 240, 135);
    setThumb(m.id, { poster: c.toDataURL('image/jpeg', 0.75) });
    await sprite(1, 0, async () => img, img.naturalWidth, img.naturalHeight);
    return;
  }
  // Voie rapide : FFmpeg fait la bande d'images à partir des seules images clés (et la garde en cache) ; la vignette
  // de la bibliothèque est la deuxième case. Aucun lecteur vidéo n'est ouvert : l'aperçu garde le décodeur pour lui.
  if (ez && m.duration > 0 && m.width > 0 && m.height > 0) {
    const n = Math.max(SPRITE_MIN, Math.min(SPRITE_MAX, Math.round(m.duration / 1.5)));
    const W = Math.round(SPRITE_H * Math.max(0.5, Math.min(2.4, m.width / m.height)));
    const bytes = await ez.mediaSprite(m.path, n, m.duration, W, SPRITE_H).catch(() => null);
    if (!current()) return;
    if (bytes) {
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'image/jpeg' })), img = new Image();
      img.src = url;
      if (await waitEvent(img, 'load') && current()) {
        c.width = 240; c.height = 135; g.fillStyle = '#000'; g.fillRect(0, 0, 240, 135);
        const k = Math.min(1, n - 1);
        g.drawImage(img, k * W, 0, W, SPRITE_H, ...(() => { const s = Math.max(240 / W, 135 / SPRITE_H), dw = W * s, dh = SPRITE_H * s; return [(240 - dw) / 2, (135 - dh) / 2, dw, dh] as const; })());
        const old = useStore.getState().thumbs[m.id]?.sprite?.url;
        setThumb(m.id, { poster: c.toDataURL('image/jpeg', 0.75), sprite: { url, n, dur: m.duration, w: W, h: SPRITE_H } });
        if (old) URL.revokeObjectURL(old);
        return;
      }
      URL.revokeObjectURL(url);
    }
  }
  // Voie de secours (fichier que FFmpeg ne lit pas, version web) : un lecteur vidéo, une recherche par image, un média à la fois.
  await slot();
  try { await viaPlayer(); } finally { release(); }
  async function viaPlayer() {
  const v = document.createElement('video');
  v.crossOrigin = 'anonymous'; v.muted = true; v.preload = 'auto'; v.src = m.url;
  if (!await waitEvent(v, 'loadeddata')) { forget(); return; }
  const dur = Number.isFinite(v.duration) ? v.duration : m.duration;
  patch(x => { if (!x.duration) x.duration = dur || 0; if (!x.width) { x.width = v.videoWidth; x.height = v.videoHeight; } });
  const grab = async (t: number) => { v.currentTime = Math.min(Math.max(0, t), Math.max(0, dur - 0.05)); await waitEvent(v, 'seeked', 3000); };
  try {
    await grab(Math.min(1, dur / 3));
    c.width = 240; c.height = 135; draw(v, v.videoWidth, v.videoHeight, 0, 240, 135);
    setThumb(m.id, { poster: c.toDataURL('image/jpeg', 0.75) });
    // Une image toutes les 1,5 s environ : chaque vignette de la timeline montre ce qui passe à cet instant.
    const n = Math.max(SPRITE_MIN, Math.min(SPRITE_MAX, Math.round(dur / 1.5)));
    await sprite(n, dur, async i => { await grab(dur * (i + 0.5) / n); return v; }, v.videoWidth, v.videoHeight);
  } catch { forget(); /* vignette indisponible : l'interface affiche le nom seul */ }
  v.removeAttribute('src'); v.load();
  }
}
/** Analyses par lecteur vidéo : une seule à la fois, pour ne pas étouffer l'aperçu sous des dizaines de décodages. */
let busy = false;
const waiting: (() => void)[] = [];
const slot = () => (busy ? new Promise<void>(r => waiting.push(r)) : (busy = true, Promise.resolve()));
const release = () => { const next = waiting.shift(); if (next) next(); else busy = false; };

function toMedia(f: ImportedFile): Media { return { id: newId('media'), ...f }; }

/** Ajoute des fichiers à la bibliothèque. Renvoie les médias réellement ajoutés. */
export function registerMedia(files: ImportedFile[]): Media[] {
  const st = useStore.getState(), known = new Set(st.project.media.map(m => m.path));
  const fresh = files.filter(f => !known.has(f.path)).map(toMedia);
  if (!fresh.length) return [];
  st.apply(p => addMedia(p, fresh));
  fresh.forEach(m => { void analyse(m); });
  return fresh;
}

export async function importWithDialog(): Promise<Media[]> {
  if (ez) { const got = await ez.pickMedia(), added = registerMedia(got); report(got.length, got.length, added.length); return added; }
  // Dans un navigateur (développement) : sélecteur de fichiers standard, lecture par URL locale.
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file'; input.multiple = true; input.accept = 'video/*,audio/*,image/*';
    input.onchange = () => resolve(importFiles([...(input.files ?? [])]));
    input.click();
  });
}

/** Dit à l'utilisateur ce que l'import a laissé de côté, plutôt que de ne rien faire en silence. */
function report(asked: number, accepted: number, added: number) {
  const refused = asked - accepted, known = accepted - added, parts: string[] = [];
  if (refused > 0) parts.push(`${refused} fichier${refused > 1 ? 's' : ''} ignoré${refused > 1 ? 's' : ''} : format non pris en charge`);
  if (known > 0) parts.push(`${known} déjà dans la bibliothèque`);
  if (parts.length) useStore.getState().notify(parts.join(' ; ') + '.');
}

export async function importFiles(files: File[]): Promise<Media[]> {
  if (ez) {
    const paths = files.map(f => ez!.pathForFile(f)).filter(Boolean);
    const got = await ez.importPaths(paths), added = registerMedia(got);
    report(files.length, got.length, added.length);
    return added;
  }
  return registerMedia(files.flatMap(f => {
    const kind = f.type.startsWith('video/') ? 'video' : f.type.startsWith('audio/') ? 'audio' : f.type.startsWith('image/') ? 'image' : null;
    return kind ? [{ path: 'web:' + f.name + ':' + f.size, url: URL.createObjectURL(f), name: f.name, kind, duration: 0, width: 0, height: 0, hasAudio: kind !== 'image' } as ImportedFile] : [];
  }));
}

/** Remplace le fichier d'un média (déplacé, renommé, ou nouvelle prise) : tous ses clips suivent. */
export async function replaceMediaFile(mediaId: string): Promise<void> {
  const st = useStore.getState();
  if (!ez) { st.notify('Disponible seulement dans l\'application de bureau.'); return; }
  const [f] = await ez.pickMedia();
  if (!f) return;
  const before = useStore.getState().project;
  useStore.getState().apply(p => replaceMedia(p, mediaId, f));
  const now = useStore.getState().project;
  if (now === before) { st.notify('Impossible : un son ne peut pas remplacer une vidéo ou une image, ni l\'inverse.'); return; }
  const m = now.media.find(x => x.id === mediaId);
  if (m) void analyse(m);
  st.notify(`Fichier remplacé par « ${f.name} ».`, true);
}

/** Après ouverture d'un projet : redonne accès aux fichiers et refait les vignettes. */
export async function relinkMedia(): Promise<number> {
  const st = useStore.getState(), list = st.project.media;
  if (!ez || !list.length) return 0;
  const found = new Map((await ez.relinkMedia(list.map(m => m.path))).map(f => [f.path, f]));
  // Ce que dit le fichier lui-même remplace ce qu'affirmait le projet (type, présence de son, dimensions).
  st.applySilent(p => {
    const n = structuredClone(p);
    n.media.forEach(m => { const f = found.get(m.path); if (f) Object.assign(m, { url: f.url, kind: f.kind, hasAudio: f.hasAudio, duration: f.duration || m.duration, width: f.width || m.width, height: f.height || m.height }); });
    return n;
  });
  useStore.getState().project.media.forEach(m => { if (found.has(m.path)) void analyse(m); });
  return list.filter(m => !found.has(m.path)).length;
}
