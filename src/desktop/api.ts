/** Pont vers le processus principal Electron (voir electron/preload.cjs). Absent dans un navigateur. */

export interface ImportedFile {
  path: string; url: string; name: string;
  kind: 'video' | 'audio' | 'image';
  duration: number; width: number; height: number; hasAudio: boolean;
}
export interface RecentProject { path: string; name: string; folder: string; modified: number; }
export interface AudioSegment { path: string | null; in: number; dur: number; volume: number; fadeIn?: number; fadeOut?: number; }
export interface ExportRequest {
  width: number; height: number; fps: number; frames: number; name: string;
  /** Une liste de segments par piste sonore : clips vidéo, musique, incrustations. Un segment sans chemin est un silence. */
  audio: AudioSegment[][];
  codec?: 'h264' | 'hevc';
  /** Forcer l'encodage logiciel, même si la carte graphique sait encoder. */
  software?: boolean;
  /** Test automatique uniquement : chemin de sortie imposé, sans dialogue. */
  outPath?: string;
}
export interface AutoTest { media: string[]; out: string; height?: number; codec?: 'h264' | 'hevc'; }

export type UpdateState = { status: 'available'; version: string; notes: string } | { status: 'downloading'; percent: number } | { status: 'ready'; version: string } | { status: 'error' };

export interface ControlStatus { enabled: boolean; port: number | null; }
export interface ControlRequest { id: number; method: string; params: Record<string, unknown>; }

export interface EzApi {
  /** Écrit dans le journal local de l'application. */
  log(level: 'info' | 'warn' | 'error', scope: string, msg: string, data?: unknown): void;
  openLogs(): Promise<void>;
  controlStatus(): Promise<ControlStatus>;
  controlEnable(on: boolean): Promise<ControlStatus>;
  onControl(fn: (req: ControlRequest) => void): void;
  controlReply(id: number, ok: boolean, value: unknown): Promise<void>;
  version(): Promise<string>;
  onUpdate(fn: (state: UpdateState) => void): void;
  updateDownload(): Promise<void>;
  /** Redémarre et installe. Renvoie false si un export est en cours. */
  updateInstall(): Promise<boolean>;
  pickMedia(): Promise<ImportedFile[]>;
  importPaths(paths: string[]): Promise<ImportedFile[]>;
  /** Réouverture d'un projet : le processus principal décide, avec l'utilisateur, quels fichiers redeviennent lisibles. */
  relinkMedia(paths: string[]): Promise<ImportedFile[]>;
  /** Bande de n images (JPEG, w×h chacune) d'une vidéo déjà autorisée, faite par FFmpeg et gardée en cache ; null si impossible. */
  mediaSprite(file: string, n: number, dur: number, w: number, h: number): Promise<Uint8Array | null>;
  /** Montre dans l'explorateur un média déjà importé. */
  revealMedia(path: string): Promise<void>;
  newProject(): Promise<void>;
  confirmDiscard(): Promise<'save' | 'discard' | 'cancel'>;
  pathForFile(file: File): string;
  saveProject(json: string, saveAs: boolean): Promise<string | null>;
  /** Réécrit le projet dans son fichier, s'il en a déjà un ; null sinon. */
  autosaveProject(json: string): Promise<string | null>;
  openProject(): Promise<{ path: string; json: string } | null>;
  /** Projets ouverts ou enregistrés récemment et toujours présents, du plus récent au plus ancien. */
  recentProjects(): Promise<RecentProject[]>;
  /** Rouvre un projet de cette liste (et seulement d'elle). */
  openRecent(path: string): Promise<{ path: string; json: string } | null>;
  forgetRecent(path: string): Promise<void>;
  /** À appeler une fois le fichier ouvert reconnu comme un projet valide : il devient le projet courant. */
  projectOpened(): Promise<void>;
  /** Encodeur matériel disponible pour chaque codec (nvenc, qsv, amf), ou null. */
  encoders(): Promise<{ h264: string | null; hevc: string | null }>;
  setDirty(dirty: boolean): Promise<void>;
  closeWindow(): Promise<void>;
  onSaveAndClose(fn: () => void): void;
  autosaveWrite(json: string): Promise<void>;
  autosaveRead(): Promise<{ savedAt: number; json: string } | null>;
  autosaveClear(): Promise<void>;
  exportStart(req: ExportRequest): Promise<{ ok: true; path: string } | { ok: false; error?: string }>;
  exportFrame(pixels: Uint8Array): Promise<void>;
  exportFinish(): Promise<{ ok: boolean; error?: string; path?: string }>;
  exportCancel(): Promise<void>;
  showLastExport(): Promise<void>;
  /** Enregistre une image PNG à l'emplacement choisi par l'utilisateur. Renvoie le chemin, ou null s'il a renoncé. */
  saveSnapshot(png: Uint8Array, name: string): Promise<string | null>;
  autoTest(): Promise<AutoTest | null>;
  autoTestDone(result: unknown): Promise<void>;
}

declare global { interface Window { ez?: EzApi; } }

export const ez: EzApi | undefined = typeof window !== 'undefined' ? window.ez : undefined;
