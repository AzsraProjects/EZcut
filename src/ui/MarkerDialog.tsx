import { useEffect } from 'react';
import { patchMarker, removeMarker } from '../core/ops';
import { MARKER_COLORS } from '../core/types';
import { Icon } from './Icon';
import { useStore } from './store';
import { timecode } from './time';

const st = () => useStore.getState();
const COLOR_NAMES = ['Rouge', 'Orange', 'Jaune', 'Vert', 'Cyan', 'Bleu', 'Violet', 'Gris'];

/** Nom et couleur d'un repère de la timeline. */
export function MarkerDialog() {
  const id = useStore(s => s.markerEdit);
  const m = useStore(s => s.project.markers.find(x => x.id === s.markerEdit));
  const fps = useStore(s => s.project.fps);
  const close = () => st().set({ markerEdit: null });
  // Le repère a disparu (annulation, lien de pilotage) : le dialogue se ferme, sinon il garderait le clavier sans s'afficher.
  useEffect(() => { if (id && !m) close(); }, [id, m]);
  if (!id || !m) return null;
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Repère" onPointerDown={e => { if (e.target === e.currentTarget) close(); }}
      onKeyDown={e => { if (e.key === 'Escape' || (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'BUTTON')) { e.stopPropagation(); close(); } }}>
      <div className="dialog">
        <header><b>Repère — {timecode(m.t, fps)}</b><button className="ib small" aria-label="Fermer" onClick={close}><Icon name="x" /></button></header>
        <label className="row"><span>Nom</span><input className="sel text" autoFocus maxLength={80} placeholder="Par exemple : refrain, coupe à revoir" value={m.name}
          onFocus={() => st().checkpoint()} onChange={e => st().apply(p => patchMarker(p, id, { name: e.target.value }), false)} /></label>
        <div className="row"><span>Couleur</span><div className="swatches">{MARKER_COLORS.map((c, i) =>
          <button key={c} aria-label={COLOR_NAMES[i] ?? c} title={COLOR_NAMES[i] ?? c} aria-pressed={m.color === c} style={{ background: c }} onClick={() => st().apply(p => patchMarker(p, id, { color: c }))} />)}</div></div>
        <footer>
          <button className="btn" onClick={() => { st().apply(p => removeMarker(p, id)); close(); }}><Icon name="trash" />Supprimer</button>
          <button className="btn primary" onClick={close}>Terminé</button>
        </footer>
      </div>
    </div>
  );
}
