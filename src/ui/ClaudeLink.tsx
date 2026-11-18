import { useEffect, useState } from 'react';
import { ez, type ControlStatus } from '../desktop/api';
import { Icon } from './Icon';

/** Réglage du lien avec Claude : un interrupteur, l'état, et la marche à suivre. */
export function ClaudeLink({ onClose }: { onClose: () => void }) {
  const [st, setSt] = useState<ControlStatus | null>(null);
  useEffect(() => { void ez?.controlStatus().then(setSt).catch(() => setSt({ enabled: false, port: null })); }, []);
  const toggle = async () => { if (ez && st) setSt(await ez.controlEnable(!st.enabled)); };
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Lien avec Claude" onPointerDown={e => { if (e.target === e.currentTarget) onClose(); }} onKeyDown={e => { if (e.key === 'Escape') onClose(); }}>
      <div className="dialog wide">
        <header><b>Lien avec Claude</b><button className="ib small" aria-label="Fermer" onClick={onClose}><Icon name="x" /></button></header>
        <p>Une fois le lien activé, Claude peut piloter EZcut depuis VS Code : importer vos fichiers, monter, poser titres et effets, regarder le résultat, exporter. Vous voyez chaque modification en direct et pouvez l'annuler avec <kbd>Ctrl</kbd> + <kbd>Z</kbd>.</p>
        {!ez ? <p className="warn">Le lien n'existe que dans l'application de bureau.</p> : (
          <div className="linkrow">
            <button className="sw" role="switch" aria-checked={!!st?.enabled} aria-label="Activer le lien avec Claude" autoFocus onClick={() => void toggle()} />
            <b>{st?.enabled ? 'Lien activé' : 'Lien désactivé'}</b>
            <span className="meta">{st?.enabled ? 'Claude peut commander cette fenêtre.' : 'Personne ne peut commander EZcut de l\'extérieur.'}</span>
          </div>
        )}
        <div className="notes">
          <h4>Pour s'en servir</h4>
          <p className="li">Activez le lien ci-dessus. Il reste activé aux prochains lancements, jusqu'à ce que vous le coupiez.</p>
          <p className="li">Dans VS Code, ouvrez le dossier du projet EZcut avec Claude Code et acceptez le serveur « ezcut » qu'il propose.</p>
          <p className="li">Demandez, par exemple : « Importe les vidéos du dossier Vacances, monte-les dans l'ordre, ajoute un titre et exporte en 1080p. »</p>
          <p className="li">Depuis un autre dossier, déclarez le serveur une fois : <code>claude mcp add ezcut -- node chemin/vers/EZcut/tools/mcp/ezcut-mcp.mjs</code></p>
          <h4>Ce que cela implique</h4>
          <p className="li">Le lien n'écoute que sur cet ordinateur, avec un code qui change à chaque lancement. Rien n'est envoyé par EZcut sur Internet.</p>
          <p className="li">Claude peut lire les fichiers que vous lui demandez d'importer et écrire les vidéos exportées et les projets enregistrés, là où il l'indique. Il ne remplace jamais une vidéo existante sans le demander explicitement.</p>
          <p className="li">Les images que Claude regarde pour vous aider (aperçus de vos médias et du montage) sont transmises à Claude par VS Code, comme tout ce que vous lui montrez.</p>
        </div>
        <footer>
          <button className="btn" onClick={() => void ez?.openLogs()}><Icon name="folder" />Ouvrir le journal</button>
          <button className="btn primary" onClick={onClose}>Fermer</button>
        </footer>
      </div>
    </div>
  );
}
