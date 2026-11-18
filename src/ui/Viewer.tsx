import { useEffect, useRef, useState } from 'react';
import { findClip, isSound, patchClip, projectDuration } from '../core/ops';
import { player, type PreviewQuality } from '../engine/player';
import { hasMotion, motionAt } from '../core/motion';
import { jumpCut, snapshot } from './actions';
import { keyNow, localOf, mimicEnd, mimicSample, mimicStart, motionTarget, setMimic } from './motion';
import { MotionPath } from './MotionPath';
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
  const movable = useStore(s => { const f = s.sel?.kind === 'clip' ? findClip(s.project, s.sel.id) : null; return !!f && !isSound(f.track); });

  // Dans l'aperçu, le clip sélectionné se déplace à la souris et se redimensionne à la molette.
  const drag = (e: React.PointerEvent) => {
    const tg = motionTarget(), el = e.currentTarget as HTMLElement;
    if (!tg || e.button !== 0) return;
    const { clip, start } = tg, animated = hasMotion(clip);
    const s = useStore.getState(), p = s.project, r = el.getBoundingClientRect(), ar = p.width / p.height;
    const dw = Math.min(r.width, r.height * ar), dh = dw / ar; // taille réelle de l'image affichée dans le canvas
    const local = localOf(clip, start), now = motionAt(clip, local).transform;
    const x0 = e.clientX, y0 = e.clientY, tx = now.x, ty = now.y, id = clip.id;
    const at = (ev: PointerEvent | React.PointerEvent) => ({ x: Math.max(-1.5, Math.min(1.5, tx + (ev.clientX - x0) / dw)), y: Math.max(-1.5, Math.min(1.5, ty - (ev.clientY - y0) / dh)) });
    el.setPointerCapture(e.pointerId);
    let move: (ev: PointerEvent) => void, done = () => {};
    if (s.motionRec) {
      // Mimer : la lecture tourne au ralenti et l'image suit la main jusqu'au relâchement.
      mimicStart(id);
      move = ev => { const q = at(ev); mimicSample(id, q.x, q.y); };
      move(e.nativeEvent);
      done = () => mimicEnd(id);
    } else if (animated) {
      // Clip animé : le glissement pose (ou modifie) le point du mouvement à la tête de lecture.
      if (player.t < start - 1e-6 || player.t > start + clip.dur + 1e-6) { s.notify('Placez la tête de lecture sur le clip pour régler son mouvement à cet instant.'); return; }
      player.pause(); s.checkpoint();
      move = ev => keyNow(id, at(ev), false);
    } else {
      s.checkpoint();
      move = ev => useStore.getState().apply(q => patchClip(q, id, c => { const v = at(ev); c.transform.x = v.x; c.transform.y = v.y; }), false);
    }
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); done(); };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  };
  const wheel = (e: React.WheelEvent) => {
    const tg = motionTarget();
    if (!tg) return;
    const s = useStore.getState(), id = tg.clip.id, now = performance.now(), k = e.deltaY < 0 ? 1.05 : 1 / 1.05;
    if (now - lastWheel.current > 800) s.checkpoint(); // une série de crans rapprochés = un seul geste
    lastWheel.current = now;
    if (hasMotion(tg.clip)) { player.pause(); keyNow(id, { scale: Math.max(0.05, Math.min(8, motionAt(tg.clip, localOf(tg.clip, tg.start)).transform.scale * k)) }, false); return; }
    s.apply(q => patchClip(q, id, c => { c.transform.scale = Math.max(0.05, Math.min(8, c.transform.scale * k)); }), false);
  };
  const rec = useStore(s => s.motionRec);
  useEffect(() => {
    if (!rec) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMimic(false); };
    addEventListener('keydown', esc, true); return () => removeEventListener('keydown', esc, true);
  }, [rec]);
  useEffect(() => subscribeTime(t => { if (cur.current) cur.current.textContent = timecode(t, fps); }), [fps]);

  const fullscreen = () => { void canvas.current?.requestFullscreen?.().catch(() => {}); };
  useEffect(() => { addEventListener('ezcut:fullscreen', fullscreen); return () => removeEventListener('ezcut:fullscreen', fullscreen); }, []);

  return (
    <section className="viewer">
      <div className="stage">
        <canvas ref={canvas} width={960} height={540} className={rec ? 'movable rec' : movable ? 'movable' : undefined} onPointerDown={drag} onWheel={wheel} title={rec ? "Mimer : appuyez et bougez, l'image suit la souris" : movable ? 'Glisser pour déplacer le clip sélectionné, molette pour le redimensionner. Avec un mouvement : pose un point à la tête de lecture.' : undefined} />
        <MotionPath canvas={canvas} />
        {rec && <div className="mimic-badge" role="status"><i />Mimer — ralenti × 0,5 · Échap pour quitter</div>}
        {empty && <div className="stage-empty">Importez un média puis ajoutez-le à la timeline pour commencer.</div>}
      </div>
      <div className="transport">
        <span className="tc"><b ref={cur}>00:00:00</b> <span>/ {timecode(total, fps)}</span></span>
        <span className="ctl">
          <button className="ib" aria-label="Coupe précédente" title="Coupe précédente (↑)" onClick={() => jumpCut(-1)}><Icon name="prev" fill /></button>
          <button className="ib big" aria-label={playing ? 'Pause' : 'Lecture'} title="Lecture / pause (Espace)" onClick={() => player.toggle()}><Icon name={playing ? 'pause' : 'play'} fill /></button>
          <button className="ib" aria-label="Coupe suivante" title="Coupe suivante (↓)" onClick={() => jumpCut(1)}><Icon name="next" fill /></button>
        </span>
        <button className="ib" aria-label={muted ? 'Activer le son' : 'Couper le son'} title="Couper ou rétablir le son de l'aperçu" onClick={() => { player.muted = !muted; setMuted(!muted); }}><Icon name={muted ? 'mute' : 'vol'} /></button>
        <select className="sel" aria-label="Qualité de l'aperçu" title="Qualité de l'aperçu. Automatique : nette à la taille affichée. Réduire soulage un ordinateur qui peine à lire en fluide." value={quality} onChange={e => { const q = e.target.value as PreviewQuality; setQuality(q); player.quality = q; }}>
          <option value="auto">Qualité : auto</option><option value="full">Pleine</option><option value="half">1/2</option><option value="quarter">1/4</option>
        </select>
        <button className="ib" aria-label="Enregistrer cette image" title="Enregistrer l'image affichée en PNG (Ctrl+Alt+S)" disabled={empty} onClick={() => void snapshot()}><Icon name="camera" /></button>
        <button className="ib" aria-label="Plein écran" title="Plein écran (Alt+Entrée)" onClick={fullscreen}><Icon name="full" /></button>
      </div>
    </section>
  );
}
