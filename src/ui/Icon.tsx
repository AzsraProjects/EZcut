/** Icône du jeu défini dans index.html. fill=true pour les pictogrammes pleins (lecture, pause). */
export function Icon({ name, fill }: { name: string; fill?: boolean }) {
  return <svg className={fill ? 'i f' : 'i'} aria-hidden="true"><use href={`#i-${name}`} /></svg>;
}
