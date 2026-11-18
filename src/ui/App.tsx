import { useEffect, useRef, useState } from 'react';
import { addFx, addOverlay, addText, appendClip, patchClip, setTransition } from '../core/ops';
import { defaultText } from '../core/types';
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
import { Splitter } from './Splitter';
import { DEFAULT_LAYOUT, useStore } from './store';
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
    // Un titre animé et une incrustation avec fondu sonore : toutes les pistes passent par l'export.
    st().apply(p => addText(p, { ...defaultText(), content: 'EZcut', animIn: 'pop' }, 0.5).project);
    const ov = addOverlay(st().project, media[media.length - 1].id, 1);
    if (ov) st().apply(() => patchClip(ov.project, ov.clipId, c => { c.dur = Math.min(c.dur, 2); c.fadeIn = 0.5; c.opacity = 0.8; }));
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
  const L = useStore(s => s.layout);
  const drag = useRef(0);

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
      if (st().exportOpen) return; // pendant un export, le projet ne doit pas changer
      const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
      if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? st().redo() : st().undo(); return; }
      if (mod && k === 'y') { e.preventDefault(); st().redo(); return; }
      if (mod && k === 's') { e.preventDefault(); void saveProject(e.shiftKey); return; }
      if (mod && k === 'o') { e.preventDefault(); void openProject(); return; }
      if (typing() || mod) return;
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
  // Les bornes des panneaux dépendent de la taille de la fenêtre.
  const [, redraw] = useState(0);
  useEffect(() => { const f = () => redraw(n => n + 1); addEventListener('resize', f); return () => removeEventListener('resize', f); }, []);
  useEffect(() => { document.title = `${dirty ? '• ' : ''}${name} — EZcut`; }, [name, dirty]);

  const st = useStore.getState;
  const setL = st().setLayout;
  const clampN = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
  // Bibliothèque et inspecteur : largeur réglable, masquables, interchangeables de côté.
  const side = (slot: 'left' | 'right') => {
    const left = slot === 'left', which = left !== L.swap ? 'lib' : 'insp';
    const show = which === 'lib' ? L.showLib : L.showInsp, key = which === 'lib' ? 'libW' : 'inspW';
    if (!show) return null;
    const min = which === 'lib' ? 280 : 240, max = Math.max(min, Math.min(900, innerWidth - 700));
    const panel = <div className="pane" style={{ width: Math.min(L[key], max) }}>{which === 'lib' ? <Library /> : <Inspector />}</div>;
    const split = <Splitter dir="col" label={which === 'lib' ? 'Largeur de la bibliothèque' : 'Largeur de l’inspecteur'} onReset={() => setL({ [key]: DEFAULT_LAYOUT[key] })}
      onDrag={(d, start) => { if (start) drag.current = Math.min(st().layout[key], max); setL({ [key]: clampN(drag.current + (left ? d : -d), min, max) }); }} />;
    return left ? <>{panel}{split}</> : <>{split}{panel}</>;
  };
  const leftShown = L.swap ? L.showInsp : L.showLib, rightShown = L.swap ? L.showLib : L.showInsp;
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
        <span className="tb">
          <button className="ib" aria-pressed={leftShown} title="Afficher ou masquer le panneau de gauche" aria-label="Panneau de gauche" onClick={() => setL(L.swap ? { showInsp: !L.showInsp } : { showLib: !L.showLib })}><Icon name="pl" /></button>
          <button className="ib" aria-pressed={L.showTl} title="Afficher ou masquer la timeline" aria-label="Timeline" onClick={() => setL({ showTl: !L.showTl })}><Icon name="pb" /></button>
          <button className="ib" aria-pressed={rightShown} title="Afficher ou masquer le panneau de droite" aria-label="Panneau de droite" onClick={() => setL(L.swap ? { showLib: !L.showLib } : { showInsp: !L.showInsp })}><Icon name="pr" /></button>
          <button className="ib" title="Échanger les panneaux gauche et droite" aria-label="Échanger les panneaux" onClick={() => setL({ swap: !L.swap })}><Icon name="swap" /></button>
          <button className="ib" title="Rétablir la disposition par défaut" aria-label="Disposition par défaut" onClick={() => setL(DEFAULT_LAYOUT)}><Icon name="reset" /></button>
          <span className="sep" />
        </span>
        <button className="ib" title="Thème clair / sombre" aria-label="Thème clair ou sombre" onClick={() => st().set({ light: !st().light })}><Icon name="sun" /></button>
        <button className="btn primary" onClick={() => { player.pause(); st().set({ exportOpen: true }); }}><Icon name="export" />Exporter</button>
      </header>
      <div className="work">
        {side('left')}
        <Viewer />
        {side('right')}
      </div>
      {L.showTl && <>
        <Splitter dir="row" label="Hauteur de la timeline" onReset={() => setL({ tlH: DEFAULT_LAYOUT.tlH })}
          onDrag={(d, start) => { if (start) drag.current = st().layout.tlH; setL({ tlH: clampN(drag.current - d, 150, Math.max(150, innerHeight - 260)) }); }} />
        <Timeline height={Math.min(L.tlH, Math.max(150, innerHeight - 260))} />
      </>}
      {exportOpen && <ExportDialog />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
