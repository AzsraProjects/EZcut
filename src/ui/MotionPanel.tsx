/** Section « Mouvement » de l'inspecteur : démarrer un mouvement, mouvements tout faits, réglage du point choisi, mimer. */
import { EASE_LABELS, EASES, PRESET_LABELS, type Preset } from '../core/motion';
import { patchClip } from '../core/ops';
import type { Clip } from '../core/types';
import { player } from '../engine/player';
import { clearMotion, deleteKey, keyNow, presetNow, setMimic, startMotion } from './motion';
import { useStore } from './store';
import { timecode } from './time';

const st = () => useStore.getState();
const QUICK: Preset[] = ['in-left', 'in-right', 'in-top', 'in-bottom', 'out-left', 'out-right', 'out-top', 'out-bottom', 'cross', 'drop', 'pop', 'float', 'zoom-in', 'zoom-out'];

export function MotionSection({ clip, start }: { clip: Clip; start: number }) {
  const keys = clip.keys ?? [], sel = useStore(s => s.motionKey), rec = useStore(s => s.motionRec), fps = useStore(s => s.project.fps);
  const k = sel !== null ? keys[sel] : undefined;
  const presets = (
    <div className="presets">
      {QUICK.map(p => <button key={p} className="btn sm" title={`${PRESET_LABELS[p]} : pose les points de ce mouvement, que vous pourrez retoucher`} onClick={() => presetNow(p)}>{PRESET_LABELS[p]}</button>)}
    </div>
  );
  if (!keys.length) return (
    <div className="sec">
      <h3>Mouvement</h3>
      <div className="hint">Faites bouger l'image : posez un premier point, puis déplacez la tête de lecture et faites glisser l'image dans l'aperçu. Ou choisissez un mouvement tout fait.</div>
      <div className="mactions">
        <button className="btn primary sm" onClick={startMotion} title="Pose le premier point à la tête de lecture, à la position actuelle de l'image">Animer</button>
        <button className="btn sm" aria-pressed={rec} onClick={() => setMimic(!rec)} title="Lecture au ralenti : l'image suit la souris tant que le bouton est enfoncé">Mimer le mouvement</button>
      </div>
      {presets}
    </div>
  );
  return (
    <div className="sec">
      <h3>Mouvement<button className="btn sm" onClick={() => clearMotion(clip.id)} title="Retire tous les points : l'image reste où elle est à la tête de lecture">Tout effacer</button></h3>
      <div className="mkey">{k ? <span><b>◆ {timecode(k.t, fps)}</b> · point {sel! + 1} sur {keys.length}</span> : <span>{keys.length} point{keys.length > 1 ? 's' : ''} · cliquez un losange pour le régler</span>}</div>
      {k && <>
        <div className="row"><span>Vers le suivant</span><div className="seg">
          {EASES.map(e => <button key={e} aria-pressed={k.ease === e} disabled={sel === keys.length - 1}
            title={e === 'smooth' ? 'Démarre et s\'arrête en douceur' : e === 'linear' ? 'Vitesse constante' : e === 'back' ? 'Dépasse un peu puis revient' : 'Reste immobile puis saute au point suivant'}
            onClick={() => st().apply(p => patchClip(p, clip.id, c => { if (c.keys?.[sel!]) c.keys[sel!].ease = e; }))}>{EASE_LABELS[e]}</button>)}
        </div></div>
        <div className="mactions">
          <button className="btn sm" onClick={() => { player.pause(); player.seek(start + k.t); }}>Aller au point</button>
          <button className="btn sm danger" onClick={() => deleteKey(clip.id, sel!)}>Supprimer le point</button>
        </div>
      </>}
      <div className="mactions">
        <button className="btn sm" onClick={() => { player.pause(); keyNow(clip.id, {}); }} title="Pose un point à la tête de lecture, à la position actuelle de l'image">Point ici</button>
        <button className="btn sm" aria-pressed={rec} onClick={() => setMimic(!rec)} title="Lecture au ralenti : l'image suit la souris tant que le bouton est enfoncé">{rec ? 'Arrêter de mimer' : 'Mimer le mouvement'}</button>
      </div>
      <details className="adv"><summary>Mouvements tout faits</summary>{presets}</details>
      <div className="hint">Position, taille, rotation et opacité ci-dessus valent pour la tête de lecture : les changer pose ou modifie le point à cet instant.</div>
    </div>
  );
}
