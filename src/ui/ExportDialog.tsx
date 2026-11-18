import { useRef, useState } from 'react';
import { projectDuration } from '../core/ops';
import { ez } from '../desktop/api';
import { exportProject, exportSize, type ExportResult } from '../export/exporter';
import { Icon } from './Icon';
import { useStore } from './store';
import { timecode } from './time';

export function ExportDialog() {
  const project = useStore(s => s.project);
  const [height, setHeight] = useState(1080);
  const [fps, setFps] = useState(project.fps);
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const [result, setResult] = useState<ExportResult | null>(null);
  const cancel = useRef(false);
  const duration = projectDuration(project), size = exportSize(project, height);
  const running = !!progress && !result;
  const close = () => { if (!running) useStore.getState().set({ exportOpen: false }); };

  const start = async () => {
    cancel.current = false; setResult(null); setProgress([0, 1]);
    const r = await exportProject(project, { height, fps }, (d, t) => setProgress([d, t]), () => cancel.current);
    if (r.cancelled) { setProgress(null); setResult(null); return; }
    setResult(r);
  };

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Exporter la vidéo" onPointerDown={e => { if (e.target === e.currentTarget) close(); }}>
      <div className="dialog">
        <header><b>Exporter la vidéo</b><button className="ib small" aria-label="Fermer" disabled={running} onClick={close}><Icon name="x" /></button></header>
        {!ez && <p className="warn">L'export n'est disponible que dans l'application de bureau.</p>}
        {!duration && <p className="warn">La timeline est vide : ajoutez au moins un clip.</p>}
        {!running && !result?.ok && <>
          <label className="row"><span>Format</span><span className="fixed">MP4 · H.264 · AAC</span></label>
          <label className="row"><span>Résolution</span><select className="sel" value={height} onChange={e => setHeight(+e.target.value)}>
            {[720, 1080, 1440, 2160].map(h => { const s = exportSize(project, h); return <option key={h} value={h}>{h === 2160 ? '4K' : h + 'p'} — {s.width} × {s.height}</option>; })}</select></label>
          <label className="row"><span>Cadence</span><select className="sel" value={fps} onChange={e => setFps(+e.target.value)}>{[24, 25, 30, 50, 60].map(f => <option key={f} value={f}>{f} images/s</option>)}</select></label>
          <p className="meta">{timecode(duration, fps)} · {size.width} × {size.height} · {Math.round(duration * fps)} images</p>
          {result && !result.ok && <p className="warn">L'export a échoué. {result.error}</p>}
          <footer><button className="btn" onClick={close}>Annuler</button><button className="btn primary" disabled={!ez || !duration} onClick={() => void start()}><Icon name="export" />Exporter</button></footer>
        </>}
        {running && progress && <>
          <p className="meta">Rendu de l'image {progress[0]} sur {progress[1]}…</p>
          <div className="bar"><i style={{ width: `${progress[0] / progress[1] * 100}%` }} /></div>
          <footer><button className="btn" onClick={() => { cancel.current = true; }}>Annuler l'export</button></footer>
        </>}
        {result?.ok && <>
          <p className="done">Vidéo exportée en {result.seconds?.toFixed(1)} s.</p>
          <p className="meta path">{result.path}</p>
          <footer><button className="btn" onClick={() => { if (result.path) void ez?.showInFolder(result.path); }}><Icon name="folder" />Afficher dans le dossier</button><button className="btn primary" onClick={close}>Terminer</button></footer>
        </>}
      </div>
    </div>
  );
}
