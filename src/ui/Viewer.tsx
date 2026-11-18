import { useEffect, useRef, useState } from 'react';
import { projectDuration, trackStarts } from '../core/ops';
import { player } from '../engine/player';
import { Icon } from './Icon';
import { useStore } from './store';
import { subscribeTime, timecode } from './time';

export function Viewer() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const cur = useRef<HTMLElement>(null);
  const playing = useStore(s => s.playing);
  const fps = useStore(s => s.project.fps);
  const total = useStore(s => projectDuration(s.project));
  const empty = useStore(s => s.project.video.length === 0);
  const [muted, setMuted] = useState(false);

  useEffect(() => { player.setView(canvas.current); return () => player.setView(null); }, []);
  useEffect(() => subscribeTime(t => { if (cur.current) cur.current.textContent = timecode(t, fps); }), [fps]);

  const jump = (dir: -1 | 1) => {
    const p = useStore.getState().project, cuts = [...trackStarts(p.video), projectDuration(p)];
    const t = dir < 0 ? [...cuts].reverse().find(c => c < player.t - 0.05) ?? 0 : cuts.find(c => c > player.t + 0.05) ?? projectDuration(p);
    player.seek(t);
  };

  return (
    <section className="viewer">
      <div className="stage">
        <canvas ref={canvas} width={960} height={540} />
        {empty && <div className="stage-empty">Importez un média puis ajoutez-le à la timeline pour commencer.</div>}
      </div>
      <div className="transport">
        <span className="tc"><b ref={cur}>00:00:00</b> <span>/ {timecode(total, fps)}</span></span>
        <span className="ctl">
          <button className="ib" aria-label="Coupe précédente" title="Coupe précédente" onClick={() => jump(-1)}><Icon name="prev" fill /></button>
          <button className="ib big" aria-label={playing ? 'Pause' : 'Lecture'} title="Lecture / pause (Espace)" onClick={() => player.toggle()}><Icon name={playing ? 'pause' : 'play'} fill /></button>
          <button className="ib" aria-label="Coupe suivante" title="Coupe suivante" onClick={() => jump(1)}><Icon name="next" fill /></button>
        </span>
        <button className="ib" aria-label={muted ? 'Activer le son' : 'Couper le son'} title="Son" onClick={() => { player.muted = !muted; setMuted(!muted); }}><Icon name={muted ? 'mute' : 'vol'} /></button>
        <button className="ib" aria-label="Plein écran" title="Plein écran" onClick={() => { void canvas.current?.requestFullscreen?.().catch(() => {}); }}><Icon name="full" /></button>
      </div>
    </section>
  );
}
