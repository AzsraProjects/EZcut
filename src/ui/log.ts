/** Journal côté interface : tout part dans le fichier local tenu par le processus principal (electron/logger.cjs). */
import { ez } from '../desktop/api';

type Level = 'info' | 'warn' | 'error';
const write = (level: Level) => (scope: string, msg: string, data?: unknown) => {
  if (ez) ez.log(level, scope, msg, data);
  else if (level !== 'info') console[level](`[${scope}] ${msg}`, data ?? '');
};
export const log = { info: write('info'), warn: write('warn'), error: write('error') };

/** Les erreurs que personne n'a traitées finissent dans le journal, avec leur pile d'appels. */
export function captureErrors() {
  addEventListener('error', e => log.error('interface', e.message, e.error instanceof Error ? e.error.stack : `${e.filename}:${e.lineno}`));
  addEventListener('unhandledrejection', e => log.error('interface', 'promesse rejetée sans traitement', e.reason instanceof Error ? e.reason.stack : String(e.reason)));
}
