/** Ce qui est en train d'être glissé vers la timeline. Pendant le survol, le navigateur ne laisse lire que le type des
 *  données glissées, pas leur contenu : on le note ici au début du geste pour pouvoir montrer où l'élément va se poser. */
export const dragging: { media: string | null; clip: string | null } = { media: null, clip: null };
export const endDrag = () => { dragging.media = null; dragging.clip = null; };
