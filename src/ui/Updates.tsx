import { useEffect, useState } from 'react';
import changelog from '../../CHANGELOG.md?raw';
import { ez, type UpdateState } from '../desktop/api';
import { saveProject } from './actions';
import { Icon } from './Icon';
import { useStore } from './store';

/** Section du journal des modifications correspondant à une version (ou la première, si la version n'y figure pas). */
function notesFor(version: string): { title: string; lines: string[] } | null {
  const sections = changelog.split(/^## /m).slice(1);
  const sec = sections.find(s => s.includes(version)) ?? sections[0];
  if (!sec) return null;
  const [title, ...rest] = sec.split('\n');
  return { title: title.trim(), lines: rest.map(l => l.trimEnd()).filter(Boolean) };
}

function Notes({ lines }: { lines: string[] }) {
  return <div className="notes">{lines.map((l, i) => l.startsWith('### ') ? <h4 key={i}>{l.slice(4)}</h4> : l.startsWith('- ') ? <p key={i} className="li">{l.slice(2)}</p> : <p key={i}>{l}</p>)}</div>;
}

/** Mise à jour disponible (bandeau discret) et « Quoi de neuf » affiché une fois après chaque nouvelle version. */
export function Updates() {
  const [up, setUp] = useState<UpdateState | null>(null);
  const [version, setVersion] = useState('');
  const [news, setNews] = useState(false);
  const [details, setDetails] = useState(false);

  useEffect(() => {
    ez?.onUpdate(setUp);
    void ez?.version().then(v => {
      setVersion(v);
      try { const seen = localStorage.getItem('ezcut.version'); localStorage.setItem('ezcut.version', v); if (seen && seen !== v) setNews(true); } catch { /* stockage indisponible */ }
    });
    const open = () => setNews(true);
    addEventListener('ezcut:whatsnew', open);
    return () => removeEventListener('ezcut:whatsnew', open);
  }, []);

  const install = async () => {
    // Le projet est enregistré avant de redémarrer ; si l'utilisateur annule l'enregistrement, on n'installe pas.
    if (useStore.getState().dirty && !await saveProject()) return;
    if (await ez?.updateInstall() === false) useStore.getState().notify('Un export est en cours : la mise à jour s\'installera une fois terminé.');
  };
  const n = news ? notesFor(version) : null;

  return <>
    {up && up.status !== 'error' && (
      <div className="update" role="status">
        <Icon name="import" />
        {up.status === 'available' && <><span>EZcut {up.version} est disponible.</span>
          {up.notes && <button className="btn sm" onClick={() => setDetails(d => !d)}>{details ? 'Masquer' : 'Nouveautés'}</button>}
          <button className="btn sm primary" onClick={() => void ez?.updateDownload()}>Mettre à jour</button>
          <button className="ib small" aria-label="Plus tard" title="Plus tard" onClick={() => setUp(null)}><Icon name="x" /></button>
          {details && up.notes && <pre className="update-notes">{up.notes}</pre>}</>}
        {up.status === 'downloading' && <span>Téléchargement de la mise à jour… {up.percent} %</span>}
        {up.status === 'ready' && <><span>EZcut {up.version} est prêt à être installé.</span>
          <button className="btn sm primary" onClick={() => void install()}>Redémarrer et installer</button>
          <button className="ib small" aria-label="Plus tard" title="Plus tard" onClick={() => setUp(null)}><Icon name="x" /></button></>}
      </div>
    )}
    {n && (
      <div className="modal" role="dialog" aria-modal="true" aria-label="Quoi de neuf" onPointerDown={e => { if (e.target === e.currentTarget) setNews(false); }}>
        <div className="dialog wide">
          <header><b>Aide — EZcut {version}</b><button className="ib small" aria-label="Fermer" onClick={() => setNews(false)}><Icon name="x" /></button></header>
          <div className="notes">
            <h4>Raccourcis clavier</h4>
            <dl className="keys">
              <dt><kbd>Espace</kbd></dt><dd>Lecture, pause</dd>
              <dt><kbd>←</kbd> <kbd>→</kbd></dt><dd>Image précédente, suivante (avec <kbd>Maj</kbd> : dix images)</dd>
              <dt><kbd>Début</kbd> <kbd>Fin</kbd></dt><dd>Début, fin du montage</dd>
              <dt><kbd>S</kbd></dt><dd>Couper le clip en deux à la tête de lecture</dd>
              <dt><kbd>Suppr</kbd></dt><dd>Supprimer la sélection</dd>
              <dt><kbd>Ctrl</kbd> + <kbd>Z</kbd> / <kbd>Y</kbd></dt><dd>Annuler, rétablir</dd>
              <dt><kbd>Ctrl</kbd> + <kbd>S</kbd></dt><dd>Enregistrer (avec <kbd>Maj</kbd> : enregistrer sous)</dd>
              <dt><kbd>Ctrl</kbd> + <kbd>O</kbd></dt><dd>Ouvrir un projet</dd>
              <dt><kbd>Maj</kbd> + clic sur un média</dt><dd>Le poser par-dessus la vidéo</dd>
              <dt><kbd>Alt</kbd> + survol d'un effet</dt><dd>L'essayer en grand dans l'aperçu</dd>
              <dt><kbd>Ctrl</kbd> + molette sur la timeline</dt><dd>Zoomer, dézoomer autour du pointeur</dd>
              <dt>Glisser, molette dans l'aperçu</dt><dd>Déplacer, redimensionner le clip sélectionné</dd>
            </dl>
            <h4>Nouveautés de cette version</h4>
          </div>
          <Notes lines={n.lines} />
          <footer><button className="btn primary" onClick={() => setNews(false)}>Fermer</button></footer>
        </div>
      </div>
    )}
  </>;
}
