import { findClip, patchClip, removeFx, setTransition } from '../core/ops';
import type { Clip, Params, ParamValue, Project } from '../core/types';
import { catalog, type CatEffect, type CatTransition } from '../effects/catalog';
import type { IsfInput } from '../engine/gl';
import { Icon } from './Icon';
import { useStore } from './store';
import { timecode } from './time';

const st = () => useStore.getState();

/** Curseur : un point d'annulation au début du geste, puis des mises à jour sans historique. */
function Slider({ label, value, min, max, step, digits = 2, unit = '', onChange }: { label: string; value: number; min: number; max: number; step?: number; digits?: number; unit?: string; onChange: (v: number) => void }) {
  return (
    <label className="row">
      <span title={label}>{label}</span>
      <input type="range" min={min} max={max} step={step ?? (max - min) / 200} value={value} onPointerDown={() => st().checkpoint()} onKeyDown={() => st().checkpoint()} onChange={e => onChange(+e.target.value)} />
      <output>{value.toFixed(digits)}{unit}</output>
    </label>
  );
}

/** Réglages d'un shader ISF, générés à partir de ce qu'il déclare. */
function IsfParams({ inputs, values, onChange }: { inputs: IsfInput[]; values: Params; onChange: (name: string, v: ParamValue) => void }) {
  return <>{inputs.map(i => {
    const label = i.LABEL || i.NAME, v = values[i.NAME] ?? (i.DEFAULT as ParamValue | undefined);
    if (i.TYPE === 'float') { const mn = Number(i.MIN ?? 0), mx = Number(i.MAX ?? 1); return <Slider key={i.NAME} label={label} min={mn} max={mx} value={Number(v ?? mn)} onChange={x => onChange(i.NAME, x)} />; }
    if (i.TYPE === 'bool') return <label className="row" key={i.NAME}><span title={label}>{label}</span><input type="checkbox" checked={!!v} onChange={e => { st().checkpoint(); onChange(i.NAME, e.target.checked); }} /><span /></label>;
    if (i.TYPE === 'long' && i.VALUES) return <label className="row" key={i.NAME}><span title={label}>{label}</span><select className="sel" value={Number(v ?? i.VALUES[0])} onChange={e => { st().checkpoint(); onChange(i.NAME, +e.target.value); }}>{i.VALUES.map((x, k) => <option key={x} value={x}>{i.LABELS?.[k] ?? x}</option>)}</select></label>;
    if (i.TYPE === 'color') {
      const c = Array.isArray(v) && v.length === 4 ? v : [1, 1, 1, 1];
      const hex = '#' + c.slice(0, 3).map(x => Math.round(Math.max(0, Math.min(1, x)) * 255).toString(16).padStart(2, '0')).join('');
      return <label className="row" key={i.NAME}><span title={label}>{label}</span><input type="color" value={hex} onPointerDown={() => st().checkpoint()} onChange={e => onChange(i.NAME, [1, 3, 5].map(k => parseInt(e.target.value.slice(k, k + 2), 16) / 255).concat(c[3]))} /><span /></label>;
    }
    if (i.TYPE === 'point2D') {
      const mn = (i.MIN as number[] | undefined) ?? [0, 0], mx = (i.MAX as number[] | undefined) ?? [1, 1], p = Array.isArray(v) && v.length === 2 ? v : [0, 0];
      return ['X', 'Y'].map((ax, k) => <Slider key={i.NAME + ax} label={`${label} ${ax}`} min={mn[k]} max={mx[k]} value={p[k]} onChange={x => { const a = p.slice(); a[k] = x; onChange(i.NAME, a); }} />);
    }
    return null;
  })}</>;
}

function ClipPanel({ clip, project }: { clip: Clip; project: Project }) {
  const media = project.media.find(m => m.id === clip.mediaId);
  const poster = useStore(s => s.thumbs[clip.mediaId]?.poster);
  const edit = (fn: (c: Clip) => void) => st().apply(p => patchClip(p, clip.id, fn), false);
  const isAudio = media?.kind === 'audio', col = catalog.color;
  const colorVals: Params = col ? { ...Object.fromEntries(col.inputs.map(i => [i.NAME, i.DEFAULT as ParamValue])), ...clip.color } : {};
  const tf = clip.transform;
  return <>
    <div className="ihead">
      {poster && <img src={poster} alt="" />}
      <div><b>{media?.name ?? 'Média introuvable'}</b><span>{isAudio ? 'Audio · piste A1' : media?.kind === 'image' ? 'Image · piste V1' : 'Vidéo · piste V1'} · {timecode(clip.dur, project.fps)}</span></div>
    </div>
    {!isAudio && <div className="sec">
      <h3>Transformation<button className="btn sm" onClick={() => st().apply(p => patchClip(p, clip.id, c => { c.transform = { scale: 1, x: 0, y: 0, rot: 0 }; }))}>Réinitialiser</button></h3>
      <Slider label="Échelle" min={0.1} max={4} step={0.01} value={tf.scale} onChange={v => edit(c => { c.transform.scale = v; })} />
      <Slider label="Position X" min={-1} max={1} step={0.005} value={tf.x} onChange={v => edit(c => { c.transform.x = v; })} />
      <Slider label="Position Y" min={-1} max={1} step={0.005} value={tf.y} onChange={v => edit(c => { c.transform.y = v; })} />
      <Slider label="Rotation" min={-180} max={180} step={1} digits={0} unit="°" value={tf.rot} onChange={v => edit(c => { c.transform.rot = v; })} />
    </div>}
    {!isAudio && col && <div className="sec">
      <h3>Couleur<button className="btn sm" onClick={() => st().apply(p => patchClip(p, clip.id, c => { c.color = {}; }))}>Réinitialiser</button></h3>
      <IsfParams inputs={col.inputs} values={colorVals} onChange={(n, v) => edit(c => { c.color[n] = v; })} />
    </div>}
    {media?.kind === 'image' && <div className="sec"><h3>Durée</h3>
      <Slider label="Durée" min={0.5} max={30} step={0.1} digits={1} unit=" s" value={clip.dur} onChange={v => edit(c => { c.dur = v; })} />
    </div>}
    {(isAudio || media?.hasAudio) && <div className="sec"><h3>Son</h3>
      <Slider label="Volume" min={0} max={100} step={1} digits={0} unit=" %" value={Math.round(clip.volume * 100)} onChange={v => edit(c => { c.volume = v / 100; })} />
    </div>}
    {!isAudio && <div className="sec">
      <h3>Effets et filtres ({clip.fx.length})</h3>
      {clip.fx.length === 0 && <div className="hint">Aucun effet sur ce clip. Cliquez sur un effet ou un filtre de la banque, ou glissez-le sur le clip.</div>}
      {clip.fx.map(f => {
        const def = catalog.byId.get(f.effectId) as CatEffect | undefined;
        return (
          <div className="fxcard" key={f.uid}>
            <header>
              <button className="sw" role="switch" aria-checked={f.on} aria-label={`Activer ${def?.label ?? f.effectId}`} onClick={() => st().apply(p => patchClip(p, clip.id, c => { const x = c.fx.find(y => y.uid === f.uid); if (x) x.on = !x.on; }))} />
              <b>{def?.label ?? f.effectId}</b>
              <button className="ib small" aria-label="Retirer" title="Retirer" onClick={() => st().apply(p => removeFx(p, clip.id, f.uid))}><Icon name="x" /></button>
            </header>
            {def ? <><div className="by">{def.kind === 'filter' ? 'Filtre' : 'Effet'} · {def.by} · {def.license}</div>
              <IsfParams inputs={def.inputs} values={f.params} onChange={(n, v) => edit(c => { const x = c.fx.find(y => y.uid === f.uid); if (x) x.params[n] = v; })} /></>
              : <div className="by">Effet absent de cette version d'EZcut : conservé dans le projet, ignoré au rendu.</div>}
          </div>
        );
      })}
    </div>}
  </>;
}

function TransitionPanel({ clip }: { clip: Clip }) {
  const tr = clip.transition!, def = catalog.byId.get(tr.effectId) as CatTransition | undefined;
  const edit = (fn: (c: Clip) => void) => st().apply(p => patchClip(p, clip.id, fn), false);
  return <>
    <div className="ihead"><div><b>{def?.label ?? tr.effectId}</b><span>Transition{def ? ` · ${def.by} · ${def.license}` : ''}</span></div></div>
    <div className="sec">
      <h3>Réglages</h3>
      <Slider label="Durée" min={0.2} max={3} step={0.1} digits={1} unit=" s" value={tr.dur} onChange={v => edit(c => { if (c.transition) c.transition.dur = v; })} />
      {def?.params.map(u => {
        const v = tr.params[u.name] ?? u.def;
        if (u.type === 'float' || u.type === 'int') {
          const base = Math.abs(u.def[0] ?? 0), int = u.type === 'int', mx = int ? Math.max(8, base * 3) : Math.max(1, base * 3), mn = (u.def[0] ?? 0) < 0 ? -mx : 0;
          return <Slider key={u.name} label={u.name} min={mn} max={mx} step={int ? 1 : mx / 200} digits={int ? 0 : 2} value={v[0] ?? 0} onChange={x => edit(c => { if (c.transition) c.transition.params[u.name] = [x]; })} />;
        }
        if (u.type === 'bool') return <label className="row" key={u.name}><span>{u.name}</span><input type="checkbox" checked={!!v[0]} onChange={e => { st().checkpoint(); edit(c => { if (c.transition) c.transition.params[u.name] = [e.target.checked ? 1 : 0]; }); }} /><span /></label>;
        return null;
      })}
      <div className="actions"><button className="btn sm" onClick={() => { st().apply(p => setTransition(p, clip.id, null)); st().select(null); }}><Icon name="trash" />Retirer</button></div>
    </div>
  </>;
}

const FORMATS = [['16:9 — YouTube', 1920, 1080], ['9:16 — TikTok, Shorts, Reels', 1080, 1920], ['1:1 — carré', 1080, 1080], ['4:5 — portrait', 1080, 1350]] as const;

function ProjectPanel({ project }: { project: Project }) {
  return <>
    <div className="ihead"><div><b>Projet</b><span>{project.width} × {project.height} · {project.fps} images/s</span></div></div>
    <div className="sec">
      <h3>Format</h3>
      <label className="row"><span>Cadre</span><select className="sel" value={`${project.width}x${project.height}`} onChange={e => { const [w, h] = e.target.value.split('x').map(Number); st().apply(p => ({ ...p, width: w, height: h })); }}>
        {FORMATS.map(([l, w, h]) => <option key={l} value={`${w}x${h}`}>{l}</option>)}</select></label>
      <label className="row"><span>Cadence</span><select className="sel" value={project.fps} onChange={e => st().apply(p => ({ ...p, fps: +e.target.value }))}>{[24, 25, 30, 50, 60].map(f => <option key={f} value={f}>{f} images/s</option>)}</select></label>
    </div>
    <div className="sec"><div className="hint">Sélectionnez un clip dans la timeline pour régler sa couleur, son cadrage et ses effets.</div></div>
  </>;
}

export function Inspector() {
  const project = useStore(s => s.project);
  const sel = useStore(s => s.sel);
  const found = sel ? findClip(project, sel.id) : null;
  return (
    <section className="insp">
      {found && sel?.kind === 'transition' && found.clip.transition ? <TransitionPanel clip={found.clip} />
        : found && sel?.kind === 'clip' ? <ClipPanel clip={found.clip} project={project} />
        : <ProjectPanel project={project} />}
    </section>
  );
}
