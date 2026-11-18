import { useEffect, useRef, useState } from 'react';
import { findClip, patchClip, projectDuration, trackStarts } from '../core/ops';
import { player, type PreviewQuality } from '../engine/player';
import { Icon } from './Icon';
import { useStore } from './store';
import { subscribeTime, timecode } from './time';

export function Viewer() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const cur = useRef<HTMLElement>(null);
  const lastWheel = useRef(0);
  const playing = useStore(s => s.playing);
  const fps = useStore(s => s.project.fps);
  const total = useStore(s => projectDuration(s.project));
  const empty = useStore(s => projectDuration(s.project) === 0);
  const [muted, setMuted] = useState(false);

  useEffect(() => { player.setView(canvas.current); return () => player.setView(null); }, []);
  // L'aperçu est calculé à la taille où il est réellement affiché (panneau × densité de l'écran) : il reste net quand on l'agrandit.
  const aspect = useStore(s => s.project.width / s.project.height);
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const measure = () => { const r = el.getBoundingClientRect(); player.displayHeight = Math.max(1, Math.min(r.height, r.width / aspect)) * (window.devicePixelRatio || 1); };
    const ro = new ResizeObserver(measure);
    ro.observe(el); measure();
    addEventListener('resize', measure); // changement d'écran ou de zoom du système
    return () => { ro.disconnect(); removeEventListener('resize', measure); };
  }, [aspect]);
  const [quality, setQuality] = useState<PreviewQuality>('auto');
  const movable = useStore(s => { const f = s.sel?.kind === 'clip' ? findClip(s.project, s.sel.id) : null; return !!f && f.track !== 'audio'; });

  // Dans l'aperçu, le clip sélectionné se déplace à la souris et se redimensionne à la molette.
  const target = () => { const s = useStore.getState(), f = s.sel?.kind === 'clip' ? findClip(s.project, s.sel.id) : null; return f && f.track !== 'audio' ? f.clip : null; };
  const drag = (e: React.PointerEvent) => {
    const clip = target(), el = e.currentTarget as HTMLElement;
    if (!clip || e.button !== 0) return;
    const s = useStore.getState(), p = s.project, r = el.getBoundingClientRect(), ar = p.width / p.height;
    const dw = Math.min(r.width, r.height * ar), dh = dw / ar; // taille réelle de l'image affichée dans le canvas
    const x0 = e.clientX, y0 = e.clientY, tx = clip.transform.x, ty = clip.transform.y, id = clip.id;
    s.checkpoint(); el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => useStore.getState().apply(q => patchClip(q, id, c => { c.transform.x = Math.max(-1.5, Math.min(1.5, tx + (ev.clientX - x0) / dw)); c.transform.y = Math.max(-1.5, Math.min(1.5, ty - (ev.clientY - y0) / dh)); }), false);
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  };
  const wheel = (e: React.WheelEvent) => {
    const clip = target();
    if (!clip) return;
    const s = useStore.getState(), id = clip.id, now = performance.now();
    if (now - lastWheel.current > 800) s.checkpoint(); // une série de crans rapprochés = un seul geste
    lastWheel.current = now;
    s.apply(q => patchClip(q, id, c => { c.transform.scale = Math.max(0.05, Math.min(8, c.transform.scale * (e.deltaY < 0 ? 1.05 : 1 / 1.05))); }), false);
  };
  useEffect(() => subscribeTime(t => { if (cur.current) cur.current.textContent = timecode(t, fps); }), [fps]);

  const jump = (dir: -1 | 1) => {
    const p = useStore.getState().project, cuts = [...trackStarts(p.video), projectDuration(p)];
    const t = dir < 0 ? [...cuts].reverse().find(c => c < player.t - 0.05) ?? 0 : cuts.find(c => c > player.t + 0.05) ?? projectDuration(p);
    player.seek(t);
  };

  return (
    <section className="viewer">
      <div className="stage">
        <canvas ref={canvas} width={960} height={540} className={movable ? 'movable' : undefined} onPointerDown={drag} onWheel={wheel} title={movable ? 'Glisser pour déplacer le clip sélectionné, molette pour le redimensionner' : undefined} />
        {empty && <div className="stage-empty">Importez un média puis ajoutez-le à la timeline pour commencer.</div>}
      </div>
      <div className="transport">
        <span className="tc"><b ref={cur}>00:00:00</b> <span>/ {timecode(total, fps)}</span></span>
        <span className="ctl">
          <button className="ib" aria-label="Coupe précédente" title="Coupe précédente" onClick={() => jump(-1)}><Icon name="prev" fill /></button>
          <button className="ib big" aria-label={playing ? 'Pause' : 'Lecture'} title="Lecture / pause (Espace)" onClick={() => player.toggle()}><Icon name={playing ? 'pause' : 'play'} fill /></button>
          <button className="ib" aria-label="Coupe suivante" title="Coupe suivante" onClick={() => jump(1)}><Icon name="next" fill /></button>
        </span>
        <button className="ib" aria-label={muted ? 'Activer le son' : 'Couper le son'} title="Couper ou rétablir le son de l'aperçu" onClick={() => { player.muted = !muted; setMuted(!muted); }}><Icon name={muted ? 'mute' : 'vol'} /></button>
        <select className="sel" aria-label="Qualité de l'aperçu" title="Qualité de l'aperçu. Automatique : nette à la taille affichée. Réduire soulage un ordinateur qui peine à lire en fluide." value={quality} onChange={e => { const q = e.target.value as PreviewQuality; setQuality(q); player.quality = q; }}>
          <option value="auto">Qualité : auto</option><option value="full">Pleine</option><option value="half">1/2</option><option value="quarter">1/4</option>
        </select>
        <button className="ib" aria-label="Plein écran" title="Plein écran" onClick={() => { void canvas.current?.requestFullscreen?.().catch(() => {}); }}><Icon name="full" /></button>
      </div>
    </section>
  );
}
