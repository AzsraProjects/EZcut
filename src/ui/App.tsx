import { useCallback, useEffect, useRef, useState } from 'react';
import { addFx, addOverlay, addText, appendClip, patchClip, setTransition } from '../core/ops';
import { defaultText } from '../core/types';
import { ez } from '../desktop/api';
import { catalog, defaultsOf, loadCatalog, transitionDefaults } from '../effects/catalog';
import { player } from '../engine/player';
import { exportProject } from '../export/exporter';
import { addMarkerAtPlayhead, deleteSelection, selectAll, jumpClipEdge, jumpCut, jumpMarker, loadProject, newProject, openProject, saveProject, serialise, snapshot, splitAtPlayhead, zoomTimeline } from './actions';
import { MarkerDialog } from './MarkerDialog';
import { ExportDialog } from './ExportDialog';
import { Welcome } from './Welcome';
import { Updates } from './Updates';
import { ClaudeLink } from './ClaudeLink';
import { ContextMenu } from './ContextMenu';
import { copyClip, copyEffects, detachSound, duplicateSelection, freezeFrame, pasteClip, pasteEffects, rotateClip, toggleMute, trimToPlayhead } from './menus';
import { connectControl } from './control';
import { captureErrors, log } from './log';
import { Icon } from './Icon';
import { Inspector } from './Inspector';
import { Library } from './Library';
import { importFiles, importWithDialog, registerMedia } from './media';
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
    const r = await exportProject(st().project, { height: cfg.height ?? 720, fps: 30, codec: cfg.codec }, () => {}, () => false, cfg.out);
    done({ ...r, clips: st().project.video.length, fx: fx?.id, transition: tr?.id, effects: catalog.effects.length, filters: catalog.filters.length, transitions: catalog.transitions.length });
  } catch (e) { done({ ok: false, error: String((e as Error).stack ?? e) }); }
}

export function App() {
  const light = useStore(s => s.light);
  const toast = useStore(s => s.toast);
  const toastUndo = useStore(s => s.toastUndo);
  const name = useStore(s => s.project.name);
  const dirty = useStore(s => s.dirty);
  const canUndo = useStore(s => s.past.length > 0);
  const canRedo = useStore(s => s.future.length > 0);
  const exportOpen = useStore(s => s.exportOpen);
  const L = useStore(s => s.layout);
  const [recovered, setRecovered] = useState<{ savedAt: number; json: string } | null>(null);
  // Accueil au lancement (application de bureau seulement), après la question d'un projet à restaurer s'il y en a un.
  const [welcome, setWelcome] = useState(!!ez);
  const closeWelcome = useCallback(() => setWelcome(false), []);
  const [linkOpen, setLinkOpen] = useState(false);
  const drag = useRef(0);

  useEffect(() => {
    const st = useStore.getState;
    if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__ez = { player, useStore }; // accès console en développement
    player.getProject = () => st().project;
    player.onTime = emitTime;
    player.onPlayState = playing => st().set({ playing });
    let pending = 0;
    player.onSourceReady = () => { clearTimeout(pending); pending = window.setTimeout(() => st().set({ thumbEpoch: st().thumbEpoch + 1 }), 120); };
    captureErrors();
    player.onLog = (msg, data) => log.warn('moteur', msg, data);
    try { player.init(); } catch (e) { log.error('moteur', 'initialisation impossible', String(e)); st().notify('WebGL2 est indisponible : l\'aperçu ne peut pas s\'afficher.'); }
    connectControl();
    loadCatalog().then(async () => {
      st().set({ catalogReady: true });
      log.info('catalogue', 'chargé', { effets: catalog.effects.length, filtres: catalog.filters.length, transitions: catalog.transitions.length });
      void runAutoTest();
      // Un projet non enregistré d'une session précédente (plantage, coupure) est proposé à la restauration.
      const saved = await ez?.autosaveRead();
      if (saved) setRecovered(saved);
    }).catch(e => { log.error('catalogue', 'chargement impossible', String(e)); st().notify('La banque d\'effets n\'a pas pu être chargée.'); });
    const unsub = useStore.subscribe((s, prev) => {
      player.targetClipId = s.sel?.kind === 'clip' ? s.sel.id : null;
      if (s.dirty !== prev.dirty) { void ez?.setDirty(s.dirty); if (!s.dirty) void ez?.autosaveClear(); }
    });
    // Sauvegarde automatique, toutes les 20 secondes si le projet a changé depuis la dernière :
    // - un projet qui a déjà son fichier y est réenregistré (réglable dans le panneau Projet) ;
    // - sinon, une copie de secours est gardée, proposée à la restauration après une fermeture inattendue.
    // Jamais au milieu d'un geste (bouton de la souris enfoncé) ni pendant un export.
    let lastSaved: unknown = null, held = false, writing = false;
    const down = () => { held = true; }, up = () => { held = false; };
    addEventListener('pointerdown', down, true); addEventListener('pointerup', up, true); addEventListener('pointercancel', up, true);
    const autosave = window.setInterval(() => {
      const s = st();
      if (!ez || !s.dirty || s.project === lastSaved || s.exportOpen || held || writing) return;
      const project = s.project, json = serialise(project);
      lastSaved = project;
      if (s.filePath && s.autoSaveFile) {
        writing = true;
        void ez.autosaveProject(json).then(path => {
          // Le projet a pu changer pendant l'écriture : il reste alors « non enregistré ».
          if (path && st().project === project) st().saved(path);
          else if (!path) void ez!.autosaveWrite(json);
        }, e => { log.error('projet', 'enregistrement automatique impossible', String(e)); void ez!.autosaveWrite(json); }).finally(() => { writing = false; });
      } else void ez.autosaveWrite(json);
    }, 20000);
    ez?.onSaveAndClose(async () => { if (await saveProject()) await ez!.closeWindow(); });

    // On « écrit » seulement dans un champ de texte ou une liste : un curseur ou une case à cocher ne bloque pas les raccourcis.
    const typing = () => { const a = document.activeElement as HTMLInputElement | null; return !!a && (a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || (a.tagName === 'INPUT' && !['range', 'checkbox', 'color'].includes(a.type))); };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Alt') { player.alt = true; if (player.hover) e.preventDefault(); return; }
      if (st().exportOpen || st().markerEdit) return; // pendant un export, le projet ne doit pas changer ; un dialogue ouvert garde le clavier
      const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
      if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? st().redo() : st().undo(); return; }
      if (mod && k === 'y') { e.preventDefault(); st().redo(); return; }
      if (mod && e.altKey && k === 's' && !typing()) { e.preventDefault(); if (!e.repeat) void snapshot(); return; }
      if (mod && k === 's') { e.preventDefault(); void saveProject(e.shiftKey); return; }
      if (mod && k === 'o') { e.preventDefault(); void openProject(); return; }
      if (mod && !e.altKey && !typing()) {
        if (k === 'n') { e.preventDefault(); void newProject(); return; }
        if (k === 'i') { e.preventDefault(); void importWithDialog().then(m => { if (m.length) st().setTab('media'); }); return; }
        if (k === 'e') { e.preventDefault(); player.pause(); st().set({ exportOpen: true }); return; }
        if (k === '=' || k === '+') { e.preventDefault(); zoomTimeline(1.25); return; }
        if (k === '-') { e.preventDefault(); zoomTimeline(0.8); return; }
      }
      if (e.altKey && !mod && e.key === 'Enter') { e.preventDefault(); dispatchEvent(new Event('ezcut:fullscreen')); return; }
      if (mod && e.altKey && !typing()) {
        const s = st().sel;
        if (k === 'c') { e.preventDefault(); copyEffects(); return; }
        if (k === 'v') { e.preventDefault(); pasteEffects(); return; }
        if (e.key === 'ArrowRight' && s?.kind === 'clip') { e.preventDefault(); rotateClip(s.id, -90); return; }
        if (e.key === 'ArrowLeft' && s?.kind === 'clip') { e.preventDefault(); rotateClip(s.id, 90); return; }
      }
      if (mod && !typing()) {
        if (k === 'a') { e.preventDefault(); selectAll(); return; }
        if (k === 'b') { e.preventDefault(); splitAtPlayhead(); return; }
        if (k === 'c') { e.preventDefault(); copyClip(); return; }
        if (k === 'x') { e.preventDefault(); copyClip(true); return; }
        if (k === 'v') { e.preventDefault(); pasteClip(); return; }
        if (k === 'd' && !e.altKey) { e.preventDefault(); duplicateSelection(); return; }
        if (k === 'm' && e.shiftKey) { e.preventDefault(); const s = st().sel; if (s?.kind === 'clip') toggleMute(s.id); return; }
      }
      if (e.altKey && k === 'f' && !typing()) { e.preventDefault(); freezeFrame(); return; }
      if (e.altKey && !mod && !typing() && (e.code === 'BracketLeft' || e.code === 'BracketRight')) { e.preventDefault(); trimToPlayhead(e.code === 'BracketLeft' ? 'start' : 'end'); return; }
      if (mod && e.altKey && k === 'd' && !typing()) { e.preventDefault(); detachSound(); return; }
      if (typing() || mod || e.altKey) return;
      const active = document.activeElement as HTMLElement | null, onRange = (active as HTMLInputElement | null)?.type === 'range';
      if (e.code === 'Space') {
        if (active?.tagName === 'BUTTON' && active.matches(':focus-visible')) return; // au clavier, Espace active le bouton ciblé
        e.preventDefault(); if (onRange) active?.blur(); player.toggle();
      }
      else if (e.key.startsWith('Arrow') && onRange) return; // les flèches règlent le curseur ciblé
      else if (k === 's') splitAtPlayhead();
      else if (k === 'c') { st().set({ tool: 'razor' }); st().notify('Outil lame : cliquez sur un clip pour le couper. Échap ou V pour revenir à la sélection.'); }
      else if (e.key === 'Escape' && st().tool === 'select') st().select(null); // Échap : outil lame → sélection, puis tout désélectionner
      else if (k === 'v' || e.key === 'Escape') st().set({ tool: 'select' });
      else if (k === 'n') { const on = !st().snap; st().set({ snap: on }); st().notify(on ? 'Aimantation activée.' : 'Aimantation désactivée.'); }
      else if (k === 'm') addMarkerAtPlayhead();
      else if (k === 'z' && e.shiftKey) dispatchEvent(new Event('ezcut:fit'));
      else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); const dir = e.key === 'ArrowUp' ? -1 : 1; e.shiftKey ? jumpMarker(dir) : jumpCut(dir); }
      else if (k === 'q') trimToPlayhead('start');
      else if (k === 'w') trimToPlayhead('end');
      else if (e.key === 'Delete' || e.key === 'Backspace') deleteSelection(e.shiftKey);
      // Une image à la fois ; avec Maj, une seconde.
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); player.pause(); player.seek(player.t + (e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 1 : 1 / st().project.fps)); }
      else if (e.key === 'Home') e.shiftKey ? jumpClipEdge('start') : player.seek(0);
      else if (e.key === 'End') e.shiftKey ? jumpClipEdge('end') : player.seek(1e9);
    };
    const onKeyUp = (e: KeyboardEvent) => { if (e.key === 'Alt') { player.alt = false; e.preventDefault(); } };
    const onBlur = () => { player.alt = false; };
    let dropTimer = 0;
    const dropping = (on: boolean) => document.documentElement.classList.toggle('dropping', on);
    const onDragOver = (e: DragEvent) => { if (e.dataTransfer?.types.includes('Files')) { e.preventDefault(); dropping(true); clearTimeout(dropTimer); dropTimer = window.setTimeout(() => dropping(false), 200); } };
    const onDrop = (e: DragEvent) => { dropping(false); if (e.dataTransfer?.files.length) { e.preventDefault(); void importFiles([...e.dataTransfer.files]).then(m => { if (m.length) st().setTab('media'); }); } };
    addEventListener('keydown', onKey); addEventListener('keyup', onKeyUp); addEventListener('blur', onBlur);
    addEventListener('dragover', onDragOver); addEventListener('drop', onDrop);
    return () => { unsub(); clearInterval(autosave); removeEventListener('pointerdown', down, true); removeEventListener('pointerup', up, true); removeEventListener('pointercancel', up, true); removeEventListener('keydown', onKey); removeEventListener('keyup', onKeyUp); removeEventListener('blur', onBlur); removeEventListener('dragover', onDragOver); removeEventListener('drop', onDrop); };
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
          <button className="ib" title="Nouveau projet (Ctrl+N)" aria-label="Nouveau projet" onClick={() => void newProject()}><Icon name="file" /></button>
          <button className="ib" title="Ouvrir un projet (Ctrl+O)" aria-label="Ouvrir un projet" onClick={() => void openProject()}><Icon name="folder" /></button>
          <button className="ib" title="Enregistrer (Ctrl+S) — Maj + clic : enregistrer sous" aria-label="Enregistrer" onClick={e => void saveProject(e.shiftKey)}><Icon name="save" /></button>
          <span className="sep" />
          <button className="ib" title="Annuler (Ctrl+Z)" aria-label="Annuler" disabled={!canUndo} onClick={() => st().undo()}><Icon name="undo" /></button>
          <button className="ib" title="Rétablir (Ctrl+Y)" aria-label="Rétablir" disabled={!canRedo} onClick={() => st().redo()}><Icon name="redo" /></button>
        </span>
        <span className="proj">
          <input className="pname" aria-label="Nom du projet" value={name} onChange={e => st().apply(p => ({ ...p, name: e.target.value }), false)} />
          <span className={dirty ? 'saved no' : 'saved'}>{dirty ? 'Non enregistré' : 'Enregistré'}</span>
        </span>
        <span className="tb">
          <button className="ib" aria-pressed={leftShown} title="Afficher ou masquer le panneau de gauche" aria-label="Panneau de gauche" onClick={() => setL(L.swap ? { showInsp: !L.showInsp } : { showLib: !L.showLib })}><Icon name="pl" /></button>
          <button className="ib" aria-pressed={L.showTl} title="Afficher ou masquer la timeline" aria-label="Timeline" onClick={() => setL({ showTl: !L.showTl })}><Icon name="pb" /></button>
          <button className="ib" aria-pressed={rightShown} title="Afficher ou masquer le panneau de droite" aria-label="Panneau de droite" onClick={() => setL(L.swap ? { showLib: !L.showLib } : { showInsp: !L.showInsp })}><Icon name="pr" /></button>
          <button className="ib" title="Échanger les panneaux gauche et droite" aria-label="Échanger les panneaux" onClick={() => setL({ swap: !L.swap })}><Icon name="swap" /></button>
          <button className="ib" title="Rétablir la disposition par défaut" aria-label="Disposition par défaut" onClick={() => setL(DEFAULT_LAYOUT)}><Icon name="reset" /></button>
          <span className="sep" />
        </span>
        <button className="btn sm claude" title="Laisser Claude piloter EZcut depuis VS Code" onClick={() => setLinkOpen(true)}><Icon name="chat" />Claude</button>
        <button className="ib" title="Aide : raccourcis et nouveautés" aria-label="Aide" onClick={() => dispatchEvent(new Event('ezcut:whatsnew'))}><Icon name="info" /></button>
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
      <ContextMenu />
      <MarkerDialog />
      <Updates />
      {linkOpen && <ClaudeLink onClose={() => setLinkOpen(false)} />}
      {exportOpen && <ExportDialog />}
      {welcome && !recovered && !linkOpen && <Welcome onClose={closeWelcome} />}
      {recovered && (
        <div className="modal" role="dialog" aria-modal="true" aria-label="Projet retrouvé">
          <div className="dialog">
            <header><b>Projet non enregistré retrouvé</b></header>
            <p>EZcut s'est fermé avec un projet en cours. Une sauvegarde automatique du {new Date(recovered.savedAt).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' })} est disponible.</p>
            <footer>
              <button className="btn" onClick={() => { void ez?.autosaveClear(); setRecovered(null); }}>Ignorer</button>
              <button className="btn primary" autoFocus onClick={() => { const r = recovered; setRecovered(null); void loadProject(r.json, null, true); }}>Restaurer</button>
            </footer>
          </div>
        </div>
      )}
      {toast && <div className="toast" role="status"><span>{toast}</span>{toastUndo && <button onClick={() => { st().undo(); st().set({ toast: null }); }}>Annuler</button>}</div>}
      <div className="dropzone" aria-hidden="true"><Icon name="import" />Déposez vos fichiers pour les importer</div>
    </div>
  );
}
