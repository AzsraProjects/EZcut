import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { addOverlay, addSound, appendClip, isFree, isSound, moveClip, moveFree, patchClip, patchMarker, projectDuration, removeMarker, setTransition, startsOf, TRACKS, trimClip } from '../core/ops';
import type { Clip, Marker, Project, TrackId } from '../core/types';
import { catalog } from '../effects/catalog';
import { player } from '../engine/player';
import { addMarkerAtPlayhead, applyItem, deleteSelection, selectClip, splitAtPlayhead, splitClipAt, toggleTrack } from './actions';
import { openMenu } from './ContextMenu';
import { Icon } from './Icon';
import { menuForClip, menuForLane, menuForMarker, menuForRuler, menuForTransition } from './menus';
import { useStore, type Tool } from './store';
import { subscribeTime, timecode } from './time';

const st = () => useStore.getState();
const HEAD = 164;
const LANES: { id: TrackId; label: string; icon: string; hint: string; mute: boolean; hide: boolean }[] = [
  { id: 'text', label: 'Titres', icon: 'type', hint: 'Choisissez un modèle dans l\'onglet Titres', mute: false, hide: true },
  { id: 'overlay', label: 'Par-dessus', icon: 'layers', hint: 'Glissez ici une vidéo ou une image à poser par-dessus la vidéo (logo, image dans l\'image)', mute: true, hide: true },
  { id: 'video', label: 'Vidéo', icon: 'film', hint: 'Piste principale : glissez une vidéo ou une image ici, ou cliquez dessus dans la bibliothèque', mute: true, hide: true },
  { id: 'sound', label: 'Son', icon: 'vol', hint: 'Son détaché d\'une vidéo (clic droit sur un clip), voix, bruitages', mute: true, hide: false },
  { id: 'audio', label: 'Musique', icon: 'music', hint: 'Glissez une musique ici', mute: true, hide: false },
];
/** Hauteur cumulée des pistes de taille fixe, pour donner le reste à la piste Vidéo. */
const FIXED = 34 + 46 + 40 + 40;

/** Pendant qu'on rogne le début d'un clip de la piste principale : décalage visuel des clips à partir de lui, pour que
 *  le bord saisi suive la souris. Au relâchement, le décalage disparaît et la suite se resserre. */
interface TrimShift { index: number; seconds: number; }

/* ---------- aimantation ---------- */
/** Instants sur lesquels un bord peut s'aimanter : début, tête de lecture, repères, bords des clips (sauf le clip déplacé, ou toute une piste). */
function snapPoints(p: Project, skipClip?: string, skipTrack?: TrackId, playhead = true): number[] {
  const pts = [0, ...p.markers.map(m => m.t)];
  if (playhead) pts.push(player.t);
  for (const tr of TRACKS) {
    if (tr === skipTrack) continue;
    const s = startsOf(p, tr);
    p[tr].forEach((c, i) => { if (c.id !== skipClip) pts.push(s[i], s[i] + c.dur); });
  }
  return pts;
}
/** Point d'aimantation le plus proche de t, à moins de px pixels ; null s'il n'y en a pas. */
function nearest(t: number, pts: number[], pps: number, px = 8): number | null {
  let best: number | null = null, d = px / pps;
  for (const x of pts) { const dx = Math.abs(x - t); if (dx <= d) { d = dx; best = x; } }
  return best;
}
const snapping = (ev: { altKey: boolean }) => st().snap && !ev.altKey; // Alt suspend l'aimantation le temps du geste

function ClipView({ clip, index, track, start, pps, project, shift, tool, onShift, onGuide }: { clip: Clip; index: number; track: TrackId; start: number; pps: number; project: Project; shift: number; tool: Tool; onShift: (s: TrimShift | null) => void; onGuide: (t: number | null) => void }) {
  const selected = useStore(s => s.sel?.kind === 'clip' && s.sel.id === clip.id);
  const media = project.media.find(m => m.id === clip.mediaId);
  const strip = useStore(s => s.thumbs[clip.mediaId]?.strip);
  const free = isFree(track), sound = isSound(track), visual = !sound, razor = tool === 'razor';
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
    const x0 = e.clientX, base = st().project, edge0 = edge === 'start' ? start : start + clip.dur;
    // Sur la piste principale, le début d'un clip ne bouge pas dans le temps (c'est la suite qui se resserre) : pas d'aimantation.
    const pts = free || edge === 'end' ? snapPoints(base, clip.id, free ? undefined : 'video') : null;
    st().checkpoint(); st().select({ kind: 'clip', id: clip.id });
    capture(e, ev => {
      let d = (ev.clientX - x0) / pps, g: number | null = null;
      if (pts && snapping(ev)) { g = nearest(edge0 + d, pts, pps); if (g !== null) d = g - edge0; }
      st().apply(() => trimClip(base, clip.id, edge, d), false);
      onGuide(g);
      // Piste principale, bord gauche : ce qui a été retiré du début est affiché comme un retrait à gauche du clip.
      if (edge === 'start' && !free) { const now = st().project.video.find(c => c.id === clip.id); if (now) onShift({ index, seconds: clip.dur - now.dur }); }
    }, () => { onShift(null); onGuide(null); });
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
    const x0 = e.clientX, base = st().project, el = e.currentTarget as HTMLElement, pts = snapPoints(base, clip.id);
    let moved = false;
    capture(e, ev => {
      const dx = ev.clientX - x0;
      if (!moved && Math.abs(dx) < 4) return;
      if (!moved) { moved = true; st().checkpoint(); st().select({ kind: 'clip', id: clip.id }); }
      let want = clip.start + dx / pps, g: number | null = null;
      if (snapping(ev)) {
        // Le début ou la fin du clip s'aimante, selon le bord le plus proche d'un point.
        const a = nearest(want, pts, pps), b = nearest(want + clip.dur, pts, pps);
        if (a !== null && (b === null || Math.abs(a - want) <= Math.abs(b - want - clip.dur))) { want = a; g = a; }
        else if (b !== null) { want = b - clip.dur; g = b; }
      }
      st().apply(() => moveFree(base, clip.id, want), false);
      onGuide(g);
    }, ev => { onGuide(null); if (!moved) selectClip(clip.id, timeAt(el, ev.clientX)); });
  };
  // Outil lame : un clic coupe le clip à l'endroit cliqué.
  const cutHere = (e: React.PointerEvent) => { if (e.button !== 0) return; e.preventDefault(); splitClipAt(clip.id, timeAt(e.currentTarget as HTMLElement, e.clientX)); };
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
    <div className={`clip ${track}${selected ? ' sel' : ''}${clip.still ? ' still' : ''}${clip.off ? ' off' : ''}`} role="button" tabIndex={0} aria-pressed={selected} draggable={!free && !razor} data-clip={clip.id}
      // La bande d'images glisse avec le point d'entrée : en rognant le début, on voit le contenu défiler sous le bord.
      style={{ left: (start + shift) * pps, width, backgroundImage: (track === 'video' || track === 'overlay') && strip ? `url("${strip}")` : undefined, backgroundPositionX: clip.still ? 0 : -clip.in * pps }}
      onContextMenu={e => { e.stopPropagation(); openMenu(e, menuForClip(clip.id)); }}
      onClick={free || razor ? undefined : e => selectClip(clip.id, timeAt(e.currentTarget, e.clientX))} onPointerDown={razor ? cutHere : slide} onKeyDown={e => { if (e.key === 'Enter') selectClip(clip.id); }}
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
  const tool = useStore(s => s.tool);
  const snap = useStore(s => s.snap);
  const ph = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [trimShift, setTrimShift] = useState<TrimShift | null>(null);
  const [guide, setGuide] = useState<number | null>(null);
  const total = projectDuration(project), span = Math.max(30, total + 10), width = span * pps;
  const count = project.video.length + project.audio.length + project.sound.length + project.overlay.length + project.text.length;

  /** Zoom qui fait tenir tout le montage dans la largeur visible. */
  const fit = () => {
    const w = (scroller.current?.clientWidth ?? 1200) - HEAD - 60, d = projectDuration(st().project);
    if (d > 0) { st().set({ pps: Math.max(4, Math.min(240, w / d)) }); if (scroller.current) scroller.current.scrollLeft = 0; }
  };
  useEffect(() => { addEventListener('ezcut:fit', fit); return () => removeEventListener('ezcut:fit', fit); }, []);

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

  // Déplacement de la tête de lecture : clic ou glissement dans la règle. Elle s'aimante aux coupes et aux repères.
  const scrub = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const el = e.currentTarget as HTMLElement, pts = snapPoints(st().project, undefined, undefined, false);
    const at = (ev: { clientX: number; altKey: boolean }) => {
      const t = (ev.clientX - el.getBoundingClientRect().left) / pps;
      player.seek(snapping(ev) ? nearest(t, pts, pps, 5) ?? t : t);
    };
    player.pause(); at(e); el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => at(ev);
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  };
  // Repère : un clic y place la tête de lecture, un glissement le déplace, un double-clic ouvre son nom et sa couleur.
  const dragMarker = (m: Marker) => (e: React.PointerEvent) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    const el = e.currentTarget as HTMLElement, x0 = e.clientX, base = st().project;
    let moved = false;
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - x0;
      if (!moved && Math.abs(dx) < 4) return;
      if (!moved) { moved = true; st().checkpoint(); }
      st().apply(() => patchMarker(base, m.id, { t: Math.max(0, m.t + dx / pps) }), false);
    };
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); if (!moved) { player.pause(); player.seek(m.t); } };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  };
  // Transition : ses bords se tirent pour changer sa durée, répartie de part et d'autre de la coupe.
  const dragTransition = (c: Clip, side: -1 | 1) => (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    const tr = c.transition, el = e.currentTarget as HTMLElement, x0 = e.clientX;
    if (!tr || e.button !== 0) return;
    st().checkpoint(); st().select({ kind: 'transition', id: c.id }); el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => st().apply(p => setTransition(p, c.id, { ...tr, dur: Math.max(0.2, Math.min(5, tr.dur + side * 2 * (ev.clientX - x0) / pps)) }), false);
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  };
  const dropOnLane = (track: TrackId) => (e: React.DragEvent) => {
    const mediaId = e.dataTransfer.getData('application/x-ezcut-media'), moved = e.dataTransfer.getData('application/x-ezcut-clip'), item = e.dataTransfer.getData('application/x-ezcut-item');
    const at = Math.max(0, (e.clientX - e.currentTarget.getBoundingClientRect().left) / pps), p = st().project;
    if (p.tracks[track]?.locked) { if (item || mediaId || moved) { e.preventDefault(); st().notify('Cette piste est verrouillée : cliquez sur son cadenas pour la modifier.'); } return; }
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
  const timeOf = (e: React.MouseEvent) => Math.max(0, (e.clientX - e.currentTarget.getBoundingClientRect().left) / pps);

  const step = pps >= 80 ? 1 : pps >= 40 ? 2 : pps >= 16 ? 5 : pps >= 8 ? 10 : 30;
  const ticks = Array.from({ length: Math.floor(span / step) + 1 }, (_, i) => i * step);
  const vStarts = startsOf(project, 'video');
  // Ordre de rendu stable (par identifiant) : un repère qu'on déplace au-delà d'un autre ne change pas de place dans le document.
  const markers = [...project.markers].sort((a, b) => (a.id < b.id ? -1 : 1));

  return (
    <section className={tool === 'razor' ? 'tl razor' : 'tl'} style={{ height, ['--lane-v' as string]: `${Math.max(44, height - 39 - 24 - FIXED - 14)}px` }}>
      <div className="tools">
        <button className="ib" aria-pressed={tool === 'select'} title="Outil de sélection (V)" aria-label="Outil de sélection" onClick={() => st().set({ tool: 'select' })}><Icon name="cursor" /></button>
        <button className="ib" aria-pressed={tool === 'razor'} title="Outil lame : chaque clic sur un clip le coupe à cet endroit (C)" aria-label="Outil lame" onClick={() => { st().set({ tool: 'razor' }); st().notify('Outil lame : cliquez sur un clip pour le couper. Échap ou V pour revenir à la sélection.'); }}><Icon name="razor" /></button>
        <span className="sep" />
        <button className="ib" title="Couper à la tête de lecture : le clip sélectionné, ou toutes les pistes si rien n'est sélectionné (S)" aria-label="Scinder" onClick={() => splitAtPlayhead()}><Icon name="cut" /></button>
        <button className="ib" title="Supprimer la sélection (Suppr)" aria-label="Supprimer" disabled={!sel} onClick={() => deleteSelection()}><Icon name="trash" /></button>
        <button className="ib" title="Poser un repère à la tête de lecture (M)" aria-label="Poser un repère" onClick={addMarkerAtPlayhead}><Icon name="flag" /></button>
        <button className="ib" aria-pressed={snap} title="Aimantation : les clips s'accrochent aux coupes, aux repères et à la tête de lecture (N). Alt la suspend pendant un geste." aria-label="Aimantation" onClick={() => st().set({ snap: !snap })}><Icon name="magnet" /></button>
        <span className="tinfo">{count} clip{count > 1 ? 's' : ''} · {timecode(total, project.fps)}</span>
        <button className="btn sm fit" title="Afficher tout le montage (Maj+Z)" disabled={!count} onClick={fit}>Ajuster</button>
        <label className="zoom" title="Zoom de la timeline — aussi : Ctrl + molette, Ctrl + = et Ctrl + -">Zoom<input type="range" min={4} max={240} step={1} value={pps} onChange={e => st().set({ pps: +e.target.value })} /></label>
      </div>
      <div className="tscroll" ref={scroller}>
        <div className="tracks" style={{ width: HEAD + width }}>
          <div className="heads">
            <div className="th r" />
            {LANES.map(l => {
              const ts = project.tracks[l.id] ?? {};
              return (
                <div key={l.id} className={`th ${l.id}`} title={l.hint}>
                  <Icon name={l.icon} /><span className="tlabel">{l.label}</span>
                  <span className="tbtns">
                    {l.mute ? <button aria-pressed={!!ts.muted} title={ts.muted ? 'Rétablir le son de la piste' : 'Couper le son de la piste'} aria-label={`Couper le son de la piste ${l.label}`} onClick={() => toggleTrack(l.id, 'muted')}><Icon name={ts.muted ? 'mute' : 'vol'} /></button> : <span />}
                    {l.hide ? <button aria-pressed={!!ts.hidden} title={ts.hidden ? 'Afficher la piste' : 'Masquer la piste : elle n\'apparaît plus dans l\'aperçu ni à l\'export'} aria-label={`Masquer la piste ${l.label}`} onClick={() => toggleTrack(l.id, 'hidden')}><Icon name={ts.hidden ? 'eyeoff' : 'eye'} /></button> : <span />}
                    <button aria-pressed={!!ts.locked} title={ts.locked ? 'Déverrouiller la piste' : 'Verrouiller la piste : ses clips ne peuvent plus être modifiés'} aria-label={`Verrouiller la piste ${l.label}`} onClick={() => toggleTrack(l.id, 'locked')}><Icon name={ts.locked ? 'lock' : 'unlock'} /></button>
                  </span>
                </div>
              );
            })}
          </div>
          <div className="lanes" style={{ width }}>
            <div className="ruler" onPointerDown={scrub} onContextMenu={e => openMenu(e, menuForRuler(timeOf(e)))}>
              {ticks.map(s => <i key={s} style={{ left: s * pps }}>{timecode(s, project.fps).slice(0, 5)}</i>)}
              {markers.map(m => <button key={m.id} className="mk" style={{ left: m.t * pps, ['--mk' as string]: m.color }} aria-label={`Repère ${m.name || timecode(m.t, project.fps)}`}
                title={`${m.name || 'Repère'} — ${timecode(m.t, project.fps)}\nClic : y aller · glisser : déplacer · double-clic : nom et couleur`}
                onPointerDown={dragMarker(m)} onDoubleClick={() => st().set({ markerEdit: m.id })}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); st().set({ markerEdit: m.id }); } else if (e.key === 'Delete' || e.key === 'Backspace') { e.stopPropagation(); st().apply(p => removeMarker(p, m.id)); } }} onContextMenu={e => { e.stopPropagation(); openMenu(e, menuForMarker(m.id)); }}>{m.name && <span>{m.name}</span>}</button>)}
            </div>
            {LANES.map(l => {
              const starts = startsOf(project, l.id), ts = project.tracks[l.id] ?? {};
              return (
                <div key={l.id} className={`lane ${l.id}${ts.locked ? ' locked' : ''}${ts.hidden ? ' hidden' : ''}${ts.muted ? ' muted' : ''}`} onDragOver={allow} onDrop={dropOnLane(l.id)} onClick={clickLane}
                  onContextMenu={e => openMenu(e, menuForLane(l.id, timeOf(e)))}>
                  {project[l.id].length === 0 && <span className="lane-empty">{l.hint}</span>}
                  {project[l.id].map((c, i) => <ClipView key={c.id} clip={c} index={i} track={l.id} start={starts[i]} pps={pps} project={project} tool={tool}
                    shift={l.id === 'video' && trimShift && i >= trimShift.index ? trimShift.seconds : 0} onShift={setTrimShift} onGuide={setGuide} />)}
                  {l.id === 'video' && !trimShift && project.video.slice(0, -1).map((c, i) => {
                    const cut = vStarts[i] + c.dur, tr = c.transition, def = tr ? catalog.byId.get(tr.effectId) : null;
                    const on = sel?.kind === 'transition' && sel.id === c.id;
                    return tr
                      ? <button key={'t' + c.id} className={on ? 'tmark sel' : 'tmark'} style={{ left: cut * pps, width: Math.max(26, tr.dur * pps) }} title={`Transition : ${def?.label ?? tr.effectId} — ${tr.dur.toFixed(1)} s\nTirez un bord pour changer sa durée`}
                          onContextMenu={e => { e.stopPropagation(); openMenu(e, menuForTransition(c.id)); }} onClick={() => st().select({ kind: 'transition', id: c.id })}>
                          <span className="tg l" onPointerDown={dragTransition(c, -1)} /><Icon name="trans" /><span>{def?.label ?? 'Transition'}</span><span className="tg r" onPointerDown={dragTransition(c, 1)} /></button>
                      : <button key={'t' + c.id} className="tmark none" style={{ left: cut * pps }} title="Ajouter une transition sur cette coupe" aria-label="Ajouter une transition sur cette coupe"
                          onClick={() => { st().select({ kind: 'clip', id: c.id }); st().setTab('transitions'); }}><Icon name="plus" /></button>;
                  })}
                </div>
              );
            })}
            {markers.map(m => <i key={m.id} className="mkline" style={{ left: m.t * pps, background: m.color }} />)}
            {guide !== null && <i className="guide" style={{ left: guide * pps }} />}
            <div className="ph" ref={ph} />
          </div>
        </div>
      </div>
    </section>
  );
}
