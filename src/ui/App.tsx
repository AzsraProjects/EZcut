import { useEffect } from 'react';
import { appendClip, setTransition, addFx } from '../core/ops';
import { ez } from '../desktop/api';
import { catalog, defaultsOf, loadCatalog, transitionDefaults } from '../effects/catalog';
import { player } from '../engine/player';
import { exportProject } from '../export/exporter';
import { deleteSelection, newProject, openProject, saveProject, splitAtPlayhead } from './actions';
import { ExportDialog } from './ExportDialog';
import { Icon } from './Icon';
import { Inspector } from './Inspector';
import { Library } from './Library';
import { importFiles, registerMedia } from './media';
import { useStore } from './store';
import { emitTime } from './time';
import { Timeline } from './Timeline';
import { Viewer } from './Viewer';

/** Test d'intégration sans interface (EZCUT_AUTOTEST) : importe, monte, pose effet et transition, exporte, puis quitte. */
async function runAutoTest() {
  const cfg = await ez?.autoTest();
  if (!ez || !cfg) return;
  const done = (r: unknown) => ez!.autoTestDone(r);
  try {
    const media = registerMedia(await ez.importPaths(cfg.media));
    if (!media.length) return done({ ok: false, error: 'aucun média importé' });
    const st = useStore.getState;
    media.forEach(m => { const r = appendClip(st().project, m.id); if (r) st().apply(() => r.project); });
    const v = st().project.video, fx = catalog.effects.find(e => e.id === 'isf:VHS Glitch') ?? catalog.effects[0], tr = catalog.transitions.find(t => t.id === 'glt:CrossZoom') ?? catalog.transitions[0];
    if (v[0] && fx) st().apply(p => addFx(p, v[0].id, fx.id, defaultsOf(fx)));
    if (v.length > 1 && tr) st().apply(p => setTransition(p, v[0].id, { effectId: tr.id, params: transitionDefaults(tr), dur: 1 }));
    const r = await exportProject(st().project, { height: 720, fps: 30 }, () => {}, () => false, cfg.out);
    done({ ...r, clips: st().project.video.length, fx: fx?.id, transition: tr?.id, effects: catalog.effects.length, filters: catalog.filters.length, transitions: catalog.transitions.length });
  } catch (e) { done({ ok: false, error: String((e as Error).stack ?? e) }); }
}

export function App() {
  const light = useStore(s => s.light);
  const toast = useStore(s => s.toast);
  const name = useStore(s => s.project.name);
  const dirty = useStore(s => s.dirty);
  const canUndo = useStore(s => s.past.length > 0);
  const canRedo = useStore(s => s.future.length > 0);
  const exportOpen = useStore(s => s.exportOpen);

  useEffect(() => {
    const st = useStore.getState;
    if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__ez = { player, useStore }; // accès console en développement
    player.getProject = () => st().project;
    player.onTime = emitTime;
    player.onPlayState = playing => st().set({ playing });
    let pending = 0;
    player.onSourceReady = () => { clearTimeout(pending); pending = window.setTimeout(() => st().set({ thumbEpoch: st().thumbEpoch + 1 }), 120); };
    try { player.init(); } catch { st().notify('WebGL2 est indisponible : l\'aperçu ne peut pas s\'afficher.'); }
    loadCatalog().then(() => { st().set({ catalogReady: true }); void runAutoTest(); }).catch(() => st().notify('La banque d\'effets n\'a pas pu être chargée.'));
    const unsub = useStore.subscribe(s => { player.targetClipId = s.sel?.kind === 'clip' ? s.sel.id : null; });

    const typing = () => /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName ?? '');
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Alt') { player.alt = true; if (player.hover) e.preventDefault(); return; }
      const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
      if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? st().redo() : st().undo(); return; }
      if (mod && k === 'y') { e.preventDefault(); st().redo(); return; }
      if (mod && k === 's') { e.preventDefault(); void saveProject(e.shiftKey); return; }
      if (mod && k === 'o') { e.preventDefault(); void openProject(); return; }
      if (typing() || mod || st().exportOpen) return;
      if (e.code === 'Space') { e.preventDefault(); (document.activeElement as HTMLElement | null)?.blur?.(); player.toggle(); }
      else if (k === 's') splitAtPlayhead();
      else if (e.key === 'Delete' || e.key === 'Backspace') deleteSelection();
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); player.pause(); player.seek(player.t + (e.key === 'ArrowLeft' ? -1 : 1) / st().project.fps * (e.shiftKey ? 10 : 1)); }
      else if (e.key === 'Home') player.seek(0);
    };
    const onKeyUp = (e: KeyboardEvent) => { if (e.key === 'Alt') { player.alt = false; e.preventDefault(); } };
    const onBlur = () => { player.alt = false; };
    const onDragOver = (e: DragEvent) => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault(); };
    const onDrop = (e: DragEvent) => { if (e.dataTransfer?.files.length) { e.preventDefault(); void importFiles([...e.dataTransfer.files]).then(m => { if (m.length) st().setTab('media'); }); } };
    addEventListener('keydown', onKey); addEventListener('keyup', onKeyUp); addEventListener('blur', onBlur);
    addEventListener('dragover', onDragOver); addEventListener('drop', onDrop);
    return () => { unsub(); removeEventListener('keydown', onKey); removeEventListener('keyup', onKeyUp); removeEventListener('blur', onBlur); removeEventListener('dragover', onDragOver); removeEventListener('drop', onDrop); };
  }, []);

  useEffect(() => { document.documentElement.classList.toggle('ez-light', light); }, [light]);
  useEffect(() => { document.title = `${dirty ? '• ' : ''}${name} — EZcut`; }, [name, dirty]);

  const st = useStore.getState;
  return (
    <div className="app">
      <header className="top">
        <span className="logo"><i><Icon name="play" fill /></i>EZcut</span>
        <span className="tb">
          <button className="ib" title="Nouveau projet" aria-label="Nouveau projet" onClick={newProject}><Icon name="file" /></button>
          <button className="ib" title="Ouvrir un projet (Ctrl+O)" aria-label="Ouvrir un projet" onClick={() => void openProject()}><Icon name="folder" /></button>
          <button className="ib" title="Enregistrer (Ctrl+S)" aria-label="Enregistrer" onClick={() => void saveProject()}><Icon name="save" /></button>
          <span className="sep" />
          <button className="ib" title="Annuler (Ctrl+Z)" aria-label="Annuler" disabled={!canUndo} onClick={() => st().undo()}><Icon name="undo" /></button>
          <button className="ib" title="Rétablir (Ctrl+Y)" aria-label="Rétablir" disabled={!canRedo} onClick={() => st().redo()}><Icon name="redo" /></button>
        </span>
        <span className="proj">
          <span className={dirty ? 'saved no' : 'saved'} title={dirty ? 'Modifications non enregistrées' : 'Enregistré'} />
          <input className="pname" aria-label="Nom du projet" value={name} onChange={e => st().apply(p => ({ ...p, name: e.target.value }), false)} />
        </span>
        <button className="ib" title="Thème clair / sombre" aria-label="Thème clair ou sombre" onClick={() => st().set({ light: !st().light })}><Icon name="sun" /></button>
        <button className="btn primary" onClick={() => { player.pause(); st().set({ exportOpen: true }); }}><Icon name="export" />Exporter</button>
      </header>
      <div className="work">
        <Library />
        <Viewer />
        <Inspector />
      </div>
      <Timeline />
      {exportOpen && <ExportDialog />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
