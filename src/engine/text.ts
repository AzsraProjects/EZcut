/** Dessin des titres sur un canvas 2D, et état de leurs animations. Utilisé par le moteur et par les vignettes de la banque. */
import type { TextStyle } from '../core/types';

export const FONTS = ['Segoe UI', 'Arial', 'Bahnschrift', 'Impact', 'Georgia', 'Times New Roman', 'Trebuchet MS', 'Verdana', 'Courier New', 'Consolas', 'Comic Sans MS'];

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const rgba = (hex: string, a: number) => `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${a})`;

/** Dessine le titre centré dans un canvas w×h à fond transparent. chars limite le nombre de caractères visibles (machine à écrire). */
export function drawText(ctx: CanvasRenderingContext2D, w: number, h: number, style: TextStyle, chars = Infinity) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const px = Math.max(4, style.size * h), lines = style.content.split('\n').slice(0, 24);
  ctx.font = `${style.weight} ${px}px "${style.font}", "Segoe UI", system-ui, sans-serif`;
  ctx.textBaseline = 'middle'; ctx.textAlign = style.align; ctx.lineJoin = 'round';
  // La mise en page se fait sur le texte complet : la machine à écrire ne fait pas bouger les lignes.
  const blockW = Math.max(1, ...lines.map(l => ctx.measureText(l).width)), lineH = px * 1.22, blockH = lineH * lines.length;
  const cx = w / 2, cy = h / 2;
  if (style.box > 0) {
    const padX = px * 0.45, padY = px * 0.22;
    ctx.fillStyle = rgba(style.boxColor, style.box);
    ctx.beginPath(); ctx.roundRect(cx - blockW / 2 - padX, cy - blockH / 2 - padY, blockW + padX * 2, blockH + padY * 2, px * 0.16); ctx.fill();
  }
  const x = style.align === 'left' ? cx - blockW / 2 : style.align === 'right' ? cx + blockW / 2 : cx;
  let left = chars;
  lines.forEach((line, i) => {
    const shown = left >= line.length ? line : line.slice(0, Math.max(0, left));
    left -= line.length;
    if (!shown) return;
    const y = cy - blockH / 2 + lineH * (i + 0.5);
    if (style.shadow > 0) { ctx.shadowColor = `rgba(0,0,0,${0.8 * style.shadow})`; ctx.shadowBlur = px * 0.22 * style.shadow; ctx.shadowOffsetY = px * 0.05 * style.shadow; }
    if (style.stroke > 0) {
      ctx.strokeStyle = style.strokeColor; ctx.lineWidth = px * style.stroke * 2;
      ctx.strokeText(shown, x, y);
      ctx.shadowColor = 'transparent'; // l'ombre ne se cumule pas entre le contour et le remplissage
    }
    ctx.fillStyle = style.color;
    ctx.fillText(shown, x, y);
    ctx.shadowColor = 'transparent';
  });
}

export interface TextAnimState { alpha: number; dy: number; scale: number; chars: number; }

/** État de l'animation à l'instant local d'un titre de durée dur. dy est en fraction de la hauteur d'image, positif vers le haut. */
export function animState(style: TextStyle, local: number, dur: number): TextAnimState {
  const d = Math.max(0.01, Math.min(style.animDur, dur / 2));
  const ease = (k: number) => 1 - Math.pow(1 - clamp01(k), 3);
  const st: TextAnimState = { alpha: 1, dy: 0, scale: 1, chars: Infinity };
  const apply = (kind: TextStyle['animIn'], k: number, entering: boolean) => {
    const e = ease(k);
    if (kind === 'fade') st.alpha *= e;
    else if (kind === 'slide') { st.alpha *= e; st.dy -= (1 - e) * 0.07; }
    else if (kind === 'pop') { const b = 1 + 2.7 * Math.pow(e - 1, 3) + 1.7 * Math.pow(e - 1, 2); st.scale *= 0.55 + 0.45 * b; st.alpha *= clamp01(k * 3); }
    else if (kind === 'type') { if (entering) st.chars = Math.floor(style.content.length * clamp01(k) + 1e-6); else st.alpha *= e; }
  };
  apply(style.animIn, local / d, true);
  apply(style.animOut, (dur - local) / d, false);
  return st;
}
