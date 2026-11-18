/** Lecture et composition : calcule l'image du projet à un instant donné, pour l'aperçu, les vignettes et l'export. */
import { activeAt, clipAt, fadeGain, imageGain, projectDuration } from '../core/ops';
import { BLEND_MODES, emptyProject, type Clip, type Project } from '../core/types';
import { catalog, type CatEffect, type CatItem } from '../effects/catalog';
import { Engine, type EffectProgram, type Failed, type Target, type TransitionProgram } from './gl';
import { animState, drawText, textSize } from './text';

export const TW = 240, TH = 135;
const PREVIEW_H = 540;
/** Hauteurs de rendu de l'aperçu : on prend la première qui couvre la taille affichée, pour ne pas recréer les tampons à chaque pixel de redimensionnement. */
const PREVIEW_STEPS = [270, 360, 540, 720, 900, 1080, 1440, 2160];
export type PreviewQuality = 'auto' | 'full' | 'half' | 'quarter';

interface Source { url: string; kind: 'video' | 'image'; el: HTMLVideoElement | HTMLImageElement; tex: WebGLTexture; w: number; h: number; loaded: boolean; }
interface Want { clip: Clip; index: number; start: number; time: number; live: boolean; }
interface TargetSet { fit: Target; ping: [Target, Target]; ra: Target; rb: Target; out: Target; acc: [Target, Target]; }
interface ChainItem { p: EffectProgram; params: Record<string, unknown>; key: string; }
/** Image de la piste principale : un clip, ou deux pendant une transition (k = avancement). */
interface Frame { a: Want; b?: Want; k?: number; }
/** Couche au-dessus de la piste principale : incrustation ou titre. */
interface Layer { clip: Clip; local: number; }
interface TextCache { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; tex: WebGLTexture; key: string; w: number; h: number; }

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
/** Attend un événement. Renvoie false si le délai est dépassé. */
const once = (el: EventTarget, ev: string, ms: number) => new Promise<boolean>(res => {
  const done = (ok: boolean) => { clearTimeout(t); el.removeEventListener(ev, yes); res(ok); };
  const yes = () => done(true), t = setTimeout(() => done(false), ms);
  el.addEventListener(ev, yes);
});

export class Player {
  engine!: Engine;
  getProject: () => Project = emptyProject;
  t = 0;
  playing = false;
  exporting = false;
  muted = false;
  alt = false;
  hover: { item: CatItem; ctx: CanvasRenderingContext2D } | null = null;
  /** Clip visé par les aperçus de la banque (clip sélectionné, sinon celui sous la tête de lecture). */
  targetClipId: string | null = null;
  onTime: (t: number) => void = () => {};
  onPlayState: (playing: boolean) => void = () => {};
  /** Appelé quand la première image d'une source devient disponible (les vignettes peuvent être refaites). */
  onSourceReady: () => void = () => {};
  /** Anomalies du moteur (shader qui ne compile pas, média illisible), pour le journal. */
  onLog: (msg: string, data?: unknown) => void = () => {};
  vw = 960; vh = PREVIEW_H;
  /** Qualité de l'aperçu : auto = à la taille réelle d'affichage (net sans calcul inutile) ; sinon une fraction de la résolution du projet. */
  quality: PreviewQuality = 'auto';
  /** Hauteur à laquelle l'image est affichée à l'écran, en pixels réels (taille du panneau × densité de l'écran). */
  displayHeight = PREVIEW_H;

  private glc!: HTMLCanvasElement;
  private view: CanvasRenderingContext2D | null = null;
  private sources = new Map<string, Source>();
  private audios = new Map<string, HTMLAudioElement>();
  private texts = new Map<string, TextCache>();
  private progs = new Map<string, EffectProgram | TransitionProgram | Failed>();
  private sets = new Map<string, TargetSet>();
  private sample: { a: WebGLTexture; b: WebGLTexture; w: number; h: number } | null = null;
  private queue: { item: CatItem; ctx: CanvasRenderingContext2D }[] = [];
  /** Instant le plus parlant de chaque effet pour sa vignette fixe. */
  private bestTime = new Map<string, number>();
  private frameNo = 0;
  private fps = 30;
  private last = 0;
  private started = false;
  /** Vrai entre un déplacement de la tête de lecture et la synchronisation suivante. */
  private jumped = false;
  /** Projet en cours d'export (instantané), pour que l'état des pistes vienne de lui et non du projet vivant. */
  private exportProject: Project | null = null;

  init() {
    if (this.started) return;
    this.started = true;
    this.glc = document.createElement('canvas');
    this.glc.width = this.vw; this.glc.height = this.vh;
    this.engine = new Engine(this.glc);
    const a = this.engine.createTexture(), b = this.engine.createTexture();
    this.sample = { a, b, w: 768, h: 432 };
    const load = (src: string, tex: WebGLTexture) => { const i = new Image(); i.onload = () => this.engine.upload(tex, i); i.src = src; };
    load('./sample/poster-a.jpg', a); load('./sample/poster-b.jpg', b);
    requestAnimationFrame(this.tick);
  }
  setView(canvas: HTMLCanvasElement | null) { this.view = canvas ? canvas.getContext('2d') : null; }

  /* ---------- transport ---------- */
  play() {
    const total = projectDuration(this.getProject());
    if (!total || this.exporting) return;
    if (this.t >= total - 0.02) { this.t = 0; this.jumped = true; }
    this.playing = true; this.onPlayState(true);
  }
  pause() {
    if (!this.playing) return;
    this.playing = false; this.onPlayState(false);
    this.sources.forEach(s => { if (s.kind === 'video') (s.el as HTMLVideoElement).pause(); });
    this.audios.forEach(a => a.pause());
  }
  toggle() { this.playing ? this.pause() : this.play(); }
  seek(t: number) { this.t = clamp(t, 0, projectDuration(this.getProject())); this.jumped = true; this.onTime(this.t); }

  /* ---------- programmes ---------- */
  prog(id: string): EffectProgram | TransitionProgram | Failed {
    let p = this.progs.get(id);
    if (!p) {
      const it = catalog.byId.get(id);
      p = !it ? { ok: false as const, err: 'effet inconnu' } : it.kind === 'transition' ? this.engine.compileTransition(it) : this.engine.compileEffect(it);
      if (!p.ok) this.onLog(`effet inutilisable : ${id}`, p.err);
      this.progs.set(id, p);
    }
    return p;
  }
  private fxProg(id: string): EffectProgram | null { const p = this.prog(id); return p.ok && p.kind === 'effect' ? p : null; }
  private trProg(id: string): TransitionProgram | null { const p = this.prog(id); return p.ok && p.kind === 'transition' ? p : null; }

  private set(w: number, h: number): TargetSet {
    const key = w + 'x' + h;
    let s = this.sets.get(key);
    if (!s) {
      const mk = () => this.engine.createTarget(w, h);
      s = { fit: mk(), ping: [mk(), mk()], ra: mk(), rb: mk(), out: mk(), acc: [mk(), mk()] };
      this.sets.set(key, s);
    }
    return s;
  }

  /* ---------- sources ---------- */
  private source(p: Project, clip: Clip): Source | null {
    let s = this.sources.get(clip.id);
    const media = p.media.find(m => m.id === clip.mediaId);
    // Le média vient d'être relié (ouverture d'un projet) ou a changé : la source est refaite.
    if (s && media && s.url !== media.url) { this.dropSource(clip.id); s = undefined; }
    if (s) return s;
    if (!media || media.kind === 'audio' || !media.url) return null;
    const tex = this.engine.createTexture();
    if (media.kind === 'image') {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      const src: Source = s = { url: media.url, kind: 'image', el: img, tex, w: media.width || 16, h: media.height || 9, loaded: false };
      img.onload = () => { src.w = img.naturalWidth; src.h = img.naturalHeight; this.engine.upload(tex, img); src.loaded = true; this.onSourceReady(); };
      img.src = media.url;
    } else {
      const v = document.createElement('video');
      v.crossOrigin = 'anonymous'; v.preload = 'auto'; v.playsInline = true; v.src = media.url;
      v.addEventListener('error', () => this.onLog(`média illisible : ${media.name}`, v.error ? `code ${v.error.code} ${v.error.message}` : ''), { once: true });
      s = { url: media.url, kind: 'video', el: v, tex, w: media.width || 16, h: media.height || 9, loaded: false };
    }
    this.sources.set(clip.id, s);
    return s;
  }
  private dropSource(id: string) {
    const s = this.sources.get(id);
    if (!s) return;
    if (s.kind === 'video') { const v = s.el as HTMLVideoElement; v.pause(); v.removeAttribute('src'); v.load(); }
    this.engine.deleteTexture(s.tex);
    this.sources.delete(id);
  }
  private grab(s: Source) {
    const el = s.el as HTMLVideoElement;
    if (el.readyState >= 2 && el.videoWidth) { this.engine.upload(s.tex, el); s.w = el.videoWidth; s.h = el.videoHeight; if (!s.loaded) { s.loaded = true; this.onSourceReady(); } }
  }

  /** Quels clips de la piste principale faut-il, et à quel instant de leur source, pour composer l'instant t. */
  private frameAt(p: Project, t: number): Frame | null {
    const hit = clipAt(p.video, t);
    if (!hit) return null;
    const eps = 1 / p.fps, i = hit.index, c = hit.clip;
    // Instant de la source pour un instant local du clip ; un arrêt sur image reste sur son image.
    const src = (clip: Clip, local: number) => (clip.still ? clip.in : clip.in + local);
    const next = p.video[i + 1], prev = p.video[i - 1];
    if (c.transition && next) {
      const d = c.transition.dur, cut = hit.start + c.dur;
      if (t > cut - d / 2) return {
        a: { clip: c, index: i, start: hit.start, time: src(c, Math.min(hit.local, c.dur - eps)), live: true },
        b: { clip: next, index: i + 1, start: cut, time: next.in, live: false }, k: (t - (cut - d / 2)) / d,
      };
    }
    if (prev?.transition) {
      const d = prev.transition.dur, cut = hit.start;
      if (t < cut + d / 2) return {
        a: { clip: prev, index: i - 1, start: cut - prev.dur, time: src(prev, prev.dur - eps), live: false },
        b: { clip: c, index: i, start: cut, time: src(c, hit.local), live: true }, k: (t - (cut - d / 2)) / d,
      };
    }
    return { a: { clip: c, index: i, start: hit.start, time: src(c, Math.min(hit.local, c.dur)), live: true } };
  }
  /** Incrustations puis titres présents à l'instant t, du dessous vers le dessus. */
  private layersAt(p: Project, t: number): Layer[] {
    return [...(p.tracks.overlay?.hidden ? [] : activeAt(p.overlay, t)), ...(p.tracks.text?.hidden ? [] : activeAt(p.text, t))].filter(clip => !clip.off).map(clip => ({ clip, local: t - clip.start }));
  }

  private syncVideo(p: Project, f: Frame | null, layers: Layer[], t: number) {
    const wants = f ? (f.b ? [f.a, f.b] : [f.a]) : [];
    const active = new Set<string>();
    // Piste principale : le clip en cours donne l'heure, on ne le repositionne que sur demande.
    for (const w of wants) {
      const s = this.source(p, w.clip);
      active.add(w.clip.id);
      if (!s || s.kind !== 'video') continue;
      const el = s.el as HTMLVideoElement;
      el.volume = clamp(w.clip.volume * fadeGain(w.clip, w.time - w.clip.in), 0, 1);
      el.muted = this.muted || !w.live || w.clip.still || w.clip.off || !!p.tracks.video?.muted;
      if (w.live && this.playing && !w.clip.still) {
        if (el.paused) { if (el.ended || Math.abs(el.currentTime - w.time) > 0.05) el.currentTime = w.time; el.play().catch(() => {}); }
        else if (this.jumped && Math.abs(el.currentTime - w.time) > 0.05) el.currentTime = w.time;
      } else {
        if (!el.paused) el.pause();
        if (!el.seeking && Math.abs(el.currentTime - w.time) > 0.02) el.currentTime = w.time;
      }
      this.grab(s);
    }
    // Incrustations : elles suivent l'horloge du projet.
    for (const l of layers) {
      if (l.clip.text) continue;
      const s = this.source(p, l.clip);
      active.add(l.clip.id);
      if (!s || s.kind !== 'video') continue;
      const el = s.el as HTMLVideoElement, time = l.clip.in + l.local, off = Math.abs(el.currentTime - time);
      el.volume = clamp(l.clip.volume * fadeGain(l.clip, l.local), 0, 1);
      el.muted = this.muted || !!p.tracks.overlay?.muted;
      if (this.playing) {
        if (el.paused) { if (el.ended || off > 0.05) el.currentTime = time; el.play().catch(() => {}); }
        else if (off > (this.jumped ? 0.05 : 0.3)) el.currentTime = time;
      } else {
        if (!el.paused) el.pause();
        if (!el.seeking && off > 0.02) el.currentTime = time;
      }
      this.grab(s);
    }
    // Préchargement : clip principal suivant, incrustations qui arrivent dans les deux secondes.
    const near = new Set(active);
    const cur = wants.length ? wants[wants.length - 1].index : -1;
    const prime = (clip: Clip) => {
      near.add(clip.id);
      if (active.has(clip.id)) return;
      const s = this.source(p, clip);
      if (s?.kind === 'video') { const el = s.el as HTMLVideoElement; if (!el.paused) el.pause(); if (!el.seeking && Math.abs(el.currentTime - clip.in) > 0.02) el.currentTime = clip.in; }
    };
    if (cur >= 0 && p.video[cur + 1]) prime(p.video[cur + 1]);
    for (const c of p.overlay) if (c.start > t && c.start - t < 2) prime(c);
    if (cur >= 0) for (const i of [cur - 1, cur - 2, cur + 2]) if (p.video[i]) near.add(p.video[i].id);
    if (this.targetClipId) near.add(this.targetClipId);
    for (const [id, s] of this.sources) {
      if (!near.has(id)) { this.dropSource(id); continue; }
      if (!active.has(id) && s.kind === 'video') { const el = s.el as HTMLVideoElement; if (!el.paused) el.pause(); }
    }
  }

  private syncAudio(p: Project, t: number) {
    const all = [...p.audio, ...p.sound], active = new Set<string>();
    for (const clip of [...(p.tracks.audio?.muted ? [] : activeAt(p.audio, t)), ...(p.tracks.sound?.muted ? [] : activeAt(p.sound, t))].filter(c => !c.off)) {
      active.add(clip.id);
      let a = this.audios.get(clip.id);
      const media = p.media.find(m => m.id === clip.mediaId);
      if (a && media && a.dataset.url !== media.url) { a.pause(); this.audios.delete(clip.id); a = undefined; }
      if (!a && media?.url) { a = new Audio(media.url); a.preload = 'auto'; a.dataset.url = media.url; this.audios.set(clip.id, a); }
      if (!a) continue;
      const local = t - clip.start, time = clip.in + local;
      a.volume = clamp(clip.volume * fadeGain(clip, local), 0, 1); a.muted = this.muted;
      if (this.playing) { if (a.paused) { if (Math.abs(a.currentTime - time) > 0.05) a.currentTime = time; a.play().catch(() => {}); } else if (this.jumped || Math.abs(a.currentTime - time) > 0.5) a.currentTime = time; }
      else if (!a.paused) a.pause();
    }
    const ids = new Set(all.map(c => c.id));
    for (const [id, a] of this.audios) {
      if (!ids.has(id)) { a.pause(); a.removeAttribute('src'); this.audios.delete(id); }
      else if (!active.has(id) && !a.paused) a.pause();
    }
  }

  /* ---------- composition ---------- */
  private chainFor(clip: Clip, key: string): ChainItem[] {
    const ch: ChainItem[] = [], col = catalog.color;
    if (col && col.inputs.some(i => clip.color[i.NAME] !== undefined && clip.color[i.NAME] !== i.DEFAULT)) {
      const p = this.fxProg(col.id);
      if (p) ch.push({ p, params: { ...Object.fromEntries(col.inputs.map(i => [i.NAME, i.DEFAULT])), ...clip.color }, key: key + 'col' + clip.id });
    }
    for (const f of clip.fx) if (f.on) { const p = this.fxProg(f.effectId); if (p) ch.push({ p, params: f.params, key: key + f.uid }); }
    return ch;
  }
  private runChain(src: WebGLTexture, ch: ChainItem[], w: number, h: number, out: Target | null, set: TargetSet, time: number, progress: number) {
    if (!ch.length) { this.engine.blit(src, w, h, out); return; }
    ch.forEach((c, i) => {
      const o = i === ch.length - 1 ? out : set.ping[i % 2];
      // Numéro d'image déduit du temps du clip : un effet tiré au hasard par image (grain) donne le même résultat à l'aperçu et à l'export.
      this.engine.renderEffect(c.p, src, w, h, o, { time, progress, frame: Math.round(time * this.fps), key: c.key, params: c.params });
      if (o) src = o.tex;
    });
  }
  private clipFrame(clip: Clip, w: number, h: number, out: Target | null, set: TargetSet, key: string, time: number, extra?: ChainItem) {
    const s = this.sources.get(clip.id);
    if (!s || !s.loaded || clip.off) { this.engine.clear(w, h, out); return; }
    this.engine.drawFit(s.tex, s.w, s.h, w, h, set.fit, clip.transform);
    const ch = this.chainFor(clip, key);
    if (extra) ch.push(extra);
    const g = imageGain(clip, time), progress = clip.dur > 0 ? clamp(time / clip.dur, 0, 1) : 0;
    if (g >= 1) { this.runChain(set.fit.tex, ch, w, h, out, set, time, progress); return; }
    // Fondu de l'image : le clip, effets compris, est assombri vers le noir.
    if (!ch.length) { this.engine.blit(set.fit.tex, w, h, out, g); return; }
    this.runChain(set.fit.tex, ch, w, h, set.acc[1], set, time, progress);
    this.engine.blit(set.acc[1].tex, w, h, out, g);
  }
  /** Piste principale. Chaque clip reçoit son temps local : un effet animé redémarre au début de chaque clip. */
  private composeMain(f: Frame | null, w: number, h: number, out: Target | null, set: TargetSet, key: string, t: number, extra?: ChainItem) {
    if (!f) { this.engine.clear(w, h, out); return; }
    const local = (wn: Want) => clamp(t - wn.start, 0, wn.clip.dur);
    if (!f.b) { this.clipFrame(f.a.clip, w, h, out, set, key, local(f.a), extra); return; }
    const tr = f.a.clip.transition ? this.trProg(f.a.clip.transition.effectId) : null;
    this.clipFrame(f.a.clip, w, h, set.ra, set, key, local(f.a), f.a.live ? extra : undefined);
    this.clipFrame(f.b.clip, w, h, set.rb, set, key, local(f.b), f.b.live ? extra : undefined);
    if (tr) this.engine.renderTransition(tr, set.ra.tex, set.rb.tex, clamp(f.k ?? 0, 0, 1), w, h, out, f.a.clip.transition!.params);
    else this.engine.blit((f.k ?? 0) < 0.5 ? set.ra.tex : set.rb.tex, w, h, out);
  }

  /** Texture d'un titre, à la taille de son texte (et non du cadre : un long titre n'est jamais coupé quand on le déplace ou le réduit). */
  private textTexture(clip: Clip, h: number, chars: number): TextCache {
    let c = this.texts.get(clip.id);
    if (!c) { const canvas = document.createElement('canvas'); c = { canvas, ctx: canvas.getContext('2d')!, tex: this.engine.createTexture(), key: '', w: 1, h: 1 }; this.texts.set(clip.id, c); }
    const key = `${h}|${chars}|${JSON.stringify(clip.text)}`;
    if (c.key !== key) {
      const size = textSize(c.ctx, h, clip.text!);
      if (c.canvas.width !== size.w || c.canvas.height !== size.h) { c.canvas.width = size.w; c.canvas.height = size.h; }
      drawText(c.ctx, size.w, size.h, clip.text!, chars, h);
      this.engine.upload(c.tex, c.canvas);
      c.key = key; c.w = size.w; c.h = size.h;
    }
    return c;
  }
  private dropText(id: string) { const c = this.texts.get(id); if (c) { this.engine.deleteTexture(c.tex); c.canvas.width = 0; this.texts.delete(id); } }

  /** Compose l'instant t du projet vers out (ou le canvas). C'est le seul chemin de rendu : aperçu et export passent ici. */
  compose(f: Frame | null, layers: Layer[], w: number, h: number, out: Target | null, key: string, t: number, extra?: ChainItem) {
    const set = this.set(w, h);
    if (this.getProject().tracks.video?.hidden && !this.exportProject) f = null;
    else if (this.exportProject?.tracks.video?.hidden) f = null;
    // Seuls les titres à l'écran gardent leur image en mémoire : cent sous-titres ne coûtent pas cent textures.
    if (this.texts.size) { const shown = new Set(layers.filter(l => l.clip.text).map(l => l.clip.id)); for (const id of [...this.texts.keys()]) if (!shown.has(id)) this.dropText(id); }
    const visible = layers.filter(l => l.clip.text || this.sources.get(l.clip.id)?.loaded);
    if (!visible.length) { this.composeMain(f, w, h, out, set, key, t, extra); return; }
    this.composeMain(f, w, h, set.acc[0], set, key, t, extra);
    let base = set.acc[0];
    visible.forEach((l, i) => {
      const dst = i === visible.length - 1 ? out : base === set.acc[0] ? set.acc[1] : set.acc[0];
      const clip = l.clip;
      let top = set.fit.tex, opacity = clip.opacity * imageGain(clip, l.local);
      if (clip.text) {
        const a = animState(clip.text, l.local, clip.dur);
        opacity *= a.alpha;
        const tx = this.textTexture(clip, h, a.chars);
        this.engine.drawFit(tx.tex, tx.w, tx.h, w, h, set.fit, { ...clip.transform, scale: clip.transform.scale * a.scale, y: clip.transform.y + a.dy }, true, true);
      } else {
        const s = this.sources.get(clip.id)!;
        this.engine.drawFit(s.tex, s.w, s.h, w, h, set.fit, clip.transform, true);
        const ch = this.chainFor(clip, key);
        if (ch.length) { this.runChain(set.fit.tex, ch, w, h, set.ra, set, l.local, clamp(l.local / clip.dur, 0, 1)); top = set.ra.tex; }
      }
      // La couverture vient toujours de l'image d'origine : un effet change les couleurs de la couche, pas sa forme.
      this.engine.layer(base.tex, top, set.fit.tex, clamp(opacity, 0, 1), Math.max(0, BLEND_MODES.indexOf(clip.blend)), w, h, dst);
      if (dst) base = dst;
    });
  }

  /* ---------- vignettes et aperçu au survol ---------- */
  requestThumb(item: CatItem, ctx: CanvasRenderingContext2D) { this.queue.push({ item, ctx }); }
  clearThumbQueue() { this.queue.length = 0; }

  /** Images de départ et d'arrivée pour les aperçus : le clip visé et le suivant, sinon les images d'exemple. */
  private pair(p: Project, w: number, h: number, set: TargetSet): [WebGLTexture, WebGLTexture] {
    let i = p.video.findIndex(c => c.id === this.targetClipId);
    if (i < 0) i = clipAt(p.video, this.t)?.index ?? -1;
    const fit = (clip: Clip | undefined, fallback: WebGLTexture, into: Target) => {
      const s = clip ? this.sources.get(clip.id) : undefined;
      if (clip && s?.loaded) this.engine.drawFit(s.tex, s.w, s.h, w, h, into, clip.transform);
      else this.engine.drawFit(fallback, this.sample!.w, this.sample!.h, w, h, into);
      return into.tex;
    };
    // Une incrustation sélectionnée sert de modèle pour les aperçus d'effets.
    const over = p.overlay.find(c => c.id === this.targetClipId);
    return [fit(over ?? p.video[i], this.sample!.a, set.ra), fit(i >= 0 ? p.video[i + 1] : undefined, this.sample!.b, set.rb)];
  }
  private previewParams(e: CatEffect) { return e.preview ?? {}; }

  private drawThumb(p: Project, item: CatItem, ctx: CanvasRenderingContext2D, live: boolean, now: number) {
    if (!ctx.canvas.isConnected) return;
    const set = this.set(TW, TH), [a, b] = this.pair(p, TW, TH, set);
    if (item.kind === 'transition') {
      const pr = this.trProg(item.id); if (!pr) return;
      this.engine.renderTransition(pr, a, b, live ? clamp((now % 2.2) / 1.5, 0, 1) : 0.5, TW, TH, null);
    } else {
      const pr = this.fxProg(item.id); if (!pr) return;
      const params = this.previewParams(item);
      if (live) this.engine.renderEffect(pr, a, TW, TH, null, { time: now % 4, progress: (now % 4) / 4, frame: this.frameNo, key: 'hv', params });
      else {
        // Vignette fixe : parmi quelques instants du clip, on garde celui où l'effet se voit le plus
        // (un fondu, une secousse ou un zoom d'entrée sont invisibles à un instant pris au hasard).
        const still = item.thumb ? { ...params, ...item.thumb } : params;
        const shot = (time: number) => { for (let k = 0; k < 3; k++) this.engine.renderEffect(pr, a, TW, TH, null, { time: time + k / 30, progress: time / 4, frame: Math.round(time * 30) + k, key: 'th', params: still }); };
        let best = this.bestTime.get(item.id);
        if (best === undefined) {
          this.engine.blit(a, TW, TH, null);
          const ref = this.engine.readPixels(TW, TH, null);
          let top = -1; best = 1;
          for (const time of [1, 0.12, 0.45, 2.2, 3.6]) {
            shot(time);
            const px = this.engine.readPixels(TW, TH, null);
            let d = 0, lum = 0;
            for (let i = 0; i < px.length; i += 16) { d += Math.abs(px[i] - ref[i]) + Math.abs(px[i + 1] - ref[i + 1]) + Math.abs(px[i + 2] - ref[i + 2]); lum += px[i] + px[i + 1] + px[i + 2]; }
            if (lum > px.length / 16 * 18 && d > top * 1.25) { top = d; best = time; } // une image presque noire n'est pas représentative
          }
          if (top >= 0) this.bestTime.set(item.id, best); // sinon (image de référence noire) : on réessaiera
        }
        shot(best);
      }
    }
    this.engine.present(ctx, TW, TH);
  }

  /* ---------- boucle ---------- */
  private tick = (now: number) => {
    requestAnimationFrame(this.tick);
    const dt = Math.min(0.1, (now - this.last) / 1000 || 0);
    this.last = now;
    if (this.exporting) return;
    this.frameNo++;
    if (this.frameNo % 600 === 0) this.collect();
    const p = this.getProject(), total = projectDuration(p);
    this.fps = p.fps;
    if (this.t > total) this.t = total;
    // Après un déplacement, les effets à mémoire (écho, traînées) repartent de zéro plutôt que de mêler deux instants.
    if (this.jumped) for (const pr of this.progs.values()) if (pr.ok && pr.kind === 'effect' && pr.def.passes?.some(x => (x as { PERSISTENT?: unknown; persistent?: unknown }).PERSISTENT || (x as { persistent?: unknown }).persistent)) this.engine.releaseState(pr, 'v');

    // dimensions de l'aperçu selon le format du projet
    // Une image calculée plus petite que sa taille d'affichage est floue : l'aperçu est rendu à la taille où il est vu,
    // sans dépasser la résolution du projet (au-delà, il n'y a plus de détail à gagner).
    const want = this.quality === 'full' ? p.height : this.quality === 'half' ? p.height / 2 : this.quality === 'quarter' ? p.height / 4 : this.displayHeight;
    const vh = Math.max(TH, Math.min(p.height, this.quality === 'auto' ? PREVIEW_STEPS.find(s => s >= want) ?? 2160 : Math.round(want / 2) * 2));
    const vw = Math.max(TW, Math.round(vh * p.width / p.height / 2) * 2);
    if (vw !== this.vw || vh !== this.vh) {
      // Les tampons de l'ancienne taille sont rendus (cibles de rendu et mémoire des effets).
      const old = this.sets.get(this.vw + 'x' + this.vh);
      if (old && !(this.vw === TW && this.vh === TH)) { [old.fit, ...old.ping, old.ra, old.rb, old.out, ...old.acc].forEach(t => this.engine.freeTarget(t)); this.sets.delete(this.vw + 'x' + this.vh); }
      for (const pr of this.progs.values()) if (pr.ok && pr.kind === 'effect') this.engine.releaseState(pr, 'v');
      this.vw = vw; this.vh = vh; this.glc.width = vw; this.glc.height = vh;
    }
    if (this.view && (this.view.canvas.width !== vw || this.view.canvas.height !== this.vh)) { this.view.canvas.width = vw; this.view.canvas.height = this.vh; }

    // 1. Horloge : en lecture, la vidéo de la piste principale donne l'heure (image et son restent synchrones).
    //    Elle est lue avant toute synchronisation, pour voir une fin de fichier avant de la traiter comme une pause.
    if (this.playing && !this.jumped) {
      const f0 = this.frameAt(p, this.t), live = f0 ? (f0.b?.live ? f0.b : f0.a) : null, s = live ? this.sources.get(live.clip.id) : null;
      // La vidéo ne sert d'horloge que tant qu'on est avant la fin de son clip, et seulement si elle est lisible :
      // au-delà (musique ou titre plus long que l'image) ou sur un fichier illisible, l'horloge du système prend le relais.
      if (live && s?.kind === 'video' && !live.clip.still && this.t < live.start + live.clip.dur - 1e-6) {
        const el = s.el as HTMLVideoElement, end = live.start + live.clip.dur;
        if (el.error || el.networkState === el.NETWORK_NO_SOURCE) this.t += dt;
        else if (el.ended) this.t = end;
        else if (!el.paused && !el.seeking && el.readyState >= 3) {
          const local = el.currentTime - live.clip.in;
          this.t = local >= live.clip.dur - 0.5 / p.fps ? end : live.start + clamp(local, 0, live.clip.dur);
        }
      } else this.t += dt;
      if (this.t >= total - 1e-4) { this.t = total; this.pause(); }
    }
    // 2. Sources amenées à l'instant voulu.
    const f = this.frameAt(p, this.t), layers = this.layersAt(p, this.t);
    this.syncVideo(p, f, layers, this.t);
    this.syncAudio(p, this.t);
    this.jumped = false;

    // aperçu en grand d'un élément survolé, touche Alt
    const hv = this.hover;
    if (hv && this.alt && hv.item.kind === 'transition') {
      const set = this.set(this.vw, this.vh), pr = this.trProg(hv.item.id);
      if (pr) { const [a, b] = this.pair(p, this.vw, this.vh, set); this.engine.renderTransition(pr, a, b, clamp(((now / 1000) % 2.2) / 1.5, 0, 1), this.vw, this.vh, null); }
    } else {
      let extra: ChainItem | undefined;
      if (hv && this.alt && hv.item.kind !== 'transition') { const pr = this.fxProg(hv.item.id); if (pr) extra = { p: pr, params: this.previewParams(hv.item), key: 'alt' }; }
      this.compose(f, layers, this.vw, this.vh, null, 'v', this.t, extra);
    }
    if (this.view) this.engine.present(this.view, this.vw, this.vh);

    if (hv) this.drawThumb(p, hv.item, hv.ctx, true, now / 1000);
    const t0 = performance.now();
    while (this.queue.length && performance.now() - t0 < 10) { const q = this.queue.shift()!; this.drawThumb(p, q.item, q.ctx, false, 0); }
    this.onTime(this.t);
  };

  /** Libère les tampons des effets et les textures des titres retirés du projet. */
  private collect() {
    const p = this.getProject(), alive = new Set<string>(), texts = new Set(p.text.map(c => c.id));
    for (const c of [...p.video, ...p.overlay]) { alive.add('col' + c.id); for (const f of c.fx) alive.add(f.uid); }
    for (const pr of this.progs.values()) if (pr.ok && pr.kind === 'effect')
      for (const k of Object.keys(pr.state)) if (k.startsWith('v') && !alive.has(k.slice(1, k.lastIndexOf(':')))) this.engine.releaseState(pr, k);
    for (const id of [...this.texts.keys()]) if (!texts.has(id)) this.dropText(id);
  }

  /* ---------- export ---------- */
  /** Avant et après un export : repart de tampons d'effets vierges et rend la mémoire des images pleine taille. */
  resetExportState(w: number, h: number) {
    for (const pr of this.progs.values()) if (pr.ok && pr.kind === 'effect') this.engine.releaseState(pr, 'x');
    const key = w + 'x' + h, s = this.sets.get(key);
    if (s && !(w === this.vw && h === this.vh) && !(w === TW && h === TH)) { [s.fit, ...s.ping, s.ra, s.rb, s.out, ...s.acc].forEach(t => this.engine.freeTarget(t)); this.sets.delete(key); }
    for (const id of [...this.texts.keys()]) this.dropText(id); // les titres seront redessinés à la taille voulue
  }

  /** Amène les sources exactement à l'instant t puis rend l'image w×h. Renvoie les pixels RGBA, lignes de bas en haut. */
  async renderExact(p: Project, t: number, w: number, h: number, into: Uint8Array): Promise<Uint8Array> {
    const f = this.frameAt(p, t), layers = this.layersAt(p, t);
    const wants: { clip: Clip; time: number }[] = [...(f ? (f.b ? [f.a, f.b] : [f.a]) : []), ...layers.filter(l => !l.clip.text).map(l => ({ clip: l.clip, time: l.clip.in + l.local }))];
    // Seules les sources de l'image en cours restent ouvertes : un long projet n'accumule pas les décodeurs.
    const keep = new Set(wants.map(x => x.clip.id));
    for (const id of [...this.sources.keys()]) if (!keep.has(id)) this.dropSource(id);
    for (const wnt of wants) {
      const s = this.source(p, wnt.clip);
      if (!s) continue; // média introuvable : image noire, comme dans l'aperçu
      if (s.kind === 'image') { if (!s.loaded) await once(s.el, 'load', 5000); continue; }
      const el = s.el as HTMLVideoElement, name = p.media.find(m => m.id === wnt.clip.mediaId)?.name ?? 'média';
      el.pause(); el.muted = true;
      if (el.readyState < 1 && !el.error) await once(el, 'loadedmetadata', 8000);
      if (el.error || el.readyState < 1) throw new Error(`« ${name} » ne peut pas être lu (format non pris en charge ou fichier illisible).`);
      if (Math.abs(el.currentTime - wnt.time) > 0.0005 || el.readyState < 2) {
        el.currentTime = wnt.time;
        if (!await once(el, 'seeked', 10000)) throw new Error(`« ${name} » : la lecture n'a pas atteint l'instant demandé.`);
      }
      if (el.readyState < 2) await once(el, 'canplay', 3000);
      if (el.videoWidth) { this.engine.upload(s.tex, el); s.w = el.videoWidth; s.h = el.videoHeight; s.loaded = true; }
    }
    const set = this.set(w, h);
    this.fps = p.fps;
    this.exportProject = p; // posé au dernier moment : un échec en amont ne le laisse pas en place
    try { this.compose(f, layers, w, h, set.out, 'x', t); } finally { this.exportProject = null; }
    return this.engine.readPixels(w, h, set.out, into);
  }
}

export const player = new Player();
