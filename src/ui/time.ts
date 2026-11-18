/** Diffusion de la position de lecture sans passer par React (60 mises à jour par seconde). */
const listeners = new Set<(t: number) => void>();
export const emitTime = (t: number) => listeners.forEach(fn => fn(t));
export function subscribeTime(fn: (t: number) => void): () => void { listeners.add(fn); return () => { listeners.delete(fn); }; }

export function timecode(t: number, fps: number): string {
  const f = Math.max(0, Math.round(t * fps)), p = (n: number) => String(n).padStart(2, '0');
  const s = Math.floor(f / fps);
  return `${p(Math.floor(s / 60))}:${p(s % 60)}:${p(f % fps)}`;
}
