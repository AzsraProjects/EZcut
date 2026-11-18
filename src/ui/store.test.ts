import { beforeEach, describe, expect, it } from 'vitest';
import { emptyProject } from '../core/types';
import { useStore } from './store';

const st = () => useStore.getState();
const rename = (name: string) => (p: ReturnType<typeof emptyProject>) => ({ ...p, name });

beforeEach(() => st().load(emptyProject(), null));

describe('annulation', () => {
  it('un geste continu (checkpoint puis réglages) vaut une seule étape', () => {
    st().checkpoint();
    for (const n of ['a', 'b', 'c']) st().apply(rename(n), false);
    expect(st().project.name).toBe('c');
    expect(st().past).toHaveLength(1);
    st().undo();
    expect(st().project.name).toBe('Projet sans titre');
    st().redo();
    expect(st().project.name).toBe('c');
  });
  it('un début de geste sans changement ne crée pas d\'étape et garde « rétablir »', () => {
    st().apply(rename('a'));
    st().undo();
    expect(st().future).toHaveLength(1);
    st().checkpoint(); // clic sur un curseur, sans le bouger
    expect(st().future).toHaveLength(1);
    st().undo(); // rien à annuler : l'étape vide est ignorée
    expect(st().project.name).toBe('Projet sans titre');
    st().redo();
    expect(st().project.name).toBe('a');
  });
  it('un vrai changement efface « rétablir »', () => {
    st().apply(rename('a')); st().undo();
    st().checkpoint(); st().apply(rename('b'), false);
    expect(st().future).toHaveLength(0);
  });
  it('une mise à jour technique n\'est ni une modification ni une étape', () => {
    st().applySilent(rename('relié'));
    expect(st().project.name).toBe('relié');
    expect(st().dirty).toBe(false);
    expect(st().past).toHaveLength(0);
  });
});
