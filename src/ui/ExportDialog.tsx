import { useEffect, useRef, useState } from 'react';
import { projectDuration } from '../core/ops';
import { ez } from '../desktop/api';
import { exportProject, exportSize, type ExportResult } from '../export/exporter';
import { linkCancel } from './control';
import { Icon } from './Icon';
import { useStore } from './store';
import { timecode } from './time';

export function ExportDialog() {
  const project = useStore(s => s.project);
  const [height, setHeight] = useState(1080);
  const [fps, setFps] = useState(project.fps);
  const [codec, setCodec] = useState<'h264' | 'hevc'>('h264');
  const [software, setSoftware] = useState(false);
  const [hw, setHw] = useState<{ h264: string | null; hevc: string | null }>({ h264: null, hevc: null });
  useEffect(() => { void ez?.encoders().then(setHw).catch(() => {}); }, []);
  const HW_NAMES: Record<string, string> = { nvenc: 'NVIDIA', qsv: 'Intel', amf: 'AMD' };
  const gpu = hw[codec];
  const [own, setProgress] = useState<[number, number] | null>(null);
  // Un export lancé par le lien de pilotage s'affiche ici comme un export lancé à la main.
  const link = useStore(s => s.linkExport);
  const progress = link ?? own;
  const [result, setResult] = useState<ExportResult | null>(null);
  const cancel = useRef(false);
  const started = useRef(0);
  // Un export de Claude qui démarre efface le résultat précédent encore affiché.
  useEffect(() => { if (link && link[0] === 0) { started.current = performance.now(); setResult(null); setProgress(null); } }, [link]);
  const duration = projectDuration(project), size = exportSize(project, height);
  const running = !!link || (!!own && !result);
  const pct = progress ? progress[0] / progress[1] : 0;
  const left = pct > 0.02 ? (performance.now() - started.current) / 1000 * (1 - pct) / pct : NaN;
  const eta = Number.isNaN(left) ? '' : left < 50 ? `· environ ${Math.max(5, Math.ceil(left / 5) * 5)} s restantes` : `· environ ${Math.ceil(left / 60)} min restante${left >= 90 ? 's' : ''}`;
  const close = () => { if (!running) useStore.getState().set({ exportOpen: false }); };

  const start = async () => {
    cancel.current = false; setResult(null); setProgress([0, 1]); started.current = performance.now();
    const r = await exportProject(project, { height, fps, codec, software }, (d, t) => setProgress([d, t]), () => cancel.current);
    if (r.cancelled) { setProgress(null); setResult(null); return; }
    setResult(r);
  };

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Exporter la vidéo" onPointerDown={e => { if (e.target === e.currentTarget) close(); }} onKeyDown={e => { if (e.key === 'Escape') close(); }}>
      <div className="dialog">
        <header><b>Exporter la vidéo</b><button className="ib small" aria-label="Fermer" disabled={running} onClick={close}><Icon name="x" /></button></header>
        {!ez && <p className="warn">L'export n'est disponible que dans l'application de bureau.</p>}
        {!duration && <p className="warn">La timeline est vide : ajoutez au moins un clip.</p>}
        {link && <p className="meta">Export demandé par Claude.</p>}
        {!running && !result?.ok && <>
          <label className="row"><span>Format</span><select className="sel" value={codec} onChange={e => setCodec(e.target.value as 'h264' | 'hevc')}>
            <option value="h264">MP4 · H.264 — compatible partout</option><option value="hevc">MP4 · H.265 — fichier plus léger</option></select></label>
          <label className="row"><span>Encodage</span><select className="sel" value={software || !gpu ? 'cpu' : 'gpu'} onChange={e => setSoftware(e.target.value === 'cpu')}>
            {gpu && <option value="gpu">Carte graphique {HW_NAMES[gpu] ?? gpu} — rapide</option>}<option value="cpu">Processeur — plus lent</option></select></label>
          <label className="row"><span>Résolution</span><select className="sel" value={height} onChange={e => setHeight(+e.target.value)}>
            {[720, 1080, 1440, 2160].map(h => { const s = exportSize(project, h); return <option key={h} value={h}>{h === 2160 ? '4K' : h + 'p'} — {s.width} × {s.height}</option>; })}</select></label>
          <label className="row"><span>Cadence</span><select className="sel" value={fps} onChange={e => setFps(+e.target.value)}>{[24, 25, 30, 50, 60].map(f => <option key={f} value={f}>{f} images/s</option>)}</select></label>
          <p className="meta">{timecode(duration, fps)} · {size.width} × {size.height} · {Math.round(duration * fps)} images</p>
          {result && !result.ok && <p className="warn">L'export a échoué. {result.error}</p>}
          <footer><button className="btn" onClick={close}>Annuler</button><button className="btn primary" autoFocus disabled={!ez || !duration} onClick={() => void start()}><Icon name="export" />Exporter</button></footer>
        </>}
        {running && progress && <>
          <p className="meta">{Math.floor(pct * 100)} % {eta}</p>
          <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.floor(pct * 100)} aria-label="Avancement de l'export"><i style={{ width: `${pct * 100}%` }} /></div>
          <footer><button className="btn" onClick={() => { if (link) linkCancel.on = true; else cancel.current = true; }}>Annuler l'export</button></footer>
        </>}
        {result?.ok && <>
          <p className="done">Vidéo exportée en {result.seconds?.toFixed(1)} s.</p>
          <p className="meta path">{result.path}</p>
          <footer><button className="btn" onClick={() => { void ez?.showLastExport(); }}><Icon name="folder" />Afficher dans le dossier</button><button className="btn primary" autoFocus onClick={close}>Terminer</button></footer>
        </>}
      </div>
    </div>
  );
}
