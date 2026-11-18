/** Lecture minimale d'un fichier MP4 / MOV (ISO BMFF) : la table des images de la piste vidéo, pour les décoder dans
 *  l'ordre avec WebCodecs pendant l'export. Rien n'est décodé ici ; seuls les en-têtes sont lus.
 *  Le fichier peut venir d'un inconnu : chaque taille et chaque décalage est borné, et toute incohérence renvoie null. */

export interface Sample {
  /** Position et taille des données dans le fichier. */
  off: number; size: number;
  /** Instant de présentation, en secondes, liste de montage du fichier (elst) appliquée comme le fait le lecteur. */
  t: number;
  /** Durée, en secondes. */
  dur: number;
  key: boolean;
}

export interface VideoTrack {
  codec: string;
  description?: Uint8Array;
  width: number; height: number;
  /** Images dans l'ordre de décodage. */
  samples: Sample[];
}

export type Reader = (off: number, len: number) => Promise<Uint8Array>;

/** Bornes contre un fichier piégé : taille de la boîte moov, nombre d'images (9 h à 60 i/s), taille d'une image, boîtes par niveau. */
const MAX_MOOV = 64 * 1024 * 1024, MAX_SAMPLES = 2_000_000, MAX_SAMPLE = 64 * 1024 * 1024, MAX_BOXES = 10_000;
const fourcc = (b: Uint8Array, o: number) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
const hex2 = (n: number) => n.toString(16).padStart(2, '0');

class Bad extends Error {}
const need = (ok: boolean) => { if (!ok) throw new Bad(); };

interface Box { type: string; s: number; e: number; }
/** Boîtes contenues entre s et e (positions dans buf). */
function boxes(v: DataView, s: number, e: number, only?: string, first = false): Box[] {
  const out: Box[] = [];
  let o = s, n = 0;
  while (o + 8 <= e) {
    need(++n <= MAX_BOXES); // une boîte bourrée de millions de petites boîtes est refusée, pas parcourue
    let size = v.getUint32(o), head = 8;
    const c = v.getUint32(o + 4), type = String.fromCharCode(c >>> 24, (c >>> 16) & 255, (c >>> 8) & 255, c & 255);
    if (size === 1) { need(o + 16 <= e); size = Number(v.getBigUint64(o + 8)); head = 16; }
    else if (size === 0) size = e - o;
    need(size >= head && o + size <= e);
    if (!only || type === only) { out.push({ type, s: o + head, e: o + size }); if (first) break; }
    o += size;
  }
  return out;
}
const child = (v: DataView, b: Box | undefined, type: string) => (b ? boxes(v, b.s, b.e, type, true)[0] : undefined);
/** Boîte b, à condition qu'elle contienne au moins n octets. */
const sized = (b: Box | undefined, n: number) => { need(!!b && b.e - b.s >= n); return b!; };
const path = (v: DataView, b: Box | undefined, ...types: string[]) => types.reduce<Box | undefined>((x, t) => child(v, x, t), b);

/** Trouve et lit la boîte moov, où qu'elle soit dans le fichier. */
async function readMoov(read: Reader, size: number): Promise<DataView | null> {
  let o = 0;
  for (let guard = 0; o + 8 <= size && guard < 10000; guard++) {
    const h = await read(o, 16), v = new DataView(h.buffer, h.byteOffset, h.byteLength);
    if (h.length < 8) return null;
    let len = v.getUint32(0);
    const type = fourcc(h, 4);
    if (len === 1) { if (h.length < 16) return null; len = Number(v.getBigUint64(8)); }
    else if (len === 0) len = size - o;
    if (len < 8 || o + len > size) return null;
    if (type === 'moov') {
      if (len > MAX_MOOV) return null;
      const b = await read(o, len);
      return b.length === len ? new DataView(b.buffer, b.byteOffset, b.byteLength) : null;
    }
    o += len;
  }
  return null;
}

/** Chaîne de codec WebCodecs et description, depuis l'entrée de description des images. Null : format non pris en charge ici. */
function codecOf(v: DataView, entry: Box, format: string): { codec: string; description?: Uint8Array } | null {
  const u8 = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
  const kids = boxes(v, entry.s + 78, entry.e); // une entrée visuelle a 78 octets d'en-tête avant ses boîtes
  const cfg = (t: string) => { const b = kids.find(k => k.type === t); return b ? u8.slice(b.s, b.e) : null; };
  if (format === 'avc1' || format === 'avc3') {
    const c = cfg('avcC'); if (!c || c.length < 7) return null;
    return { codec: `${format}.${hex2(c[1])}${hex2(c[2])}${hex2(c[3])}`, description: c };
  }
  if (format === 'hvc1' || format === 'hev1') {
    const c = cfg('hvcC'); if (!c || c.length < 23) return null;
    const space = c[1] >> 6, tier = (c[1] >> 5) & 1, profile = c[1] & 31;
    let compat = ((c[2] << 24) | (c[3] << 16) | (c[4] << 8) | c[5]) >>> 0, rev = 0;
    for (let i = 0; i < 32; i++) { rev = (rev << 1) | (compat & 1); compat >>>= 1; }
    const cons = [...c.slice(6, 12)];
    while (cons.length && cons[cons.length - 1] === 0) cons.pop();
    const tail = cons.map(x => '.' + x.toString(16).toUpperCase()).join('');
    return { codec: `${format}.${['', 'A', 'B', 'C'][space]}${profile}.${(rev >>> 0).toString(16).toUpperCase()}.${tier ? 'H' : 'L'}${c[12]}${tail}`, description: c };
  }
  return null;
}

/** Table des images de la première piste vidéo. Null si le fichier n'est pas lisible ici (le moteur reprend alors la voie lente). */
export async function readVideoTrack(read: Reader, size: number): Promise<VideoTrack | null> {
  try {
    const v = await readMoov(read, size);
    if (!v) return null;
    const moov: Box = { type: 'moov', s: 8, e: v.byteLength };
    if (v.getUint32(0) === 1) moov.s = 16;
    const mvhd = sized(child(v, moov, 'mvhd'), 24);
    const movieScale = v.getUint8(mvhd.s) === 1 ? v.getUint32(mvhd.s + 20) : v.getUint32(mvhd.s + 12);
    // MP4 fragmenté : la table de moov ne décrit que le début, le reste est dans des moof.
    if (child(v, moov, 'mvex')) return null;
    for (const trak of boxes(v, moov.s, moov.e, 'trak').slice(0, 64)) {
      const hdlr = path(v, trak, 'mdia', 'hdlr');
      if (!hdlr || hdlr.e - hdlr.s < 12 || fourcc(new Uint8Array(v.buffer, v.byteOffset, v.byteLength), hdlr.s + 8) !== 'vide') continue;
      // Une vidéo tournée (téléphone tenu de côté) porte une matrice de rotation : le lecteur la redresse, pas le décodeur.
      const tkhd = sized(child(v, trak, 'tkhd'), 84);
      const m = tkhd.s + (v.getUint8(tkhd.s) === 1 ? 52 : 40);
      need(m + 20 <= tkhd.e);
      if (v.getInt32(m) !== 0x10000 || v.getInt32(m + 4) !== 0 || v.getInt32(m + 12) !== 0 || v.getInt32(m + 16) !== 0x10000) return null;
      const mdhd = sized(path(v, trak, 'mdia', 'mdhd'), 24);
      const scale = v.getUint8(mdhd.s) === 1 ? v.getUint32(mdhd.s + 20) : v.getUint32(mdhd.s + 12);
      need(scale > 0 && movieScale > 0);
      const stbl = path(v, trak, 'mdia', 'minf', 'stbl'); need(!!stbl);
      const stsd = sized(child(v, stbl, 'stsd'), 8);
      need(v.getUint32(stsd.s + 4) >= 1);
      const entry = boxes(v, stsd.s + 8, stsd.e, undefined, true)[0]; need(!!entry && entry.e - entry.s >= 78);
      const codec = codecOf(v, entry, entry.type);
      if (!codec) continue; // une autre piste vidéo est peut-être lisible
      const width = v.getUint16(entry.s + 24), height = v.getUint16(entry.s + 26);

      // Décalage de présentation donné par la liste de montage : vide initial, puis début dans le média.
      let shift = 0;
      const elst = path(v, trak, 'edts', 'elst');
      if (elst) {
        const v1 = v.getUint8(elst.s) === 1, n = v.getUint32(elst.s + 4);
        let o = elst.s + 8, empty = 0, start = 0, edits = 0;
        for (let i = 0; i < n && i < 64; i++) {
          need(o + (v1 ? 20 : 12) <= elst.e);
          const dur = v1 ? Number(v.getBigUint64(o)) : v.getUint32(o), mt = v1 ? Number(v.getBigInt64(o + 8)) : v.getInt32(o + 4);
          const rate = v.getInt32(o + (v1 ? 16 : 8));
          o += v1 ? 20 : 12;
          if (mt === -1) { if (edits) return null; empty += dur; continue; }
          // Montage à plusieurs segments ou ralenti : le lecteur seul sait le rejouer exactement.
          if (++edits > 1 || rate !== 0x10000) return null;
          start = mt;
        }
        shift = empty / movieScale - start / scale;
      }

      const box = (t: string) => child(v, stbl, t);
      const stsz = box('stsz'), stco = box('stco'), co64 = box('co64'), stsc = box('stsc'), stts = box('stts');
      need(!!stsz && !!stsc && !!stts && (!!stco || !!co64));
      need(stsz!.e - stsz!.s >= 12);
      const count = v.getUint32(stsz!.s + 8), fixed = v.getUint32(stsz!.s + 4);
      need(count > 0 && count <= MAX_SAMPLES && fixed <= MAX_SAMPLE && (fixed > 0 || stsz!.s + 12 + count * 4 <= stsz!.e));
      const sizes = new Uint32Array(count);
      for (let i = 0; i < count; i++) { sizes[i] = fixed || v.getUint32(stsz!.s + 12 + i * 4); need(sizes[i] > 0 && sizes[i] <= MAX_SAMPLE); }
      // Décalages : chaque bloc (chunk) contient un nombre d'images donné par stsc.
      const co = (co64 ?? stco)!, nChunks = v.getUint32(co.s + 4), wide = !!co64;
      need(co.s + 8 + nChunks * (wide ? 8 : 4) <= co.e);
      const chunk = (i: number) => (wide ? Number(v.getBigUint64(co.s + 8 + i * 8)) : v.getUint32(co.s + 8 + i * 4));
      const nsc = v.getUint32(stsc!.s + 4);
      need(nsc > 0 && stsc!.s + 8 + nsc * 12 <= stsc!.e);
      const offs = new Float64Array(count);
      let k = 0;
      for (let e = 0; e < nsc && k < count; e++) {
        const first = v.getUint32(stsc!.s + 8 + e * 12) - 1, per = v.getUint32(stsc!.s + 12 + e * 12);
        const last = e + 1 < nsc ? v.getUint32(stsc!.s + 8 + (e + 1) * 12) - 1 : nChunks;
        need(per > 0 && first >= 0 && last <= nChunks && first <= last);
        for (let c = first; c < last && k < count; c++) { let o = chunk(c); for (let j = 0; j < per && k < count; j++) { offs[k] = o; o += sizes[k]; k++; } }
      }
      need(k === count);
      // Instants : stts donne les durées dans l'ordre de décodage, ctts le décalage de présentation (images B).
      const dts = new Float64Array(count), durs = new Float64Array(count);
      const nts = v.getUint32(stts!.s + 4); need(stts!.s + 8 + nts * 8 <= stts!.e);
      let t = 0; k = 0;
      for (let e = 0; e < nts && k < count; e++) { const n = v.getUint32(stts!.s + 8 + e * 8), d = v.getUint32(stts!.s + 12 + e * 8); for (let j = 0; j < n && k < count; j++) { dts[k] = t; durs[k] = d; t += d; k++; } }
      need(k === count);
      const cts = new Float64Array(count);
      const ctts = box('ctts');
      if (ctts) {
        const n = v.getUint32(ctts.s + 4); need(ctts.s + 8 + n * 8 <= ctts.e);
        k = 0;
        // Décalage lu signé même en version 0 : des logiciels d'enregistrement y écrivent des valeurs négatives.
        for (let e = 0; e < n && k < count; e++) { const c = v.getUint32(ctts.s + 8 + e * 8), o = v.getInt32(ctts.s + 12 + e * 8); for (let j = 0; j < c && k < count; j++) cts[k++] = o; }
      }
      const keys = new Uint8Array(count);
      const stss = box('stss');
      if (stss) { const n = v.getUint32(stss.s + 4); need(stss.s + 8 + n * 4 <= stss.e); for (let i = 0; i < n; i++) { const s = v.getUint32(stss.s + 8 + i * 4) - 1; if (s >= 0 && s < count) keys[s] = 1; } }
      else keys.fill(1);
      need(keys[0] === 1);
      const samples: Sample[] = new Array(count);
      for (let i = 0; i < count; i++) {
        need(offs[i] + sizes[i] <= size);
        samples[i] = { off: offs[i], size: sizes[i], t: (dts[i] + cts[i]) / scale + shift, dur: durs[i] / scale, key: keys[i] === 1 };
      }
      return { ...codec, width, height, samples };
    }
    return null;
  } catch (e) {
    if (e instanceof Bad || e instanceof RangeError) return null;
    throw e;
  }
}
