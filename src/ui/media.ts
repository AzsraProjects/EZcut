/** Import de médias et génération de leurs vignettes. */
import { addMedia, newId } from '../core/ops';
import type { Media } from '../core/types';
import { ez, type ImportedFile } from '../desktop/api';
import { useStore } from './store';

const waitEvent = (el: EventTarget, ok: string, ms = 8000) => new Promise<boolean>(res => {
  const done = (v: boolean) => { clearTimeout(t); el.removeEventListener(ok, yes); el.removeEventListener('error', no); res(v); };
  const yes = () => done(true), no = () => done(false), t = setTimeout(no, ms);
  el.addEventListener(ok, yes); el.addEventListener('error', no);
});

/** Complète durée et dimensions à partir du fichier, puis fabrique la vignette et la bande d'images. */
async function analyse(m: Media): Promise<void> {
  const { setThumb, apply } = useStore.getState();
  const patch = (fn: (x: Media) => void) => apply(p => { const n = structuredClone(p), x = n.media.find(y => y.id === m.id); if (x) fn(x); return n; }, false);
  if (m.kind === 'audio') {
    if (!m.duration) { const a = new Audio(m.url); if (await waitEvent(a, 'loadedmetadata')) patch(x => { x.duration = a.duration || 0; }); }
    return;
  }
  const c = document.createElement('canvas'), g = c.getContext('2d')!;
  const draw = (src: CanvasImageSource, sw: number, sh: number, dx: number, w: number, h: number) => {
    const s = Math.max(w / sw, h / sh), dw = sw * s, dh = sh * s;
    g.save(); g.beginPath(); g.rect(dx, 0, w, h); g.clip(); g.drawImage(src, dx + (w - dw) / 2, (h - dh) / 2, dw, dh); g.restore();
  };
  if (m.kind === 'image') {
    const img = new Image(); img.crossOrigin = 'anonymous'; img.src = m.url;
    if (!await waitEvent(img, 'load')) return;
    patch(x => { x.width = img.naturalWidth; x.height = img.naturalHeight; });
    c.width = 240; c.height = 135; g.fillStyle = '#000'; g.fillRect(0, 0, 240, 135); draw(img, img.naturalWidth, img.naturalHeight, 0, 240, 135);
    const poster = c.toDataURL('image/jpeg', 0.75);
    setThumb(m.id, { poster, strip: poster });
    return;
  }
  const v = document.createElement('video');
  v.crossOrigin = 'anonymous'; v.muted = true; v.preload = 'auto'; v.src = m.url;
  if (!await waitEvent(v, 'loadeddata')) return;
  const dur = Number.isFinite(v.duration) ? v.duration : m.duration;
  patch(x => { if (!x.duration) x.duration = dur || 0; if (!x.width) { x.width = v.videoWidth; x.height = v.videoHeight; } });
  const grab = async (t: number) => { v.currentTime = Math.min(Math.max(0, t), Math.max(0, dur - 0.05)); await waitEvent(v, 'seeked', 3000); };
  try {
    await grab(Math.min(1, dur / 3));
    c.width = 240; c.height = 135; draw(v, v.videoWidth, v.videoHeight, 0, 240, 135);
    setThumb(m.id, { poster: c.toDataURL('image/jpeg', 0.75) });
    const N = 6; c.width = 96 * N; c.height = 54;
    for (let i = 0; i < N; i++) { await grab(dur * (i + 0.5) / N); draw(v, v.videoWidth, v.videoHeight, i * 96, 96, 54); }
    setThumb(m.id, { strip: c.toDataURL('image/jpeg', 0.6) });
  } catch { /* vignette indisponible : l'interface affiche le nom seul */ }
  v.removeAttribute('src'); v.load();
}

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
  if (ez) return registerMedia(await ez.pickMedia());
  // Dans un navigateur (développement) : sélecteur de fichiers standard, lecture par URL locale.
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file'; input.multiple = true; input.accept = 'video/*,audio/*,image/*';
    input.onchange = () => resolve(importFiles([...(input.files ?? [])]));
    input.click();
  });
}

export async function importFiles(files: File[]): Promise<Media[]> {
  if (ez) {
    const paths = files.map(f => ez!.pathForFile(f)).filter(Boolean);
    return registerMedia(await ez.importPaths(paths));
  }
  return registerMedia(files.flatMap(f => {
    const kind = f.type.startsWith('video/') ? 'video' : f.type.startsWith('audio/') ? 'audio' : f.type.startsWith('image/') ? 'image' : null;
    return kind ? [{ path: 'web:' + f.name + ':' + f.size, url: URL.createObjectURL(f), name: f.name, kind, duration: 0, width: 0, height: 0, hasAudio: kind !== 'image' } as ImportedFile] : [];
  }));
}

/** Après ouverture d'un projet : redonne accès aux fichiers et refait les vignettes. */
export async function relinkMedia(): Promise<number> {
  const st = useStore.getState(), list = st.project.media;
  if (!ez || !list.length) return 0;
  const found = new Map((await ez.importPaths(list.map(m => m.path))).map(f => [f.path, f]));
  st.apply(p => { const n = structuredClone(p); n.media.forEach(m => { const f = found.get(m.path); if (f) m.url = f.url; }); return n; }, false);
  useStore.getState().project.media.forEach(m => { if (found.has(m.path)) void analyse(m); });
  return list.filter(m => !found.has(m.path)).length;
}
