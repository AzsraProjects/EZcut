/** Lecture et composition : calcule l'image du projet à un instant donné, pour l'aperçu, les vignettes et l'export. */
import { clipAt, projectDuration } from '../core/ops';
import { emptyProject, type Clip, type Project } from '../core/types';
import { catalog, type CatEffect, type CatItem, type CatTransition } from '../effects/catalog';
import { Engine, type EffectProgram, type Failed, type Target, type TransitionProgram } from './gl';

export const TW = 240, TH = 135;
const PREVIEW_H = 540;

interface Source { url: string; kind: 'video' | 'image'; el: HTMLVideoElement | HTMLImageElement; tex: WebGLTexture; w: number; h: number; loaded: boolean; }
interface Want { clip: Clip; index: number; start: number; time: number; live: boolean; }
interface TargetSet { fit: Target; ping: [Target, Target]; ra: Target; rb: Target; out: Target; }
interface ChainItem { p: EffectProgram; params: Record<string, unknown>; key: string; }
interface Frame { a: Want; b?: Want; k?: number; }

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
  vw = 960; vh = PREVIEW_H;

  private glc!: HTMLCanvasElement;
  private view: CanvasRenderingContext2D | null = null;
  private sources = new Map<string, Source>();
  private audios = new Map<string, HTMLAudioElement>();
  private progs = new Map<string, EffectProgram | TransitionProgram | Failed>();
  private sets = new Map<string, TargetSet>();
  private sample: { a: WebGLTexture; b: WebGLTexture; w: number; h: number } | null = null;
  private queue: { item: CatItem; ctx: CanvasRenderingContext2D }[] = [];
  private frameNo = 0;
  private last = 0;
  private started = false;
  /** Vrai entre un déplacement de la tête de lecture et la synchronisation suivante. */
  private jumped = false;

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
      s = { fit: mk(), ping: [mk(), mk()], ra: mk(), rb: mk(), out: mk() };
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

  /** Quels clips faut-il, et à quel instant de leur source, pour composer l'instant t. */
  private frameAt(p: Project, t: number): Frame | null {
    const hit = clipAt(p.video, t);
    if (!hit) return null;
    const eps = 1 / p.fps, i = hit.index, c = hit.clip;
    const next = p.video[i + 1], prev = p.video[i - 1];
    if (c.transition && next) {
      const d = c.transition.dur, cut = hit.start + c.dur;
      if (t > cut - d / 2) return {
        a: { clip: c, index: i, start: hit.start, time: c.in + Math.min(hit.local, c.dur - eps), live: true },
        b: { clip: next, index: i + 1, start: cut, time: next.in, live: false }, k: (t - (cut - d / 2)) / d,
      };
    }
    if (prev?.transition) {
      const d = prev.transition.dur, cut = hit.start;
      if (t < cut + d / 2) return {
        a: { clip: prev, index: i - 1, start: cut - prev.dur, time: prev.in + prev.dur - eps, live: false },
        b: { clip: c, index: i, start: cut, time: c.in + hit.local, live: true }, k: (t - (cut - d / 2)) / d,
      };
    }
    return { a: { clip: c, index: i, start: hit.start, time: c.in + Math.min(hit.local, c.dur), live: true } };
  }

  private syncVideo(p: Project, f: Frame | null) {
    const wants = f ? (f.b ? [f.a, f.b] : [f.a]) : [];
    const keep = new Set(wants.map(w => w.clip.id));
    for (const w of wants) {
      const s = this.source(p, w.clip);
      if (!s || s.kind !== 'video') continue;
      const el = s.el as HTMLVideoElement;
      el.volume = clamp(w.clip.volume, 0, 1);
      el.muted = this.muted || !w.live;
      if (w.live && this.playing) {
        if (el.paused) { if (el.ended || Math.abs(el.currentTime - w.time) > 0.05) el.currentTime = w.time; el.play().catch(() => {}); }
        // En lecture, la vidéo est l'horloge : on ne la repositionne que sur un déplacement demandé par l'utilisateur.
        else if (this.jumped && Math.abs(el.currentTime - w.time) > 0.05) el.currentTime = w.time;
      } else {
        if (!el.paused) el.pause();
        if (!el.seeking && Math.abs(el.currentTime - w.time) > 0.02) el.currentTime = w.time;
      }
      if (el.readyState >= 2 && el.videoWidth) { this.engine.upload(s.tex, el); s.w = el.videoWidth; s.h = el.videoHeight; if (!s.loaded) { s.loaded = true; this.onSourceReady(); } }
    }
    // Clip suivant préchargé ; les autres sont mis en pause, les plus lointains libérés.
    const cur = wants.length ? wants[wants.length - 1].index : -1;
    const ahead = p.video[cur + 1];
    if (ahead && !keep.has(ahead.id)) { const s = this.source(p, ahead); if (s?.kind === 'video') { const el = s.el as HTMLVideoElement; if (!el.paused) el.pause(); if (!el.seeking && Math.abs(el.currentTime - ahead.in) > 0.02) el.currentTime = ahead.in; } }
    const index = new Map(p.video.map((c, i) => [c.id, i]));
    for (const [id, s] of this.sources) {
      const i = index.get(id);
      if (i === undefined || (cur >= 0 && Math.abs(i - cur) > 2 && id !== this.targetClipId)) { this.dropSource(id); continue; }
      if (!keep.has(id) && s.kind === 'video' && id !== ahead?.id) { const el = s.el as HTMLVideoElement; if (!el.paused) el.pause(); }
    }
  }

  private syncAudio(p: Project, t: number) {
    const hit = clipAt(p.audio, t), activeId = hit && t < hit.start + hit.clip.dur ? hit.clip.id : null;
    if (hit && activeId) {
      let a = this.audios.get(activeId);
      if (!a) { const media = p.media.find(m => m.id === hit.clip.mediaId); if (media) { a = new Audio(media.url); a.preload = 'auto'; this.audios.set(activeId, a); } }
      if (a) {
        const time = hit.clip.in + hit.local;
        a.volume = clamp(hit.clip.volume, 0, 1); a.muted = this.muted;
        if (this.playing) { if (a.paused) { if (Math.abs(a.currentTime - time) > 0.05) a.currentTime = time; a.play().catch(() => {}); } else if (this.jumped || Math.abs(a.currentTime - time) > 1) a.currentTime = time; }
        else { if (!a.paused) a.pause(); }
      }
    }
    const ids = new Set(p.audio.map(c => c.id));
    for (const [id, a] of this.audios) {
      if (!ids.has(id)) { a.pause(); a.removeAttribute('src'); this.audios.delete(id); }
      else if (id !== activeId && !a.paused) a.pause();
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
      this.engine.renderEffect(c.p, src, w, h, o, { time, progress, frame: this.frameNo, key: c.key, params: c.params });
      if (o) src = o.tex;
    });
  }
  private clipFrame(p: Project, clip: Clip, w: number, h: number, out: Target | null, set: TargetSet, key: string, time: number, extra?: ChainItem) {
    const s = this.sources.get(clip.id);
    if (!s || !s.loaded) { this.engine.clear(w, h, out); return; }
    this.engine.drawFit(s.tex, s.w, s.h, w, h, set.fit, clip.transform);
    const ch = this.chainFor(clip, key);
    if (extra) ch.push(extra);
    this.runChain(set.fit.tex, ch, w, h, out, set, time, clip.dur > 0 ? clamp(time / clip.dur, 0, 1) : 0);
  }

  /** Compose l'instant t du projet vers out (ou le canvas). C'est le seul chemin de rendu : aperçu et export passent ici.
   *  Chaque clip reçoit son temps local : un effet animé redémarre au début de chaque clip. */
  compose(p: Project, f: Frame | null, w: number, h: number, out: Target | null, key: string, t: number, extra?: ChainItem) {
    const local = (wn: Want) => clamp(t - wn.start, 0, wn.clip.dur);
    const set = this.set(w, h);
    if (!f) { this.engine.clear(w, h, out); return; }
    if (!f.b) { this.clipFrame(p, f.a.clip, w, h, out, set, key, local(f.a), extra); return; }
    const tr = f.a.clip.transition ? this.trProg(f.a.clip.transition.effectId) : null;
    this.clipFrame(p, f.a.clip, w, h, set.ra, set, key, local(f.a), f.a.live ? extra : undefined);
    this.clipFrame(p, f.b.clip, w, h, set.rb, set, key, local(f.b), f.b.live ? extra : undefined);
    if (tr) this.engine.renderTransition(tr, set.ra.tex, set.rb.tex, clamp(f.k ?? 0, 0, 1), w, h, out, f.a.clip.transition!.params);
    else this.engine.blit((f.k ?? 0) < 0.5 ? set.ra.tex : set.rb.tex, w, h, out);
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
    return [fit(p.video[i], this.sample!.a, set.ra), fit(i >= 0 ? p.video[i + 1] : undefined, this.sample!.b, set.rb)];
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
      const n = live ? 1 : 4;
      for (let k = 0; k < n; k++) this.engine.renderEffect(pr, a, TW, TH, null, { time: live ? now % 4 : 1 + k / 30, progress: live ? (now % 4) / 4 : 0.6, frame: this.frameNo + k, key: live ? 'hv' : 'th', params: this.previewParams(item) });
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
    if (this.frameNo % 600 === 0) this.collectEffectState();
    const p = this.getProject(), total = projectDuration(p);
    if (this.t > total) this.t = total;

    // dimensions de l'aperçu selon le format du projet
    const vw = Math.max(TW, Math.round(PREVIEW_H * p.width / p.height / 2) * 2);
    if (vw !== this.vw) { this.vw = vw; this.glc.width = vw; }
    if (this.view && (this.view.canvas.width !== vw || this.view.canvas.height !== this.vh)) { this.view.canvas.width = vw; this.view.canvas.height = this.vh; }

    // 1. Horloge : en lecture, la vidéo en cours donne l'heure (image et son restent synchrones). Sans vidéo, l'horloge du système.
    //    Elle est lue avant toute synchronisation, pour voir une fin de fichier avant de la traiter comme une pause.
    if (this.playing && !this.jumped) {
      const f0 = this.frameAt(p, this.t), live = f0 ? (f0.b?.live ? f0.b : f0.a) : null, s = live ? this.sources.get(live.clip.id) : null;
      // La vidéo ne sert d'horloge que tant qu'on est avant la fin de son clip, et seulement si elle est lisible :
      // au-delà (musique plus longue que l'image) ou sur un fichier illisible, l'horloge du système prend le relais.
      if (live && s?.kind === 'video' && this.t < live.start + live.clip.dur - 1e-6) {
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
    const f = this.frameAt(p, this.t);
    this.syncVideo(p, f);
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
      this.compose(p, f, this.vw, this.vh, null, 'v', this.t, extra);
    }
    if (this.view) this.engine.present(this.view, this.vw, this.vh);

    if (hv) this.drawThumb(p, hv.item, hv.ctx, true, now / 1000);
    const t0 = performance.now();
    while (this.queue.length && performance.now() - t0 < 10) { const q = this.queue.shift()!; this.drawThumb(p, q.item, q.ctx, false, 0); }
    this.onTime(this.t);
  };

  /* ---------- export ---------- */
  /** Avant et après un export : repart de tampons d'effets vierges et rend la mémoire des images pleine taille. */
  resetExportState(w: number, h: number) {
    for (const pr of this.progs.values()) if (pr.ok && pr.kind === 'effect') this.engine.releaseState(pr, 'x');
    const key = w + 'x' + h, s = this.sets.get(key);
    if (s && !(w === this.vw && h === this.vh) && !(w === TW && h === TH)) { [s.fit, ...s.ping, s.ra, s.rb, s.out].forEach(t => this.engine.freeTarget(t)); this.sets.delete(key); }
  }
  /** Libère les tampons des effets retirés du projet. */
  private collectEffectState() {
    const p = this.getProject(), alive = new Set<string>();
    for (const c of p.video) { alive.add('col' + c.id); for (const f of c.fx) alive.add(f.uid); }
    for (const pr of this.progs.values()) if (pr.ok && pr.kind === 'effect')
      for (const k of Object.keys(pr.state)) if (k.startsWith('v') && !alive.has(k.slice(1, k.lastIndexOf(':')))) this.engine.releaseState(pr, k);
  }
  /** Amène les sources exactement à l'instant t puis rend l'image w×h. Renvoie les pixels RGBA, lignes de bas en haut. */
  async renderExact(p: Project, t: number, w: number, h: number, into: Uint8Array): Promise<Uint8Array> {
    const f = this.frameAt(p, t), wants = f ? (f.b ? [f.a, f.b] : [f.a]) : [];
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
    this.frameNo = Math.round(t * p.fps); // numéro d'image stable, indépendant de la vitesse de rendu
    this.compose(p, f, w, h, set.out, 'x', t);
    return this.engine.readPixels(w, h, set.out, into);
  }
}

export const player = new Player();
