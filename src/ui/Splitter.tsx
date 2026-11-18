/** Poignée de redimensionnement entre deux panneaux. Double-clic : taille par défaut. */
export function Splitter({ dir, onDrag, onReset, label }: { dir: 'col' | 'row'; onDrag: (delta: number, start: boolean) => void; onReset: () => void; label: string }) {
  const down = (e: React.PointerEvent) => {
    e.preventDefault();
    const el = e.currentTarget as HTMLElement, from = dir === 'col' ? e.clientX : e.clientY;
    el.setPointerCapture(e.pointerId); el.classList.add('on');
    onDrag(0, true);
    const move = (ev: PointerEvent) => onDrag((dir === 'col' ? ev.clientX : ev.clientY) - from, false);
    const up = () => { el.classList.remove('on'); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  };
  return <div className={`split ${dir}`} role="separator" aria-orientation={dir === 'col' ? 'vertical' : 'horizontal'} aria-label={label} title={`${label} — glisser pour redimensionner, double-clic pour réinitialiser`} onPointerDown={down} onDoubleClick={onReset} />;
}
