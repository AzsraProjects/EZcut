import { findClip, patchClip, removeFx, setTransition } from '../core/ops';
import { BLEND_MODES, TEXT_ANIMS, type BlendMode, type Clip, type Params, type ParamValue, type Project, type TextAnim, type TextStyle, type TrackId } from '../core/types';
import { catalog, type CatEffect, type CatTransition } from '../effects/catalog';
import type { IsfInput } from '../engine/gl';
import { FONTS } from '../engine/text';
import { Icon } from './Icon';
import { useStore } from './store';
import { timecode } from './time';

const st = () => useStore.getState();
const BLEND_LABELS: Record<BlendMode, string> = { normal: 'Normal', screen: 'Écran (éclaircit)', multiply: 'Produit (assombrit)', add: 'Addition', overlay: 'Incrustation (contraste)' };
const ANIM_LABELS: Record<TextAnim, string> = { none: 'Aucune', fade: 'Fondu', slide: 'Glissement', pop: 'Rebond', type: 'Machine à écrire' };
const TRACK_LABELS: Record<TrackId, string> = { video: 'piste V1', overlay: 'incrustation V2', text: 'piste T1', audio: 'piste A1' };

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
function Color({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return <label className="row"><span title={label}>{label}</span><input type="color" value={value} onPointerDown={() => st().checkpoint()} onChange={e => onChange(e.target.value)} /><span /></label>;
}
function Select<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  const numeric = typeof value === 'number';
  return <label className="row"><span title={label}>{label}</span><select className="sel" value={value} onChange={e => { st().checkpoint(); onChange((numeric ? +e.target.value : e.target.value) as T); }}>{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>;
}

/** Réglages d'un shader ISF, générés à partir de ce qu'il déclare. */
function IsfParams({ inputs, values, onChange }: { inputs: IsfInput[]; values: Params; onChange: (name: string, v: ParamValue) => void }) {
  return <>{inputs.map(i => {
    const label = i.LABEL || i.NAME, v = values[i.NAME] ?? (i.DEFAULT as ParamValue | undefined);
    if (i.TYPE === 'float') { const mn = Number(i.MIN ?? 0), mx = Number(i.MAX ?? 1); return <Slider key={i.NAME} label={label} min={mn} max={mx} value={Number(v ?? mn)} onChange={x => onChange(i.NAME, x)} />; }
    if (i.TYPE === 'bool') return <label className="row" key={i.NAME}><span title={label}>{label}</span><input type="checkbox" checked={!!v} onChange={e => { st().checkpoint(); onChange(i.NAME, e.target.checked); }} /><span /></label>;
    if (i.TYPE === 'long' && i.VALUES) return <Select key={i.NAME} label={label} value={Number(v ?? i.VALUES[0])} options={i.VALUES.map((x, k) => [x, String(i.LABELS?.[k] ?? x)])} onChange={x => onChange(i.NAME, x)} />;
    if (i.TYPE === 'color') {
      const c = Array.isArray(v) && v.length === 4 ? v : [1, 1, 1, 1];
      const hex = '#' + c.slice(0, 3).map(x => Math.round(Math.max(0, Math.min(1, x)) * 255).toString(16).padStart(2, '0')).join('');
      return <Color key={i.NAME} label={label} value={hex} onChange={h => onChange(i.NAME, [1, 3, 5].map(k => parseInt(h.slice(k, k + 2), 16) / 255).concat(c[3]))} />;
    }
    if (i.TYPE === 'point2D') {
      const mn = (i.MIN as number[] | undefined) ?? [0, 0], mx = (i.MAX as number[] | undefined) ?? [1, 1], p = Array.isArray(v) && v.length === 2 ? v : [0, 0];
      return ['X', 'Y'].map((ax, k) => <Slider key={i.NAME + ax} label={`${label} ${ax}`} min={mn[k]} max={mx[k]} value={p[k]} onChange={x => { const a = p.slice(); a[k] = x; onChange(i.NAME, a); }} />);
    }
    return null;
  })}</>;
}

function TextSection({ clip, edit }: { clip: Clip; edit: (fn: (c: Clip) => void) => void }) {
  const s = clip.text!, set = (patch: Partial<TextStyle>) => edit(c => { if (c.text) Object.assign(c.text, patch); });
  return <>
    <div className="sec">
      <h3>Texte</h3>
      <textarea className="area" aria-label="Texte du titre" value={s.content} onFocus={() => st().checkpoint()} onChange={e => set({ content: e.target.value })} />
      <Select label="Police" value={s.font} options={(FONTS.includes(s.font) ? FONTS : [s.font, ...FONTS]).map(f => [f, f])} onChange={font => set({ font })} />
      <Slider label="Taille" min={2} max={40} step={0.5} digits={1} unit=" %" value={s.size * 100} onChange={v => set({ size: v / 100 })} />
      <Select label="Graisse" value={s.weight} options={[[400, 'Normal'], [600, 'Demi-gras'], [700, 'Gras'], [900, 'Très gras']]} onChange={weight => set({ weight })} />
      <div className="row"><span>Alignement</span><div className="seg">{(['left', 'center', 'right'] as const).map(a => <button key={a} aria-pressed={s.align === a} onClick={() => { st().checkpoint(); set({ align: a }); }}>{a === 'left' ? 'Gauche' : a === 'center' ? 'Centre' : 'Droite'}</button>)}</div></div>
      <Color label="Couleur" value={s.color} onChange={color => set({ color })} />
    </div>
    <div className="sec">
      <h3>Habillage</h3>
      <Slider label="Contour" min={0} max={20} step={0.5} digits={1} unit=" %" value={s.stroke * 100} onChange={v => set({ stroke: v / 100 })} />
      {s.stroke > 0 && <Color label="Couleur contour" value={s.strokeColor} onChange={strokeColor => set({ strokeColor })} />}
      <Slider label="Ombre" min={0} max={100} step={1} digits={0} unit=" %" value={s.shadow * 100} onChange={v => set({ shadow: v / 100 })} />
      <Slider label="Cartouche" min={0} max={100} step={1} digits={0} unit=" %" value={s.box * 100} onChange={v => set({ box: v / 100 })} />
      {s.box > 0 && <Color label="Couleur cartouche" value={s.boxColor} onChange={boxColor => set({ boxColor })} />}
    </div>
    <div className="sec">
      <h3>Animation</h3>
      <Select label="Entrée" value={s.animIn} options={TEXT_ANIMS.map(a => [a, ANIM_LABELS[a]])} onChange={animIn => set({ animIn })} />
      <Select label="Sortie" value={s.animOut} options={TEXT_ANIMS.filter(a => a !== 'type').map(a => [a, ANIM_LABELS[a]])} onChange={animOut => set({ animOut })} />
      <Slider label="Durée" min={0.1} max={3} step={0.05} digits={2} unit=" s" value={s.animDur} onChange={animDur => set({ animDur })} />
    </div>
  </>;
}

function ClipPanel({ clip, track, project }: { clip: Clip; track: TrackId; project: Project }) {
  const media = project.media.find(m => m.id === clip.mediaId);
  const poster = useStore(s => s.thumbs[clip.mediaId]?.poster);
  const edit = (fn: (c: Clip) => void) => st().apply(p => patchClip(p, clip.id, fn), false);
  const isAudio = track === 'audio', isText = !!clip.text, layered = track === 'overlay' || track === 'text', col = catalog.color;
  const colorVals: Params = col ? { ...Object.fromEntries(col.inputs.map(i => [i.NAME, i.DEFAULT as ParamValue])), ...clip.color } : {};
  const tf = clip.transform, hasSound = isAudio || (!!media?.hasAudio && media.kind !== 'image');
  const kind = isText ? 'Titre' : isAudio ? 'Audio' : media?.kind === 'image' ? 'Image' : 'Vidéo';
  return <>
    <div className="ihead">
      {poster && <img src={poster} alt="" />}
      <div><b>{isText ? clip.text!.content.split('\n')[0] || 'Titre' : media?.name ?? 'Média introuvable'}</b><span>{kind} · {TRACK_LABELS[track]} · {timecode(clip.dur, project.fps)}</span></div>
    </div>
    {isText && <TextSection clip={clip} edit={edit} />}
    {!isAudio && <div className="sec">
      <h3>{isText ? 'Position' : 'Transformation'}<button className="btn sm" onClick={() => st().apply(p => patchClip(p, clip.id, c => { c.transform = { scale: 1, x: 0, y: 0, rot: 0 }; }))}>Réinitialiser</button></h3>
      <Slider label="Échelle" min={0.1} max={4} step={0.01} value={tf.scale} onChange={v => edit(c => { c.transform.scale = v; })} />
      <Slider label="Position X" min={-1} max={1} step={0.005} value={tf.x} onChange={v => edit(c => { c.transform.x = v; })} />
      <Slider label="Position Y" min={-1} max={1} step={0.005} value={tf.y} onChange={v => edit(c => { c.transform.y = v; })} />
      <Slider label="Rotation" min={-180} max={180} step={1} digits={0} unit="°" value={tf.rot} onChange={v => edit(c => { c.transform.rot = v; })} />
    </div>}
    {layered && <div className="sec">
      <h3>Fusion</h3>
      <Slider label="Opacité" min={0} max={100} step={1} digits={0} unit=" %" value={Math.round(clip.opacity * 100)} onChange={v => edit(c => { c.opacity = v / 100; })} />
      <Select label="Mode" value={clip.blend} options={BLEND_MODES.map(b => [b, BLEND_LABELS[b]])} onChange={blend => edit(c => { c.blend = blend; })} />
    </div>}
    {!isAudio && !isText && col && <div className="sec">
      <h3>Couleur<button className="btn sm" onClick={() => st().apply(p => patchClip(p, clip.id, c => { c.color = {}; }))}>Réinitialiser</button></h3>
      <IsfParams inputs={col.inputs} values={colorVals} onChange={(n, v) => edit(c => { c.color[n] = v; })} />
    </div>}
    {media?.kind === 'image' && track === 'video' && <div className="sec"><h3>Durée</h3>
      <Slider label="Durée" min={0.5} max={30} step={0.1} digits={1} unit=" s" value={clip.dur} onChange={v => edit(c => { c.dur = v; })} />
    </div>}
    {hasSound && <div className="sec"><h3>Son</h3>
      <Slider label="Volume" min={0} max={100} step={1} digits={0} unit=" %" value={Math.round(clip.volume * 100)} onChange={v => edit(c => { c.volume = v / 100; })} />
      <Slider label="Fondu d'entrée" min={0} max={Math.min(5, clip.dur)} step={0.05} digits={2} unit=" s" value={Math.min(clip.fadeIn, clip.dur)} onChange={v => edit(c => { c.fadeIn = v; })} />
      <Slider label="Fondu de sortie" min={0} max={Math.min(5, clip.dur)} step={0.05} digits={2} unit=" s" value={Math.min(clip.fadeOut, clip.dur)} onChange={v => edit(c => { c.fadeOut = v; })} />
    </div>}
    {!isAudio && !isText && <div className="sec">
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
    <div className="sec"><div className="hint">Sélectionnez un clip ou un titre dans la timeline pour le régler.</div></div>
  </>;
}

export function Inspector() {
  const project = useStore(s => s.project);
  const sel = useStore(s => s.sel);
  const found = sel ? findClip(project, sel.id) : null;
  return (
    <section className="insp">
      {found && sel?.kind === 'transition' && found.clip.transition ? <TransitionPanel clip={found.clip} />
        : found && sel?.kind === 'clip' ? <ClipPanel clip={found.clip} track={found.track} project={project} />
        : <ProjectPanel project={project} />}
    </section>
  );
}
