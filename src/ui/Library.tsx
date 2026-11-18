import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { Media } from '../core/types';
import type { CatItem } from '../effects/catalog';
import { player, TH, TW } from '../engine/player';
import { animState, drawText } from '../engine/text';
import { addTitle, addToTimeline, applyItem, catalogList } from './actions';
import { TITLES, type TitlePreset } from './titles';
import { Icon } from './Icon';
import { importWithDialog } from './media';
import { useStore, type Tab } from './store';
import { timecode } from './time';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'media', label: 'Médias', icon: 'film' },
  { id: 'titles', label: 'Titres', icon: 'type' },
  { id: 'effects', label: 'Effets', icon: 'fx' },
  { id: 'filters', label: 'Filtres', icon: 'drop' },
  { id: 'transitions', label: 'Transitions', icon: 'trans' },
];
const FOOT: Record<string, string> = {
  effects: 'Un effet anime ou déforme l\'image.',
  filters: 'Un filtre change les couleurs et l\'ambiance.',
  transitions: 'Une transition relie deux clips.',
};

/** Tuile d'effet, de filtre ou de transition. Sa vignette est calculée par le moteur quand elle devient visible. */
const FxTile = memo(function FxTile({ item, observe }: { item: CatItem; observe: (el: HTMLElement | null, item: CatItem) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [live, setLive] = useState(false);
  const enter = () => { const ctx = canvas.current?.getContext('2d'); if (ctx) { player.hover = { item, ctx }; setLive(true); } };
  const leave = () => {
    if (player.hover?.item === item) player.hover = null;
    setLive(false);
    const ctx = canvas.current?.getContext('2d'); if (ctx) player.requestThumb(item, ctx);
  };
  return (
    <button className={live ? 'tile live' : 'tile'} ref={el => observe(el, item)} title={('desc' in item && item.desc) || item.label}
      draggable onDragStart={e => { e.dataTransfer.setData('application/x-ezcut-item', item.id); e.dataTransfer.effectAllowed = 'copy'; }}
      onPointerEnter={enter} onPointerLeave={leave} onFocus={enter} onBlur={leave} onClick={() => applyItem(item)}>
      <span className="thumb"><canvas ref={canvas} width={TW} height={TH} /><span className="tag">Aperçu</span><span className="add"><Icon name="plus" /></span></span>
      <span className="tname">{item.label}</span>
      <span className="tby">{item.by} · {item.license}</span>
    </button>
  );
});

/** Modèle de titre : dessiné en 2D, animé au survol avec ses propres animations d'entrée et de sortie. */
function TitleTile({ preset }: { preset: TitlePreset }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const raf = useRef(0);
  const draw = (local: number) => {
    const c = canvas.current, ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const a = animState(preset.style, local, 3), tf = preset.transform ?? {};
    drawText(ctx, TW, TH, preset.style, a.chars);
    // même placement que dans l'image : décalage en fraction du cadre, vers le haut pour y positif
    c.style.opacity = String(a.alpha);
    c.style.transform = `translate(${(tf.x ?? 0) * 100}%, ${-((tf.y ?? 0) + a.dy) * 100}%) scale(${a.scale})`;
  };
  useEffect(() => { draw(1.5); return () => cancelAnimationFrame(raf.current); }, []);
  const enter = () => { const t0 = performance.now(); const loop = (now: number) => { draw(((now - t0) / 1000) % 3); raf.current = requestAnimationFrame(loop); }; cancelAnimationFrame(raf.current); raf.current = requestAnimationFrame(loop); };
  const leave = () => { cancelAnimationFrame(raf.current); draw(1.5); };
  return (
    <button className="tile title-tile" title="Ajouter ce titre à la tête de lecture" onPointerEnter={enter} onPointerLeave={leave} onFocus={enter} onBlur={leave} onClick={() => addTitle(preset.style, preset.transform)}>
      <span className="thumb"><canvas ref={canvas} width={TW} height={TH} /><span className="add"><Icon name="plus" /></span></span>
      <span className="tname">{preset.label}</span>
      <span className="tby">{preset.cat}</span>
    </button>
  );
}

function MediaTile({ m }: { m: Media }) {
  const poster = useStore(s => s.thumbs[m.id]?.poster);
  const fps = useStore(s => s.project.fps);
  return (
    <button className="tile" title="Clic : ajouter à la suite. Maj + clic : poser en incrustation à la tête de lecture." draggable
      onDragStart={e => { e.dataTransfer.setData('application/x-ezcut-media', m.id); e.dataTransfer.effectAllowed = 'copy'; }}
      onClick={e => addToTimeline(m.id, e.shiftKey)}>
      <span className="thumb">
        {poster ? <img src={poster} alt="" draggable={false} /> : <span className="ph-ico"><Icon name={m.kind === 'audio' ? 'music' : m.kind === 'image' ? 'image' : 'film'} /></span>}
        {m.kind !== 'image' && <span className="dur">{timecode(m.duration, fps)}</span>}
        <span className="add"><Icon name="plus" /></span>
      </span>
      <span className="tname">{m.name}</span>
    </button>
  );
}

export function Library() {
  const tab = useStore(s => s.tab);
  const ready = useStore(s => s.catalogReady);
  const media = useStore(s => s.project.media);
  const selId = useStore(s => s.sel?.kind === 'clip' ? s.sel.id : null);
  const clipCount = useStore(s => s.project.video.length);
  const epoch = useStore(s => s.thumbEpoch);
  const [cat, setCat] = useState('Tous');
  const [q, setQ] = useState('');
  const scroller = useRef<HTMLDivElement>(null);
  const visible = useRef(new Map<HTMLElement, CatItem>());
  const io = useRef<IntersectionObserver | null>(null);

  useEffect(() => { setCat('Tous'); setQ(''); }, [tab]);

  const list = useMemo(() => (ready && tab !== 'media' && tab !== 'titles' ? catalogList(tab) : []), [ready, tab]);
  const cats = useMemo(() => {
    const n: Record<string, number> = {};
    list.forEach(it => it.cat.forEach(c => { n[c] = (n[c] ?? 0) + 1; }));
    return Object.entries(n).sort((a, b) => a[0].localeCompare(b[0], 'fr'));
  }, [list]);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return list.filter(it => (cat === 'Tous' || it.cat.includes(cat)) && (!s || it.label.toLowerCase().includes(s) || it.by.toLowerCase().includes(s)));
  }, [list, cat, q]);

  // Les vignettes ne sont calculées que pour les tuiles visibles.
  const draw = (el: HTMLElement, item: CatItem) => { const ctx = el.querySelector('canvas')?.getContext('2d'); if (ctx) player.requestThumb(item, ctx); };
  const observe = useRef((el: HTMLElement | null, item: CatItem) => { if (el) { (el as HTMLElement & { _item?: CatItem })._item = item; io.current?.observe(el); } }).current;
  useEffect(() => {
    const map = visible.current;
    io.current = new IntersectionObserver(entries => entries.forEach(e => {
      const el = e.target as HTMLElement & { _item?: CatItem };
      if (e.isIntersecting && el._item) { if (!map.has(el)) { map.set(el, el._item); draw(el, el._item); } } else map.delete(el);
    }), { root: scroller.current, rootMargin: '150px' });
    scroller.current?.querySelectorAll<HTMLElement>('.tile').forEach(el => io.current!.observe(el));
    return () => { io.current?.disconnect(); io.current = null; map.clear(); player.clearThumbQueue(); player.hover = null; };
  }, [shown]);
  // Le clip visé a changé ou sa première image vient d'arriver : les vignettes visibles sont refaites.
  useEffect(() => { player.clearThumbQueue(); visible.current.forEach((item, el) => draw(el, item)); }, [selId, clipCount, epoch]);

  return (
    <section className="lib">
      <nav className="mods" role="tablist">
        {TABS.map(t => <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => useStore.getState().setTab(t.id)}><Icon name={t.icon} />{t.label}</button>)}
      </nav>
      {tab === 'media' ? (
        <div className="libmain solo">
          <div className="libbar">
            <button className="btn" onClick={() => void importWithDialog()}><Icon name="import" />Importer</button>
            <span className="count">{media.length} média{media.length > 1 ? 's' : ''}</span>
          </div>
          <div className="tiles">
            {media.length === 0
              ? <div className="empty"><Icon name="import" /><b>Déposez vos vidéos, sons et images ici</b><span>ou cliquez sur Importer. Un clic sur un média l'ajoute à la timeline.</span></div>
              : media.map(m => <MediaTile key={m.id} m={m} />)}
          </div>
          {media.length > 0 && <div className="libfoot"><span>Clic : ajouter à la suite</span><span>· <kbd>Maj</kbd> + clic ou glisser sur V2 : incrustation</span></div>}
        </div>
      ) : tab === 'titles' ? (
        <div className="libmain solo">
          <div className="libbar"><span className="count" style={{ marginLeft: 0 }}>{TITLES.length} modèles</span></div>
          <div className="tiles">{TITLES.map(t => <TitleTile key={t.id} preset={t} />)}</div>
          <div className="libfoot"><span>Survol : aperçu de l'animation</span><span>· Clic : ajouter à la tête de lecture</span><span>· Texte et style se règlent dans l'inspecteur</span></div>
        </div>
      ) : (
        <div className="libbody">
          <aside className="cats">
            <button aria-pressed={cat === 'Tous'} onClick={() => setCat('Tous')}><span>Tous</span><small>{list.length}</small></button>
            {cats.map(([c, n]) => <button key={c} aria-pressed={cat === c} onClick={() => setCat(c)}><span>{c}</span><small>{n}</small></button>)}
          </aside>
          <div className="libmain">
            <div className="libbar">
              <label className="search"><Icon name="search" /><input type="search" placeholder="Rechercher" aria-label="Rechercher" value={q} onChange={e => setQ(e.target.value)} /></label>
              <span className="count">{shown.length} / {list.length}</span>
            </div>
            <div className="tiles" ref={scroller}>
              {!ready ? <div className="empty">Chargement de la banque…</div>
                : shown.length === 0 ? <div className="empty">Aucun résultat.</div>
                : shown.map(it => <FxTile key={it.id} item={it} observe={observe} />)}
            </div>
            <div className="libfoot"><span>{FOOT[tab]}</span><span>· Survol : aperçu</span><span>· <kbd>Alt</kbd> : en grand</span><span>· Clic : appliquer</span></div>
          </div>
        </div>
      )}
    </section>
  );
}
