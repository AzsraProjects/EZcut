/** Image composée du projet à un instant donné, telle qu'elle serait exportée, dans un canvas 2D. */
import type { Project } from '../core/types';
import { player } from '../engine/player';

export async function renderFrame(project: Project, t: number, width: number, height: number): Promise<HTMLCanvasElement> {
  const buf = new Uint8Array(width * height * 4);
  player.pause(); player.exporting = true;
  try { await player.renderExact(project, t, width, height, buf); } finally { player.resetExportState(width, height); player.exporting = false; player.seek(player.t); }
  const c = document.createElement('canvas'); c.width = width; c.height = height;
  const g = c.getContext('2d')!, img = g.createImageData(width, height), row = width * 4;
  for (let y = 0; y < height; y++) img.data.set(buf.subarray((height - 1 - y) * row, (height - y) * row), y * row); // lignes de bas en haut → de haut en bas
  g.putImageData(img, 0, 0);
  return c;
}
