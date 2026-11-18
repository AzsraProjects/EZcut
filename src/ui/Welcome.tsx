/** Accueil au lancement : reprendre un projet récent, en ouvrir un autre ou en commencer un nouveau. */
import { useEffect, useState } from 'react';
import { ez, type RecentProject } from '../desktop/api';
import { openProject, openRecentProject } from './actions';
import { Icon } from './Icon';
import { useStore } from './store';

/** « il y a 5 min », « hier », « 12 nov. » */
function when(ms: number): string {
  const d = (Date.now() - ms) / 1000;
  if (d < 60) return 'à l\'instant';
  if (d < 3600) return `il y a ${Math.floor(d / 60)} min`;
  if (d < 86400) return `il y a ${Math.floor(d / 3600)} h`;
  if (d < 172800) return 'hier';
  return new Date(ms).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: new Date(ms).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
}

export function Welcome({ onClose }: { onClose: () => void }) {
  const [list, setList] = useState<RecentProject[] | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { void ez?.recentProjects().then(setList, () => setList([])); }, []);
  // Un projet ouvert d'une autre façon (dialogue, lien avec Claude, glisser-déposer de médias) ferme l'accueil.
  useEffect(() => useStore.subscribe((s, prev) => { if (s.project !== prev.project && (s.filePath || s.project.media.length)) onClose(); }), [onClose]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    addEventListener('keydown', key, true); return () => removeEventListener('keydown', key, true);
  }, [onClose]);
  const open = async (p: RecentProject) => {
    setBusy(true);
    try { if (await openRecentProject(p.path)) onClose(); else setList(l => l && l.filter(x => x.path !== p.path)); } finally { setBusy(false); }
  };
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Accueil">
      <div className="dialog welcome">
        <header><span className="logo"><i><Icon name="play" fill /></i>EZcut</span></header>
        <div className="wbtns">
          <button className="btn primary" autoFocus onClick={onClose}><Icon name="plus" />Nouveau projet</button>
          <button className="btn" onClick={() => void openProject()}><Icon name="folder" />Ouvrir un projet…</button>
        </div>
        <h3>Projets récents</h3>
        {list === null ? <p className="meta">Chargement…</p>
          : !list.length ? <p className="meta">Aucun projet récent : ceux que vous enregistrez ou ouvrez apparaîtront ici.</p>
          : <ul className="recent">
              {list.map(p => (
                <li key={p.path}>
                  <button disabled={busy} onClick={() => void open(p)} title={p.path}>
                    <Icon name="film" />
                    <span><b>{p.name}</b><small>{p.folder}</small></span>
                    <em>{when(p.modified)}</em>
                  </button>
                  <button className="ib forget" title="Retirer de la liste (le fichier n'est pas supprimé)" aria-label={`Retirer ${p.name} de la liste`}
                    onClick={() => { void ez?.forgetRecent(p.path); setList(l => l && l.filter(x => x.path !== p.path)); }}><Icon name="x" /></button>
                </li>
              ))}
            </ul>}
      </div>
    </div>
  );
}
