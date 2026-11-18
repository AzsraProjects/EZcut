import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

// Sous Windows, la molette sur une liste déroulante qui a le focus change sa valeur sans l'ouvrir :
// en faisant défiler un panneau, on pouvait changer la cadence du projet sans le voir. La liste perd le focus avant.
document.addEventListener('wheel', e => {
  const t = e.target;
  if ((t instanceof HTMLSelectElement || (t instanceof HTMLInputElement && t.type === 'number')) && document.activeElement === t) t.blur();
}, { capture: true, passive: true });

createRoot(document.getElementById('root')!).render(<App />);
