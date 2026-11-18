import { useEffect, useRef } from 'react';
import { addOverlay, appendClip, isFree, moveClip, moveFree, projectDuration, startsOf, trimClip } from '../core/ops';
import type { Clip, Project, TrackId } from '../core/types';
import { catalog } from '../effects/catalog';
import { player } from '../engine/player';
import { applyItem, deleteSelection, selectClip, splitAtPlayhead } from './actions';
import { Icon } from './Icon';
import { useStore } from './store';
import { subscribeTime, timecode } from './time';

const st = () => useStore.getState();
const HEAD = 96;
const LANES: { id: TrackId; label: string; icon: string; hint: string }[] = [
  { id: 'text', label: 'Titres', icon: 'type', hint: 'Choisissez un modèle dans l\'onglet Titres' },
  { id: 'overlay', label: 'Par-dessus', icon: 'layers', hint: 'Glissez ici une vidéo ou une image à poser par-dessus la vidéo (logo, image dans l\'image)' },
  { id: 'video', label: 'Vidéo', icon: 'film', hint: 'Piste principale : glissez une vidéo ou une image ici, ou cliquez dessus dans la bibliothèque' },
  { id: 'audio', label: 'Son', icon: 'music', hint: 'Glissez une musique ou un son ici' },
];

function ClipView({ clip, index, track, start, pps, project }: { clip: Clip; index: number; track: TrackId; start: number; pps: number; project: Project }) {
  const selected = useStore(s => s.sel?.kind === 'clip' && s.sel.id === clip.id);
  const media = project.media.find(m => m.id === clip.mediaId);
  const strip = useStore(s => s.thumbs[clip.mediaId]?.strip);
  const free = isFree(track);
  /** Instant de la timeline sous le pointeur, à l'intérieur de ce clip. */
  const timeAt = (el: HTMLElement, clientX: number) => start + Math.max(0, Math.min(clip.dur - 0.001, (clientX - el.getBoundingClientRect().left) / pps));

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
  // Piste libre : le clip se déplace dans le temps en le faisant glisser ; un simple clic le sélectionne et y place la tête de lecture.
  const slide = (e: React.PointerEvent) => {
    if (!free || e.button !== 0) return;
    const x0 = e.clientX, base = st().project, el = e.currentTarget as HTMLElement;
    let moved = false;
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - x0;
      if (!moved && Math.abs(dx) < 4) return;
      if (!moved) { moved = true; st().checkpoint(); st().select({ kind: 'clip', id: clip.id }); }
      st().apply(() => moveFree(base, clip.id, clip.start + dx / pps), false);
    };
    const up = (ev: PointerEvent) => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); if (!moved) selectClip(clip.id, timeAt(el, ev.clientX)); };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  };
  const onDrop = (e: React.DragEvent) => {
    const item = e.dataTransfer.getData('application/x-ezcut-item'), moved = e.dataTransfer.getData('application/x-ezcut-clip');
    if (item) {
      const it = catalog.byId.get(item);
      // Une transition lâchée sur un clip vise sa coupe la plus proche : la piste s'en charge.
      if (!it || it.kind === 'transition' || (track !== 'video' && track !== 'overlay')) return;
      e.preventDefault(); e.stopPropagation(); applyItem(it, clip.id);
    } else if (moved && !free) {
      e.preventDefault(); e.stopPropagation(); // y compris sur lui-même : sinon le dépôt remonte à la piste et l'envoie en fin
      if (moved === clip.id) return;
      const r = e.currentTarget.getBoundingClientRect(), after = e.clientX > r.left + r.width / 2;
      st().apply(p => (p[track].some(c => c.id === moved) ? moveClip(p, moved, index + (after ? 1 : 0)) : p));
    }
  };
  const label = clip.text ? clip.text.content.split('\n')[0] || 'Titre' : media?.name ?? 'Média introuvable';
  return (
    <div className={`clip ${track}${selected ? ' sel' : ''}`} role="button" tabIndex={0} aria-pressed={selected} draggable={!free} data-clip={clip.id}
      style={{ left: start * pps, width: Math.max(4, clip.dur * pps), backgroundImage: (track === 'video' || track === 'overlay') && strip ? `url("${strip}")` : undefined }}
      onClick={free ? undefined : e => selectClip(clip.id, timeAt(e.currentTarget, e.clientX))} onPointerDown={slide} onKeyDown={e => { if (e.key === 'Enter') selectClip(clip.id); }}
      onDragStart={e => { e.dataTransfer.setData('application/x-ezcut-clip', clip.id); e.dataTransfer.effectAllowed = 'move'; }}
      onDragOver={e => { if (e.dataTransfer.types.some(t => t.startsWith('application/x-ezcut'))) e.preventDefault(); }} onDrop={onDrop}>
      <em>{label}{clip.fx.length > 0 && <b>fx {clip.fx.length}</b>}</em>
      <span className="grip l" draggable={false} onDragStart={e => e.preventDefault()} onPointerDown={trim('start')} title="Rogner le début" />
      <span className="grip r" draggable={false} onDragStart={e => e.preventDefault()} onPointerDown={trim('end')} title="Rogner la fin" />
    </div>
  );
}

export function Timeline({ height }: { height: number }) {
  const project = useStore(s => s.project);
  const pps = useStore(s => s.pps);
  const sel = useStore(s => s.sel);
  const ph = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const total = projectDuration(project), span = Math.max(30, total + 10), width = span * pps;
  const count = project.video.length + project.audio.length + project.overlay.length + project.text.length;

  /** Zoom qui fait tenir tout le montage dans la largeur visible. */
  const fit = () => {
    const w = (scroller.current?.clientWidth ?? 1200) - HEAD - 60, d = projectDuration(st().project);
    if (d > 0) { st().set({ pps: Math.max(4, Math.min(240, w / d)) }); if (scroller.current) scroller.current.scrollLeft = 0; }
  };

  useEffect(() => subscribeTime(t => {
    const x = t * st().pps, sc = scroller.current;
    if (ph.current) ph.current.style.transform = `translateX(${x}px)`;
    // En lecture, la vue suit la tête : elle ne sort jamais de l'écran.
    if (sc && st().playing) { const left = sc.scrollLeft, view = sc.clientWidth - HEAD; if (x < left || x > left + view - 40) sc.scrollLeft = Math.max(0, x - 80); }
  }), []);
  useEffect(() => { if (ph.current) ph.current.style.transform = `translateX(${player.t * pps}px)`; }, [pps]);
  // Le clip sélectionné (donc celui qu'on vient d'ajouter) est amené à l'écran.
  const selId = sel?.id;
  useEffect(() => { if (selId) scroller.current?.querySelector(`[data-clip="${selId}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }, [selId, count]);
  // Premier média posé : le zoom s'ajuste pour que le montage soit visible en entier.
  const wasEmpty = useRef(true);
  useEffect(() => { if (wasEmpty.current && count > 0) fit(); wasEmpty.current = count === 0; }, [count]);

  // Déplacement de la tête de lecture : clic ou glissement dans la règle.
  const scrub = (e: React.PointerEvent) => {
    const el = e.currentTarget as HTMLElement, at = (x: number) => player.seek((x - el.getBoundingClientRect().left) / pps);
    player.pause(); at(e.clientX); el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => at(ev.clientX);
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up);
  };
  const dropOnLane = (track: TrackId) => (e: React.DragEvent) => {
    const mediaId = e.dataTransfer.getData('application/x-ezcut-media'), moved = e.dataTransfer.getData('application/x-ezcut-clip'), item = e.dataTransfer.getData('application/x-ezcut-item');
    const at = (e.clientX - e.currentTarget.getBoundingClientRect().left) / pps, p = st().project;
    if (item) {
      const it = catalog.byId.get(item);
      if (!it) return;
      e.preventDefault();
      if (it.kind === 'transition') {
        if (track !== 'video' || p.video.length < 2) { st().notify('Une transition se pose sur une coupe, entre deux clips de la piste Vidéo.'); return; }
        // coupe la plus proche de l'endroit où la transition est lâchée
        const starts = startsOf(p, 'video'); let best = 0;
        for (let i = 0; i < p.video.length - 1; i++) if (Math.abs(starts[i + 1] - at) < Math.abs(starts[best + 1] - at)) best = i;
        applyItem(it, p.video[best].id);
      } else st().notify('Lâchez l\'effet sur un clip.');
    } else if (mediaId) {
      e.preventDefault();
      const m = p.media.find(x => x.id === mediaId);
      if (!m) return;
      if (track === 'text') { st().notify('Cette piste accueille les titres.'); return; }
      if ((m.kind === 'audio') !== (track === 'audio')) { st().notify(track === 'audio' ? 'Cette piste accueille les fichiers audio.' : 'Cette piste accueille les vidéos et les images.'); return; }
      // Piste magnétique : le média s'insère entre les deux clips les plus proches de l'endroit visé.
      const starts = startsOf(p, track), index = p[track].filter((c, i) => starts[i] + c.dur / 2 < at).length;
      const r = track === 'overlay' ? addOverlay(p, mediaId, at) : appendClip(p, mediaId, index);
      if (r) { st().apply(() => r.project); selectClip(r.clipId); }
    } else if (moved && !isFree(track)) { e.preventDefault(); st().apply(q => (q[track].some(c => c.id === moved) ? moveClip(q, moved, q[track].length) : q)); }
  };
  const allow = (e: React.DragEvent) => { if (e.dataTransfer.types.some(t => t.startsWith('application/x-ezcut'))) e.preventDefault(); };
  // Clic dans le vide d'une piste : désélectionne et place la tête de lecture à cet endroit.
  const clickLane = (e: React.MouseEvent) => { if (e.target !== e.currentTarget) return; st().select(null); player.pause(); player.seek((e.clientX - e.currentTarget.getBoundingClientRect().left) / pps); };

  const step = pps >= 80 ? 1 : pps >= 40 ? 2 : pps >= 16 ? 5 : pps >= 8 ? 10 : 30;
  const ticks = Array.from({ length: Math.floor(span / step) + 1 }, (_, i) => i * step);
  const vStarts = startsOf(project, 'video');

  return (
    <section className="tl" style={{ height, ['--lane-v' as string]: `${Math.max(44, height - 39 - 24 - 34 - 46 - 46 - 14)}px` }}>
      <div className="tools">
        <button className="ib" title="Couper le clip en deux à la tête de lecture (S)" aria-label="Scinder" onClick={splitAtPlayhead}><Icon name="cut" /></button>
        <button className="ib" title="Supprimer la sélection (Suppr)" aria-label="Supprimer" disabled={!sel} onClick={deleteSelection}><Icon name="trash" /></button>
        <span className="tinfo">{count} clip{count > 1 ? 's' : ''} · {timecode(total, project.fps)}</span>
        <button className="btn sm fit" title="Afficher tout le montage" disabled={!count} onClick={fit}>Ajuster</button>
        <label className="zoom">Zoom<input type="range" min={4} max={240} step={1} value={pps} onChange={e => st().set({ pps: +e.target.value })} /></label>
      </div>
      <div className="tscroll" ref={scroller}>
        <div className="tracks" style={{ width: HEAD + width }}>
          <div className="heads">
            <div className="th r" />
            {LANES.map(l => <div key={l.id} className={`th ${l.id}`} title={l.hint}><Icon name={l.icon} />{l.label}</div>)}
          </div>
          <div className="lanes" style={{ width }}>
            <div className="ruler" onPointerDown={scrub}>
              {ticks.map(s => <i key={s} style={{ left: s * pps }}>{timecode(s, project.fps).slice(0, 5)}</i>)}
            </div>
            {LANES.map(l => {
              const starts = startsOf(project, l.id);
              return (
                <div key={l.id} className={`lane ${l.id}`} onDragOver={allow} onDrop={dropOnLane(l.id)} onClick={clickLane}>
                  {project[l.id].length === 0 && <span className="lane-empty">{l.hint}</span>}
                  {project[l.id].map((c, i) => <ClipView key={c.id} clip={c} index={i} track={l.id} start={starts[i]} pps={pps} project={project} />)}
                  {l.id === 'video' && project.video.slice(0, -1).map((c, i) => {
                    const cut = vStarts[i] + c.dur, tr = c.transition, def = tr ? catalog.byId.get(tr.effectId) : null;
                    const on = sel?.kind === 'transition' && sel.id === c.id;
                    return tr
                      ? <button key={'t' + c.id} className={on ? 'tmark sel' : 'tmark'} style={{ left: cut * pps, width: Math.max(26, tr.dur * pps) }} title={`Transition : ${def?.label ?? tr.effectId}`}
                          onClick={() => st().select({ kind: 'transition', id: c.id })}><Icon name="trans" /><span>{def?.label ?? 'Transition'}</span></button>
                      : <button key={'t' + c.id} className="tmark none" style={{ left: cut * pps }} title="Ajouter une transition sur cette coupe" aria-label="Ajouter une transition sur cette coupe"
                          onClick={() => { st().select({ kind: 'clip', id: c.id }); st().setTab('transitions'); }}><Icon name="plus" /></button>;
                  })}
                </div>
              );
            })}
            <div className="ph" ref={ph} />
          </div>
        </div>
      </div>
    </section>
  );
}
