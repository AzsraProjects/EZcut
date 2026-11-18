import { useEffect, useRef } from 'react';
import { appendClip, moveClip, projectDuration, trackStarts, trimClip } from '../core/ops';
import type { Clip, Project, TrackId } from '../core/types';
import { catalog } from '../effects/catalog';
import { player } from '../engine/player';
import { applyItem, deleteSelection, selectClip, splitAtPlayhead } from './actions';
import { Icon } from './Icon';
import { useStore } from './store';
import { subscribeTime, timecode } from './time';

const st = () => useStore.getState();
const HEAD = 96;

function ClipView({ clip, index, track, start, pps, project }: { clip: Clip; index: number; track: TrackId; start: number; pps: number; project: Project }) {
  const selected = useStore(s => s.sel?.kind === 'clip' && s.sel.id === clip.id);
  const media = project.media.find(m => m.id === clip.mediaId);
  const strip = useStore(s => s.thumbs[clip.mediaId]?.strip);

  // Rognage : le projet d'origine est figé au début du geste, chaque mouvement repart de lui.
  const trim = (edge: 'start' | 'end') => (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    const x0 = e.clientX, base = st().project, el = e.currentTarget as HTMLElement;
    st().checkpoint(); st().select({ kind: 'clip', id: clip.id });
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => st().apply(() => trimClip(base, clip.id, edge, (ev.clientX - x0) / pps), false);
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  };
  const onDrop = (e: React.DragEvent) => {
    const item = e.dataTransfer.getData('application/x-ezcut-item'), moved = e.dataTransfer.getData('application/x-ezcut-clip');
    if (item) { e.preventDefault(); e.stopPropagation(); const it = catalog.byId.get(item); if (it && track === 'video') applyItem(it, clip.id); }
    else if (moved && moved !== clip.id) {
      e.preventDefault(); e.stopPropagation();
      const r = e.currentTarget.getBoundingClientRect(), after = e.clientX > r.left + r.width / 2;
      st().apply(p => (p[track].some(c => c.id === moved) ? moveClip(p, moved, index + (after ? 1 : 0)) : p));
    }
  };
  return (
    <div className={`clip ${track === 'video' ? 'v' : 'a'}${selected ? ' sel' : ''}`} role="button" tabIndex={0} draggable
      style={{ left: start * pps, width: Math.max(4, clip.dur * pps), backgroundImage: track === 'video' && strip ? `url("${strip}")` : undefined }}
      onClick={() => selectClip(clip.id)} onKeyDown={e => { if (e.key === 'Enter') selectClip(clip.id); }}
      onDragStart={e => { e.dataTransfer.setData('application/x-ezcut-clip', clip.id); e.dataTransfer.effectAllowed = 'move'; }}
      onDragOver={e => { if (e.dataTransfer.types.some(t => t.startsWith('application/x-ezcut'))) e.preventDefault(); }} onDrop={onDrop}>
      <em>{media?.name ?? 'Média introuvable'}{clip.fx.length > 0 && <b>fx {clip.fx.length}</b>}</em>
      <span className="grip l" draggable={false} onDragStart={e => e.preventDefault()} onPointerDown={trim('start')} title="Rogner le début" />
      <span className="grip r" draggable={false} onDragStart={e => e.preventDefault()} onPointerDown={trim('end')} title="Rogner la fin" />
    </div>
  );
}

export function Timeline() {
  const project = useStore(s => s.project);
  const pps = useStore(s => s.pps);
  const sel = useStore(s => s.sel);
  const ph = useRef<HTMLDivElement>(null);
  const lanes = useRef<HTMLDivElement>(null);
  const total = projectDuration(project), span = Math.max(30, total + 10), width = span * pps;

  useEffect(() => subscribeTime(t => { if (ph.current) ph.current.style.transform = `translateX(${t * st().pps}px)`; }), []);
  useEffect(() => { if (ph.current) ph.current.style.transform = `translateX(${player.t * pps}px)`; }, [pps]);

  // Déplacement de la tête de lecture : clic ou glissement dans la règle.
  const scrub = (e: React.PointerEvent) => {
    const el = e.currentTarget as HTMLElement, at = (x: number) => player.seek((x - el.getBoundingClientRect().left) / pps);
    player.pause(); at(e.clientX); el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => at(ev.clientX);
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up);
  };
  const dropOnLane = (track: TrackId) => (e: React.DragEvent) => {
    const mediaId = e.dataTransfer.getData('application/x-ezcut-media'), moved = e.dataTransfer.getData('application/x-ezcut-clip');
    if (mediaId) {
      e.preventDefault();
      const m = st().project.media.find(x => x.id === mediaId);
      if (!m || (m.kind === 'audio') !== (track === 'audio')) { st().notify(track === 'audio' ? 'Cette piste accueille les fichiers audio.' : 'Cette piste accueille les vidéos et les images.'); return; }
      const r = appendClip(st().project, mediaId); if (r) { st().apply(() => r.project); selectClip(r.clipId); }
    } else if (moved) { e.preventDefault(); st().apply(p => (p[track].some(c => c.id === moved) ? moveClip(p, moved, p[track].length) : p)); }
  };
  const allow = (e: React.DragEvent) => { if (e.dataTransfer.types.some(t => t.startsWith('application/x-ezcut'))) e.preventDefault(); };

  const step = pps >= 80 ? 1 : pps >= 40 ? 2 : pps >= 16 ? 5 : pps >= 8 ? 10 : 30;
  const ticks = Array.from({ length: Math.floor(span / step) + 1 }, (_, i) => i * step);
  const vStarts = trackStarts(project.video), aStarts = trackStarts(project.audio);

  return (
    <section className="tl">
      <div className="tools">
        <button className="ib" title="Scinder à la tête de lecture (S)" aria-label="Scinder" onClick={splitAtPlayhead}><Icon name="cut" /></button>
        <button className="ib" title="Supprimer la sélection (Suppr)" aria-label="Supprimer" disabled={!sel} onClick={deleteSelection}><Icon name="trash" /></button>
        <span className="tinfo">{project.video.length + project.audio.length} clip{project.video.length + project.audio.length > 1 ? 's' : ''} · {timecode(total, project.fps)}</span>
        <label className="zoom">Zoom<input type="range" min={4} max={240} step={1} value={pps} onChange={e => st().set({ pps: +e.target.value })} /></label>
      </div>
      <div className="tscroll">
        <div className="tracks" style={{ width: HEAD + width }}>
          <div className="heads">
            <div className="th r" />
            <div className="th v"><Icon name="film" />V1</div>
            <div className="th a"><Icon name="music" />A1</div>
          </div>
          <div className="lanes" ref={lanes} style={{ width }}>
            <div className="ruler" onPointerDown={scrub}>
              {ticks.map(s => <i key={s} style={{ left: s * pps }}>{timecode(s, project.fps).slice(0, 5)}</i>)}
            </div>
            <div className="lane v" onDragOver={allow} onDrop={dropOnLane('video')} onClick={e => { if (e.target === e.currentTarget) st().select(null); }}>
              {project.video.length === 0 && <span className="lane-empty">Glissez une vidéo ou une image ici, ou cliquez dessus dans la bibliothèque</span>}
              {project.video.map((c, i) => <ClipView key={c.id} clip={c} index={i} track="video" start={vStarts[i]} pps={pps} project={project} />)}
              {project.video.slice(0, -1).map((c, i) => {
                const cut = vStarts[i] + c.dur, tr = c.transition, def = tr ? catalog.byId.get(tr.effectId) : null;
                const on = sel?.kind === 'transition' && sel.id === c.id;
                return tr
                  ? <button key={'t' + c.id} className={on ? 'tmark sel' : 'tmark'} style={{ left: cut * pps, width: Math.max(26, tr.dur * pps) }} title={`Transition : ${def?.label ?? tr.effectId}`}
                      onClick={() => st().select({ kind: 'transition', id: c.id })}><Icon name="trans" /><span>{def?.label ?? 'Transition'}</span></button>
                  : <button key={'t' + c.id} className="tmark none" style={{ left: cut * pps }} title="Ajouter une transition sur cette coupe"
                      onClick={() => { st().select({ kind: 'clip', id: c.id }); st().setTab('transitions'); }}><Icon name="plus" /></button>;
              })}
            </div>
            <div className="lane a" onDragOver={allow} onDrop={dropOnLane('audio')} onClick={e => { if (e.target === e.currentTarget) st().select(null); }}>
              {project.audio.length === 0 && <span className="lane-empty">Glissez une musique ou un son ici</span>}
              {project.audio.map((c, i) => <ClipView key={c.id} clip={c} index={i} track="audio" start={aStarts[i]} pps={pps} project={project} />)}
            </div>
            <div className="ph" ref={ph} />
          </div>
        </div>
      </div>
    </section>
  );
}
