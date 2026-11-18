/** Pont vers le processus principal Electron (voir electron/preload.cjs). Absent dans un navigateur. */

export interface ImportedFile {
  path: string; url: string; name: string;
  kind: 'video' | 'audio' | 'image';
  duration: number; width: number; height: number; hasAudio: boolean;
}
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

export interface EzApi {
  version(): Promise<string>;
  onUpdate(fn: (state: UpdateState) => void): void;
  updateDownload(): Promise<void>;
  /** Redémarre et installe. Renvoie false si un export est en cours. */
  updateInstall(): Promise<boolean>;
  pickMedia(): Promise<ImportedFile[]>;
  importPaths(paths: string[]): Promise<ImportedFile[]>;
  /** Réouverture d'un projet : le processus principal décide, avec l'utilisateur, quels fichiers redeviennent lisibles. */
  relinkMedia(paths: string[]): Promise<ImportedFile[]>;
  newProject(): Promise<void>;
  pathForFile(file: File): string;
  saveProject(json: string, saveAs: boolean): Promise<string | null>;
  openProject(): Promise<{ path: string; json: string } | null>;
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
  autoTest(): Promise<AutoTest | null>;
  autoTestDone(result: unknown): Promise<void>;
}

declare global { interface Window { ez?: EzApi; } }

export const ez: EzApi | undefined = typeof window !== 'undefined' ? window.ez : undefined;
