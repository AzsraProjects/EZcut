// Lecture de la table des images d'un MP4 : fichiers produits par FFmpeg (images B, H.265, rotation) et fichiers abîmés.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readVideoTrack, type Reader } from './mp4';

const FFMPEG: string = createRequire(import.meta.url)('ffmpeg-static');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ezcut-mp4-'));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

function make(name: string, ...args: string[]) {
  const out = path.join(dir, name);
  const r = spawnSync(FFMPEG, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=320x180:r=30:d=2', ...args, out]);
  if (r.status !== 0) throw new Error(String(r.stderr));
  return out;
}
const reader = (file: string): { read: Reader; size: number } => {
  const buf = fs.readFileSync(file);
  return { size: buf.length, read: async (off, len) => new Uint8Array(buf.buffer, buf.byteOffset + off, Math.max(0, Math.min(len, buf.length - off))) };
};
const track = (file: string) => { const r = reader(file); return readVideoTrack(r.read, r.size); };

describe('table des images d\'un MP4', () => {
  it('H.264 avec images B : 60 images, instants de présentation réguliers, première image clé', async () => {
    const t = await track(make('b.mp4', '-c:v', 'libx264', '-bf', '3', '-g', '30', '-pix_fmt', 'yuv420p'));
    expect(t).not.toBeNull();
    expect(t!.codec).toMatch(/^avc1\.[0-9a-f]{6}$/);
    expect(t!.width).toBe(320);
    expect(t!.samples).toHaveLength(60);
    expect(t!.samples[0].key).toBe(true);
    expect(t!.samples.filter(s => s.key).length).toBe(2);
    const times = t!.samples.map(s => s.t).sort((a, b) => a - b);
    times.forEach((x, i) => expect(x).toBeCloseTo(i / 30, 4));
    // En présence d'images B, l'ordre de décodage diffère de l'ordre de présentation.
    expect(t!.samples.map(s => s.t)).not.toEqual(times);
  });

  it('moov en tête (faststart) et données à leur place', async () => {
    const file = make('fs.mp4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart');
    const t = await track(file), size = fs.statSync(file).size;
    expect(t!.samples.every(s => s.off > 0 && s.off + s.size <= size)).toBe(true);
  });

  it('H.265 : chaîne de codec WebCodecs', async () => {
    const t = await track(make('h.mp4', '-c:v', 'libx265', '-tag:v', 'hvc1', '-pix_fmt', 'yuv420p', '-x265-params', 'log-level=none'));
    expect(t!.codec).toMatch(/^hvc1\.1\.6\.L\d+/);
  });

  it('MP4 fragmenté : laissé au lecteur (la table de moov ne décrit que le début)', async () => {
    expect(await track(make('frag.mp4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-g', '15', '-movflags', 'frag_keyframe'))).toBeNull();
  });

  it('vidéo tournée (téléphone) : laissée au lecteur, qui sait la redresser', async () => {
    const file = make('r.mp4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p');
    const rot = path.join(dir, 'rot.mp4');
    spawnSync(FFMPEG, ['-v', 'error', '-y', '-display_rotation', '90', '-i', file, '-c', 'copy', rot]);
    expect(await track(rot)).toBeNull();
  });

  it('fichier abîmé ou qui n\'est pas un MP4 : null, sans exception', async () => {
    const file = make('t.mp4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p');
    const buf = fs.readFileSync(file);
    const cut = buf.subarray(0, buf.length - 200); // moov tronqué
    expect(await readVideoTrack(async (o, l) => new Uint8Array(cut.buffer, cut.byteOffset + o, Math.max(0, Math.min(l, cut.length - o))), cut.length)).toBeNull();
    const junk = new Uint8Array(4096).map((_, i) => (i * 7919) & 255);
    expect(await readVideoTrack(async (o, l) => junk.subarray(o, o + l), junk.length)).toBeNull();
  });

  // Fichiers piégés : on modifie un vrai MP4 octet par octet.
  const patched = (file: string, edit: (b: Buffer, find: (type: string) => number) => Buffer) => {
    const b = Buffer.from(fs.readFileSync(file));
    return edit(b, type => b.indexOf(Buffer.from(type, 'latin1')) - 4);
  };
  const readBuf = (b: Buffer) => readVideoTrack(async (o, l) => new Uint8Array(b.buffer, b.byteOffset + o, Math.max(0, Math.min(l, b.length - o))), b.length);

  it('image annoncée démesurée (stsz à taille fixe de 1 Go) : refusée', async () => {
    const b = patched(make('big.mp4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p'), (buf, at) => { const s = at('stsz'); buf.writeUInt32BE(1 << 30, s + 12); return buf; });
    expect(await readBuf(b)).toBeNull();
  });

  it('moov bourrée de millions de mini-boîtes : refusée sans tout parcourir', async () => {
    const b = patched(make('many.mp4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'), (buf, at) => {
      const m = at('moov'), size = buf.readUInt32BE(m), extra = 20_001 * 8;
      const free = Buffer.alloc(extra);
      for (let o = 0; o < extra; o += 8) { free.writeUInt32BE(8, o); free.write('free', o + 4, 'latin1'); }
      const out = Buffer.concat([buf.subarray(0, m + 8), free, buf.subarray(m + 8)]);
      out.writeUInt32BE(size + extra, m);
      return out;
    });
    const t0 = performance.now();
    expect(await readBuf(b)).toBeNull();
    expect(performance.now() - t0).toBeLessThan(500);
  });
});
