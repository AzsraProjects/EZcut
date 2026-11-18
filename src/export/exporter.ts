/** Export : rend chaque image avec le même compositeur que l'aperçu et l'envoie à FFmpeg (processus principal). */
import { clipsOf, isSound, kindOf, projectDuration, trackGain } from '../core/ops';
import type { Clip, Project } from '../core/types';
import { ez, type AudioSegment } from '../desktop/api';
import { player } from '../engine/player';

export interface ExportOptions { height: number; fps: number; codec?: 'h264' | 'hevc'; software?: boolean; }
export interface ExportResult { ok: boolean; path?: string; error?: string; cancelled?: boolean; frames?: number; seconds?: number; }

/** Plan audio : une suite de segments par piste — la piste principale d'abord, puis chaque piste de son ou d'incrustation qui a du son,
 *  dans l'ordre de la timeline. Images, vidéos muettes et trous deviennent des silences. */
export function audioPlan(p: Project): AudioSegment[][] {
  // Le volume d'un segment est celui du clip multiplié par celui de sa piste (jusqu'à 200 % × 200 %).
  const seg = (c: Clip, track: string): AudioSegment => {
    const m = p.media.find(x => x.id === c.mediaId);
    return { path: m && m.hasAudio && m.kind !== 'image' && !c.still && !c.off ? m.path : null, in: c.in, dur: c.dur, volume: c.volume * trackGain(p, track), fadeIn: c.fadeIn, fadeOut: c.fadeOut };
  };
  // Piste libre : les trous entre les clips sont comblés par du silence. Une piste sans aucun son est omise.
  const free = (track: Clip[], id: string): AudioSegment[] => {
    const out: AudioSegment[] = [];
    let at = 0;
    for (const c of [...track].sort((a, b) => a.start - b.start)) {
      if (c.start > at + 1e-6) out.push({ path: null, in: 0, dur: c.start - at, volume: 0 });
      out.push(seg(c, id)); at = c.start + c.dur;
    }
    return out.some(s => s.path) ? out : [];
  };
  // Une piste muette ne produit aucun son ; la piste principale garde ses durées, en silence.
  // Une incrustation masquée n'est pas lue du tout à l'aperçu : elle se tait aussi à l'export.
  const off = (t: string) => !!p.tracks[t]?.muted || (kindOf(t) === 'overlay' && !!p.tracks[t]?.hidden);
  const others = p.order.filter(t => isSound(t) || kindOf(t) === 'overlay').map(t => (off(t) ? [] : free(clipsOf(p, t), t))).filter(list => list.length);
  return [p.video.map(c => (off('video') ? { ...seg(c, 'video'), path: null } : seg(c, 'video'))), ...others];
}

export function exportSize(p: Project, height: number): { width: number; height: number } {
  const even = (n: number) => Math.round(n / 2) * 2;
  // "height" désigne le petit côté : 1080 donne 1920×1080 en 16:9 et 1080×1920 en 9:16.
  return p.width >= p.height ? { width: even(height * p.width / p.height), height } : { width: height, height: even(height * p.height / p.width) };
}

export async function exportProject(p: Project, opts: ExportOptions, onProgress: (done: number, total: number) => void, cancelled: () => boolean, outPath?: string): Promise<ExportResult> {
  if (!ez) return { ok: false, error: 'L\'export n\'est disponible que dans l\'application de bureau.' };
  const duration = projectDuration(p), frames = Math.max(1, Math.round(duration * opts.fps));
  if (!duration) return { ok: false, error: 'La timeline est vide.' };
  const { width, height } = exportSize(p, opts.height);
  const started = await ez.exportStart({ width, height, fps: opts.fps, frames, name: p.name, audio: audioPlan(p), codec: opts.codec, software: opts.software, outPath });
  if (!started.ok) return started.error ? { ok: false, error: started.error } : { ok: false, cancelled: true };

  const t0 = performance.now(), wasT = player.t;
  player.pause(); player.exporting = true;
  player.resetExportState(width, height);
  const buf = new Uint8Array(width * height * 4);
  try {
    for (let f = 0; f < frames; f++) {
      if (cancelled()) { await ez.exportCancel(); return { ok: false, cancelled: true }; }
      await player.renderExact(p, Math.min(f / opts.fps, duration - 1e-4), width, height, buf);
      await ez.exportFrame(buf);
      onProgress(f + 1, frames);
    }
    const r = await ez.exportFinish(), seconds = (performance.now() - t0) / 1000;
    ez.log(r.ok ? 'info' : 'error', 'export', r.ok ? `${frames} images en ${seconds.toFixed(1)} s (${(frames / seconds).toFixed(0)} images/s)` : 'échec', r.ok ? undefined : r.error);
    return { ...r, frames, seconds };
  } catch (e) {
    await ez.exportCancel().catch(() => {});
    ez.log('error', 'export', 'interrompu par une erreur de rendu', String((e as Error).stack ?? e));
    return { ok: false, error: String((e as Error).message ?? e) };
  } finally {
    player.resetExportState(width, height);
    player.exporting = false; player.seek(wasT);
  }
}
