import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { addOverlay, addSound, appendClip, isFree, isSound, moveClip, moveFree, patchClip, projectDuration, startsOf, trimClip } from '../core/ops';
import type { Clip, Project, TrackId } from '../core/types';
import { catalog } from '../effects/catalog';
import { player } from '../engine/player';
import { applyItem, deleteSelection, selectClip, splitAtPlayhead } from './actions';
import { openMenu } from './ContextMenu';
import { Icon } from './Icon';
import { menuForClip, menuForLane, menuForTransition } from './menus';
import { useStore } from './store';
import { subscribeTime, timecode } from './time';

const st = () => useStore.getState();
const HEAD = 96;
const LANES: { id: TrackId; label: string; icon: string; hint: string }[] = [
  { id: 'text', label: 'Titres', icon: 'type', hint: 'Choisissez un modèle dans l\'onglet Titres' },
  { id: 'overlay', label: 'Par-dessus', icon: 'layers', hint: 'Glissez ici une vidéo ou une image à poser par-dessus la vidéo (logo, image dans l\'image)' },
  { id: 'video', label: 'Vidéo', icon: 'film', hint: 'Piste principale : glissez une vidéo ou une image ici, ou cliquez dessus dans la bibliothèque' },
  { id: 'sound', label: 'Son', icon: 'vol', hint: 'Son détaché d\'une vidéo (clic droit sur un clip), voix, bruitages' },
  { id: 'audio', label: 'Musique', icon: 'music', hint: 'Glissez une musique ici' },
];
/** Hauteur cumulée des pistes de taille fixe, pour donner le reste à la piste Vidéo. */
const FIXED = 34 + 46 + 40 + 40;

/** Pendant qu'on rogne le début d'un clip de la piste principale : décalage visuel des clips à partir de lui, pour que
 *  le bord saisi suive la souris. Au relâchement, le décalage disparaît et la suite se resserre. */
interface TrimShift { index: number; seconds: number; }

function ClipView({ clip, index, track, start, pps, project, shift, onShift }: { clip: Clip; index: number; track: TrackId; start: number; pps: number; project: Project; shift: number; onShift: (s: TrimShift | null) => void }) {
  const selected = useStore(s => s.sel?.kind === 'clip' && s.sel.id === clip.id);
  const media = project.media.find(m => m.id === clip.mediaId);
  const strip = useStore(s => s.thumbs[clip.mediaId]?.strip);
  const free = isFree(track), sound = isSound(track), visual = !sound;
  const hasSound = sound || (!!media?.hasAudio && media.kind === 'video' && !clip.still);
  /** Instant de la timeline sous le pointeur, à l'intérieur de ce clip. */
  const timeAt = (el: HTMLElement, clientX: number) => start + Math.max(0, Math.min(clip.dur - 0.001, (clientX - el.getBoundingClientRect().left) / pps));
  const capture = (e: React.PointerEvent, move: (ev: PointerEvent) => void, end?: (ev: PointerEvent) => void) => {
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const up = (ev: PointerEvent) => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); end?.(ev); };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  };

  // Rognage : le projet d'origine est figé au début du geste, chaque mouvement repart de lui.
  const trim = (edge: 'start' | 'end') => (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    const x0 = e.clientX, base = st().project;
    st().checkpoint(); st().select({ kind: 'clip', id: clip.id });
    capture(e, ev => {
      st().apply(() => trimClip(base, clip.id, edge, (ev.clientX - x0) / pps), false);
      // Piste principale, bord gauche : ce qui a été retiré du début est affiché comme un retrait à gauche du clip.
      if (edge === 'start' && !free) { const now = st().project.video.find(c => c.id === clip.id); if (now) onShift({ index, seconds: clip.dur - now.dur }); }
    }, () => onShift(null));
  };
  // Fondu : la poignée du coin se tire vers l'intérieur du clip. Sur une piste de son, elle règle le son ; ailleurs, l'image.
  const fade = (side: 'in' | 'out') => (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    type K = 'fadeIn' | 'fadeOut' | 'vfadeIn' | 'vfadeOut';
    const x0 = e.clientX, key: K = sound ? (side === 'in' ? 'fadeIn' : 'fadeOut') : (side === 'in' ? 'vfadeIn' : 'vfadeOut');
    const other: K = sound ? (side === 'in' ? 'fadeOut' : 'fadeIn') : (side === 'in' ? 'vfadeOut' : 'vfadeIn'), v0 = clip[key];
    st().checkpoint(); st().select({ kind: 'clip', id: clip.id });
    capture(e, ev => {
      const d = (ev.clientX - x0) / pps * (side === 'in' ? 1 : -1);
      st().apply(p => patchClip(p, clip.id, c => { c[key] = Math.max(0, Math.min(c.dur - c[other], v0 + d)); }), false);
    });
  };
  // Volume : la ligne horizontale du clip se tire de bas (silence) en haut (100 %). La course est la même quelle que soit
  // la hauteur de la piste : 150 pixels pour toute la plage, quatre fois plus avec Maj pour un réglage fin.
  const [volDrag, setVolDrag] = useState(false);
  const vol = (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    const y0 = e.clientY, v0 = clip.volume;
    st().checkpoint(); st().select({ kind: 'clip', id: clip.id }); setVolDrag(true);
    capture(e, ev => {
      const v = Math.max(0, Math.min(1, v0 - (ev.clientY - y0) / (ev.shiftKey ? 600 : 150)));
      st().apply(p => patchClip(p, clip.id, c => { c.volume = Math.round(v * 100) / 100; }), false);
    }, () => setVolDrag(false));
  };

  // Piste libre : le clip se déplace dans le temps en le faisant glisser ; un simple clic le sélectionne et y place la tête de lecture.
  const slide = (e: React.PointerEvent) => {
    if (!free || e.button !== 0) return;
    const x0 = e.clientX, base = st().project, el = e.currentTarget as HTMLElement;
    let moved = false;
    capture(e, ev => {
      const dx = ev.clientX - x0;
      if (!moved && Math.abs(dx) < 4) return;
      if (!moved) { moved = true; st().checkpoint(); st().select({ kind: 'clip', id: clip.id }); }
      st().apply(() => moveFree(base, clip.id, clip.start + dx / pps), false);
    }, ev => { if (!moved) selectClip(clip.id, timeAt(el, ev.clientX)); });
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
  const label = clip.text ? clip.text.content.split('\n')[0] || 'Titre' : (clip.still ? 'Arrêt sur image — ' : '') + (media?.name ?? 'Média introuvable');
  const fin = sound ? clip.fadeIn : clip.vfadeIn, fout = sound ? clip.fadeOut : clip.vfadeOut;
  const muted = hasSound && clip.volume <= 0;
  const width = Math.max(4, clip.dur * pps);
  return (
    <div className={`clip ${track}${selected ? ' sel' : ''}${clip.still ? ' still' : ''}${clip.off ? ' off' : ''}`} role="button" tabIndex={0} aria-pressed={selected} draggable={!free} data-clip={clip.id}
      // La bande d'images glisse avec le point d'entrée : en rognant le début, on voit le contenu défiler sous le bord.
      style={{ left: (start + shift) * pps, width, backgroundImage: (track === 'video' || track === 'overlay') && strip ? `url("${strip}")` : undefined, backgroundPositionX: clip.still ? 0 : -clip.in * pps }}
      onContextMenu={e => { e.stopPropagation(); openMenu(e, menuForClip(clip.id)); }}
      onClick={free ? undefined : e => selectClip(clip.id, timeAt(e.currentTarget, e.clientX))} onPointerDown={slide} onKeyDown={e => { if (e.key === 'Enter') selectClip(clip.id); }}
      onDragStart={e => { e.dataTransfer.setData('application/x-ezcut-clip', clip.id); e.dataTransfer.effectAllowed = 'move'; }}
      onDragOver={e => { if (e.dataTransfer.types.some(t => t.startsWith('application/x-ezcut'))) e.preventDefault(); }} onDrop={onDrop}>
      {fin > 0 && <span className="fade in" style={{ width: fin * pps }} />}
      {fout > 0 && <span className="fade out" style={{ width: fout * pps }} />}
      <em>{muted && <Icon name="mute" />}{label}{clip.fx.length > 0 && <b>fx {clip.fx.length}</b>}</em>
      {hasSound && width > 60 && <span className={volDrag ? 'vol on' : 'vol'} style={{ bottom: `calc(2px + ${clip.volume} * (100% - 22px))` }} draggable={false} onDragStart={e => e.preventDefault()} onPointerDown={vol}
        onDoubleClick={e => { e.stopPropagation(); st().apply(p => patchClip(p, clip.id, c => { c.volume = 1; })); }} title={`Volume : ${Math.round(clip.volume * 100)} % — tirez vers le haut ou le bas (Maj : réglage fin, double-clic : 100 %)`}>{volDrag && <b>{Math.round(clip.volume * 100)} %</b>}</span>}
      <span className="grip l" draggable={false} onDragStart={e => e.preventDefault()} onPointerDown={trim('start')} title="Rogner le début" />
      <span className="grip r" draggable={false} onDragStart={e => e.preventDefault()} onPointerDown={trim('end')} title="Rogner la fin" />
      {width > 46 && (visual || hasSound) && <>
        <span className="fh in" style={{ left: Math.min(fin * pps, width - 10) }} draggable={false} onDragStart={e => e.preventDefault()} onPointerDown={fade('in')} title={sound ? 'Fondu d\'entrée du son : tirez vers la droite' : 'Fondu d\'ouverture de l\'image : tirez vers la droite'} />
        <span className="fh out" style={{ right: Math.min(fout * pps, width - 10) }} draggable={false} onDragStart={e => e.preventDefault()} onPointerDown={fade('out')} title={sound ? 'Fondu de sortie du son : tirez vers la gauche' : 'Fondu de fermeture de l\'image : tirez vers la gauche'} />
      </>}
    </div>
  );
}

export function Timeline({ height }: { height: number }) {
  const project = useStore(s => s.project);
  const pps = useStore(s => s.pps);
  const sel = useStore(s => s.sel);
  const ph = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [trimShift, setTrimShift] = useState<TrimShift | null>(null);
  const total = projectDuration(project), span = Math.max(30, total + 10), width = span * pps;
  const count = project.video.length + project.audio.length + project.sound.length + project.overlay.length + project.text.length;

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

  // Ctrl + molette : zoom centré sur l'instant placé sous le pointeur, qui ne bouge pas à l'écran.
  const anchor = useRef<{ t: number; x: number } | null>(null);
  useEffect(() => {
    const sc = scroller.current;
    if (!sc) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return; // sans Ctrl : défilement normal
      e.preventDefault();
      const cur = st().pps, x = e.clientX - sc.getBoundingClientRect().left - HEAD;
      const next = Math.max(4, Math.min(240, cur * Math.exp(-e.deltaY * 0.0015)));
      if (next === cur) return;
      anchor.current = { t: Math.max(0, (sc.scrollLeft + x) / cur), x };
      st().set({ pps: next });
    };
    sc.addEventListener('wheel', onWheel, { passive: false }); // passive: false pour pouvoir empêcher le zoom de page
    return () => sc.removeEventListener('wheel', onWheel);
  }, []);
  // Une fois la timeline redessinée à la nouvelle échelle, le défilement est recalé sur l'instant visé.
  useLayoutEffect(() => { const a = anchor.current, sc = scroller.current; if (a && sc) { sc.scrollLeft = Math.max(0, a.t * pps - a.x); anchor.current = null; } }, [pps]);

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
    const at = Math.max(0, (e.clientX - e.currentTarget.getBoundingClientRect().left) / pps), p = st().project;
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
      if ((m.kind === 'audio') !== isSound(track)) { st().notify(isSound(track) ? 'Cette piste accueille les fichiers audio.' : 'Cette piste accueille les vidéos et les images.'); return; }
      // Piste principale : le média s'insère entre les deux clips les plus proches de l'endroit visé. Ailleurs : à l'instant visé.
      const starts = startsOf(p, 'video'), index = p.video.filter((c, i) => starts[i] + c.dur / 2 < at).length;
      const r = track === 'overlay' ? addOverlay(p, mediaId, at) : track === 'audio' || track === 'sound' ? addSound(p, mediaId, track, at) : appendClip(p, mediaId, index);
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
    <section className="tl" style={{ height, ['--lane-v' as string]: `${Math.max(44, height - 39 - 24 - FIXED - 14)}px` }}>
      <div className="tools">
        <button className="ib" title="Couper le clip en deux à la tête de lecture (S)" aria-label="Scinder" onClick={splitAtPlayhead}><Icon name="cut" /></button>
        <button className="ib" title="Supprimer la sélection (Suppr)" aria-label="Supprimer" disabled={!sel} onClick={deleteSelection}><Icon name="trash" /></button>
        <span className="tinfo">{count} clip{count > 1 ? 's' : ''} · {timecode(total, project.fps)}</span>
        <button className="btn sm fit" title="Afficher tout le montage" disabled={!count} onClick={fit}>Ajuster</button>
        <label className="zoom" title="Zoom de la timeline — aussi : Ctrl + molette sur la timeline">Zoom<input type="range" min={4} max={240} step={1} value={pps} onChange={e => st().set({ pps: +e.target.value })} /></label>
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
                <div key={l.id} className={`lane ${l.id}`} onDragOver={allow} onDrop={dropOnLane(l.id)} onClick={clickLane}
                  onContextMenu={e => openMenu(e, menuForLane(l.id, Math.max(0, (e.clientX - e.currentTarget.getBoundingClientRect().left) / pps)))}>
                  {project[l.id].length === 0 && <span className="lane-empty">{l.hint}</span>}
                  {project[l.id].map((c, i) => <ClipView key={c.id} clip={c} index={i} track={l.id} start={starts[i]} pps={pps} project={project}
                    shift={l.id === 'video' && trimShift && i >= trimShift.index ? trimShift.seconds : 0} onShift={setTrimShift} />)}
                  {l.id === 'video' && !trimShift && project.video.slice(0, -1).map((c, i) => {
                    const cut = vStarts[i] + c.dur, tr = c.transition, def = tr ? catalog.byId.get(tr.effectId) : null;
                    const on = sel?.kind === 'transition' && sel.id === c.id;
                    return tr
                      ? <button key={'t' + c.id} className={on ? 'tmark sel' : 'tmark'} style={{ left: cut * pps, width: Math.max(26, tr.dur * pps) }} title={`Transition : ${def?.label ?? tr.effectId}`}
                          onContextMenu={e => { e.stopPropagation(); openMenu(e, menuForTransition(c.id)); }} onClick={() => st().select({ kind: 'transition', id: c.id })}><Icon name="trans" /><span>{def?.label ?? 'Transition'}</span></button>
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
