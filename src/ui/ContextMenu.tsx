import { useEffect, useLayoutEffect, useRef } from 'react';
import { useStore } from './store';

export interface MenuItem { label: string; shortcut?: string; action?: () => void; disabled?: boolean; danger?: boolean; }
/** null = trait de séparation. */
export type MenuEntry = MenuItem | null;

/** Ouvre le menu contextuel à la position du pointeur. À appeler depuis un onContextMenu. */
export function openMenu(e: { preventDefault(): void; clientX: number; clientY: number }, items: MenuEntry[]) {
  e.preventDefault();
  // pas de séparateur en tête, en fin, ni en double
  const clean = items.filter((it, i, a) => it !== null || (i > 0 && i < a.length - 1 && a[i - 1] !== null));
  if (clean.some(it => it !== null)) useStore.getState().set({ menu: { x: e.clientX, y: e.clientY, items: clean } });
}

export function ContextMenu() {
  const menu = useStore(s => s.menu);
  const box = useRef<HTMLDivElement>(null);
  const close = () => useStore.getState().set({ menu: null });

  // Le menu reste entièrement dans la fenêtre, même ouvert près d'un bord.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || !menu) return;
    const r = el.getBoundingClientRect();
    el.style.left = Math.max(4, Math.min(menu.x, innerWidth - r.width - 4)) + 'px';
    el.style.top = Math.max(4, Math.min(menu.y, innerHeight - r.height - 4)) + 'px';
    el.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const away = (e: Event) => { if (!box.current?.contains(e.target as Node)) close(); };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault(); e.stopPropagation();
      const list = [...(box.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])], i = list.indexOf(document.activeElement as HTMLButtonElement);
      list[(i + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length]?.focus();
    };
    addEventListener('pointerdown', away, true); addEventListener('wheel', close, true); addEventListener('resize', close); addEventListener('blur', close); addEventListener('keydown', key, true);
    return () => { removeEventListener('pointerdown', away, true); removeEventListener('wheel', close, true); removeEventListener('resize', close); removeEventListener('blur', close); removeEventListener('keydown', key, true); };
  }, [menu]);

  if (!menu) return null;
  return (
    <div className="menu" role="menu" ref={box} style={{ left: menu.x, top: menu.y }} onContextMenu={e => e.preventDefault()}>
      {menu.items.map((it, i) => it === null ? <hr key={i} /> : (
        <button key={i} role="menuitem" className={it.danger ? 'danger' : undefined} disabled={it.disabled || !it.action} onClick={() => { close(); it.action?.(); }}>
          <span>{it.label}</span>{it.shortcut && <kbd>{it.shortcut}</kbd>}
        </button>
      ))}
    </div>
  );
}
