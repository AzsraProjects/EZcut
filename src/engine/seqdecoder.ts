/** Décodage d'une vidéo dans l'ordre, image après image, avec WebCodecs (décodeur de la carte graphique quand il existe).
 *  Sert à l'export : là où le lecteur du navigateur redécode depuis l'image clé précédente à chaque recherche,
 *  ce décodeur avance d'une image à la fois et ne revient en arrière qu'en cas de saut. */
import { readVideoTrack, type Reader, type VideoTrack } from './mp4';

/** Lit un fichier par plages d'octets (protocole ezmedia://), avec une fenêtre en mémoire : les images se suivent dans le fichier. */
/** Plus grande lecture d'un seul tenant : une image, ou la boîte moov (bornées par mp4.ts). */
const MAX_READ = 64 * 1024 * 1024;
function rangeReader(url: string): { read: Reader; size: () => Promise<number> } {
  const WINDOW = 8 * 1024 * 1024;
  let win: { off: number; data: Uint8Array } | null = null;
  const get = async (off: number, len: number) => {
    if (len > MAX_READ) throw new Error('lecture trop grande');
    // Un fichier qui ne répond plus (partage réseau) fait échouer la lecture au lieu de figer l'export.
    const r = await fetch(url, { headers: { Range: `bytes=${off}-${off + len - 1}` }, signal: AbortSignal.timeout(10_000) });
    if (r.status !== 206) { await r.body?.cancel(); throw new Error(`lecture par plage impossible (${r.status})`); }
    return new Uint8Array(await r.arrayBuffer());
  };
  return {
    size: async () => {
      const r = await fetch(url, { headers: { Range: 'bytes=0-0' }, signal: AbortSignal.timeout(10_000) });
      if (r.status !== 206) { await r.body?.cancel(); throw new Error('lecture par plage impossible'); }
      await r.arrayBuffer();
      const m = /\/(\d+)$/.exec(r.headers.get('content-range') ?? '');
      if (!m) throw new Error('taille inconnue');
      return Number(m[1]);
    },
    read: async (off, len) => {
      if (win && off >= win.off && off + len <= win.off + win.data.length) return win.data.subarray(off - win.off, off - win.off + len);
      if (len > WINDOW) return get(off, len);
      win = { off, data: await get(off, WINDOW) };
      return win.data.subarray(0, Math.min(len, win.data.length));
    },
  };
}

const tracks = new Map<string, Promise<VideoTrack | null>>();
/** Table des images d'un fichier, lue une fois par export. */
function trackOf(url: string) {
  let p = tracks.get(url);
  if (!p) {
    p = (async () => {
      const r = rangeReader(url), size = await r.size();
      return readVideoTrack(r.read, size);
    })().catch(() => null);
    tracks.set(url, p);
  }
  return p;
}
export function forgetTracks() { tracks.clear(); }

const EPS = 0.0005;

export class SeqDecoder {
  /** Dernier instant demandé ; -1 avant la première demande. */
  last = -1;
  private dec: VideoDecoder;
  private config: VideoDecoderConfig;
  /** Prochaine image à envoyer au décodeur (ordre de décodage). */
  private next = 0;
  private out: VideoFrame[] = [];
  private cur: VideoFrame | null = null;
  private failure: Error | null = null;
  private wake: (() => void) | null = null;
  /** Événement arrivé pendant qu'on n'attendait pas (lecture du fichier en cours) : la prochaine attente ne doit pas le manquer. */
  private pending = false;
  /** Nombre d'images sorties du décodeur : le délai de blocage court depuis la dernière. */
  private produced = 0;
  private flushed = false;
  private flushing: Promise<void> | null = null;
  /** Images dans l'ordre de présentation, pour trouver l'image clé qui précède un instant. */
  private keys: { t: number; i: number }[];

  private constructor(private track: VideoTrack, private read: Reader, config: VideoDecoderConfig) {
    this.config = config;
    this.keys = track.samples.flatMap((s, i) => (s.key ? [{ t: s.t, i }] : [])).sort((a, b) => a.t - b.t);
    this.dec = this.make();
  }

  /** Null si le fichier ou son codec ne se décodent pas ainsi : l'export reprend alors la voie du lecteur. */
  static async open(url: string): Promise<SeqDecoder | null> {
    if (typeof VideoDecoder === 'undefined' || !url.startsWith('ezmedia:')) return null;
    const track = await trackOf(url);
    if (!track) return null;
    const config: VideoDecoderConfig = { codec: track.codec, description: track.description, codedWidth: track.width, codedHeight: track.height, optimizeForLatency: false };
    const ok = await VideoDecoder.isConfigSupported(config).catch(() => null);
    if (!ok?.supported) return null;
    // Une fenêtre de lecture par décodeur : deux décodeurs d'un même fichier ne se la volent pas.
    return new SeqDecoder(track, rangeReader(url).read, config);
  }

  private make() {
    // Une image tardive d'un décodeur déjà remplacé (ancienne position) est jetée.
    const dec: VideoDecoder = new VideoDecoder({
      output: f => {
        if (dec !== this.dec) { f.close(); return; }
        this.produced++;
        // Les images doivent sortir dans l'ordre de présentation ; une image plus ancienne que l'image retenue ne sert plus.
        if (this.cur && f.timestamp < this.cur.timestamp) { f.close(); return; }
        this.out.push(f); this.poke();
      },
      error: e => { if (dec === this.dec) { this.failure = e instanceof Error ? e : new Error(String(e)); this.poke(); } },
    });
    dec.configure(this.config);
    dec.addEventListener('dequeue', () => { if (dec === this.dec) this.poke(); });
    return dec;
  }
  private poke() { const w = this.wake; this.wake = null; if (w) w(); else this.pending = true; }
  private waitEvent() {
    if (this.pending) { this.pending = false; return Promise.resolve(); }
    return new Promise<void>(r => { this.wake = r; setTimeout(r, 2000); });
  }

  /** Image clé (rang dans l'ordre de décodage) qui précède t. */
  private keyBefore(t: number) {
    let k = 0;
    for (const x of this.keys) { if (x.t <= t + EPS) k = x.i; else break; }
    return k;
  }
  /** Repart de l'image clé k. */
  private restart(k: number) {
    this.drop();
    try { this.dec.close(); } catch { /* déjà fermé */ }
    this.dec = this.make();
    this.next = k; this.flushed = false; this.flushing = null; this.pending = false;
  }
  private drop() { for (const f of this.out) f.close(); this.out = []; this.cur?.close(); this.cur = null; }

  /** Image affichée à l'instant t (la dernière dont l'instant de présentation est au plus t), comme le lecteur.
   *  L'image appartient au décodeur : elle doit être utilisée (téléversée) avant l'appel suivant, et ne pas être fermée. */
  async frameAt(t: number): Promise<VideoFrame | null> {
    if (this.failure) throw this.failure;
    // Retour en arrière, ou saut de plus de 3 s : on repart d'une image clé plutôt que de tout décoder.
    // En avant, on ne repart que si l'image clé utile est plus loin que la position de décodage.
    const back = this.last < 0 || t < this.last - EPS || (this.cur && this.cur.timestamp / 1e6 > t + EPS);
    if (back) this.restart(this.keyBefore(t));
    else if (t > this.last + 3) { const k = this.keyBefore(t); if (k > this.next) this.restart(k); }
    this.last = t;
    // 15 s sans aucune image décodée : le décodeur est bloqué et l'export reprend la voie du lecteur.
    let since = performance.now(), seen = this.produced;
    for (;;) {
      if (this.failure) throw this.failure;
      if (this.produced !== seen) { seen = this.produced; since = performance.now(); }
      if (performance.now() - since > 15000) throw new Error('décodage bloqué');
      // Les images sortent dans l'ordre de présentation.
      this.out.sort((a, b) => a.timestamp - b.timestamp);
      while (this.out.length && this.out[0].timestamp / 1e6 <= t + EPS) { this.cur?.close(); this.cur = this.out.shift()!; }
      if (this.out.length || this.flushed) return this.cur ?? this.out[0] ?? null;
      if (this.next >= this.track.samples.length) {
        // Fin du fichier : on vide le décodeur sans attendre la fin du vidage, car un décodeur matériel ne rend ses
        // dernières images qu'au fur et à mesure qu'on libère les précédentes ; l'attendre ici bloquerait tout.
        const dec = this.dec; // un vidage interrompu par un redémarrage ne compte pas comme une panne
        this.flushing ??= dec.flush().then(() => { if (dec === this.dec) { this.flushed = true; this.poke(); } }, e => { if (dec === this.dec) { this.failure ??= e instanceof Error ? e : new Error(String(e)); this.poke(); } });
        await this.waitEvent();
        continue;
      }
      // Quelques images d'avance dans la file du décodeur, puis attente d'une sortie.
      while (this.dec.decodeQueueSize < 6 && this.next < this.track.samples.length) {
        const s = this.track.samples[this.next++];
        const data = await this.read(s.off, s.size);
        if (data.length !== s.size) throw new Error('fichier tronqué');
        this.dec.decode(new EncodedVideoChunk({ type: s.key ? 'key' : 'delta', timestamp: Math.round(s.t * 1e6), duration: Math.round(s.dur * 1e6), data }));
      }
      await this.waitEvent();
    }
  }

  close() { this.drop(); try { this.dec.close(); } catch { /* déjà fermé */ } }
}
