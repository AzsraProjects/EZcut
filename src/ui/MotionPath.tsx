/** Trajet du mouvement du clip sélectionné, dessiné par-dessus l'aperçu : la courbe en pointillés et ses points,
 *  qu'on déplace à la souris. Un clic sur un point y amène la tête de lecture. */
import { useEffect, useMemo, useState, type RefObject } from 'react';
import { KEY_SNAP, motionAt } from '../core/motion';
import { usePlayhead } from './motion';
import { findClip, isSound, patchClip } from '../core/ops';
import { player } from '../engine/player';
import { useStore } from './store';

const st = () => useStore.getState();

export function MotionPath({ canvas }: { canvas: RefObject<HTMLCanvasElement | null> }) {
  // Sélecteurs à valeur stable (identifiant, tableau de points, début) : un objet neuf à chaque lecture ferait boucler le rendu.
  const id = useStore(s => (s.sel?.kind === 'clip' ? s.sel.id : null));
  const found = useStore(s => (id ? findClip(s.project, id) : null)?.clip);
  const start = useStore(s => (id ? findClip(s.project, id)?.start ?? 0 : 0));
  const track = useStore(s => (id ? findClip(s.project, id)?.track : undefined));
  const clip = found && track && !isSound(track) && found.keys?.length ? { clip: found, start } : null;
  const now = usePlayhead(!!clip);
  const sel = useStore(s => s.motionKey), aspect = useStore(s => s.project.width / s.project.height), rec = useStore(s => s.motionRec);
  // Rectangle de l'image affichée dans le canvas (letterbox compris), relatif à la scène.
  const [box, setBox] = useState<{ l: number; t: number; w: number; h: number } | null>(null);
  useEffect(() => {
    const el = canvas.current;
    if (!el || !clip) return;
    const measure = () => {
      const r = el.getBoundingClientRect(), p = el.parentElement!.getBoundingClientRect();
      const w = Math.min(r.width, r.height * aspect), h = w / aspect;
      setBox({ l: r.left - p.left + (r.width - w) / 2, t: r.top - p.top + (r.height - h) / 2, w, h });
    };
    const ro = new ResizeObserver(measure); ro.observe(el); measure();
    return () => ro.disconnect();
  }, [canvas, clip !== null, aspect]);
  // Trajet recalculé seulement quand les points ou la taille de l'aperçu changent (pas à chaque image de la lecture),
  // et limité à la durée du clip.
  const pts = useMemo(() => {
    if (!found?.keys?.length || !box) return '';
    const keys = found.keys, t0 = Math.max(0, keys[0].t), t1 = Math.min(found.dur, keys[keys.length - 1].t);
    if (keys.length < 2 || t1 <= t0) return '';
    const n = Math.max(2, Math.min(240, Math.round((t1 - t0) * 30)));
    return Array.from({ length: n + 1 }, (_, i) => { const m = motionAt(found, t0 + (t1 - t0) * i / n).transform; return `${((0.5 + m.x) * box.w).toFixed(1)},${((0.5 - m.y) * box.h).toFixed(1)}`; }).join(' ');
  }, [found, box]);
  if (!clip || !box) return null;
  const keys = clip.clip.keys!, c = clip.clip;
  const sx = (x: number) => (0.5 + x) * box.w, sy = (y: number) => (0.5 - y) * box.h;
  // Un point caché sous l'image à la tête de lecture laisse passer le clic : glisser l'image y pose un nouveau point
  // au lieu de déplacer un point d'un autre instant.
  const local = now - clip.start, cur = motionAt(c, local).transform;
  const under = (i: number) => Math.abs(keys[i].t - local) > KEY_SNAP && Math.hypot(sx(keys[i].x) - sx(cur.x), sy(keys[i].y) - sy(cur.y)) < 18;
  const grab = (i: number) => (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation(); e.preventDefault();
    const el = e.currentTarget as SVGElement, k = keys[i], x0 = e.clientX, y0 = e.clientY, id = c.id;
    let moved = false;
    el.setPointerCapture(e.pointerId);
    st().set({ motionKey: i });
    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 3) return;
      if (!moved) { moved = true; st().checkpoint(); player.pause(); }
      const x = Math.max(-1.5, Math.min(1.5, k.x + (ev.clientX - x0) / box.w)), y = Math.max(-1.5, Math.min(1.5, k.y - (ev.clientY - y0) / box.h));
      st().apply(p => patchClip(p, id, cl => { if (cl.keys?.[i]) { cl.keys[i].x = x; cl.keys[i].y = y; } }), false);
    };
    const up = () => {
      el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up);
      if (!moved) { player.pause(); player.seek(clip.start + k.t); }
    };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  };
  return (
    <svg className={rec ? 'mpath rec' : 'mpath'} style={{ left: box.l, top: box.t, width: box.w, height: box.h }} viewBox={`0 0 ${box.w} ${box.h}`} aria-hidden={rec}>
      {pts && <polyline points={pts} />}
      {!rec && keys.map((k, i) => k.t >= -1e-6 && k.t <= c.dur + 1e-6 && (
        <rect key={i} className={[i === sel ? 'on' : '', under(i) ? 'pass' : ''].join(' ').trim() || undefined} x={sx(k.x) - 7} y={sy(k.y) - 7} width={14} height={14} rx={2}
          transform={`rotate(45 ${sx(k.x)} ${sy(k.y)})`} onPointerDown={grab(i)}>
          <title>{`Point à ${k.t.toFixed(2)} s — glisser : déplacer · clic : y aller`}</title>
        </rect>
      ))}
    </svg>
  );
}
