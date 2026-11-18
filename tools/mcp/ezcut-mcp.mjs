#!/usr/bin/env node
// Serveur MCP d'EZcut : donne à un assistant (Claude Code, Claude Desktop…) des outils pour piloter l'application ouverte
// sur cette machine. Il ne contient aucune clé ni aucune donnée personnelle : il lit, dans le dossier de données d'EZcut,
// le port et le jeton que l'application écrit quand l'utilisateur active « Lien avec Claude ».
// Protocole : JSON-RPC 2.0 sur l'entrée et la sortie standard, un message par ligne. Aucune dépendance.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dataDir = process.env.EZCUT_USERDATA
  || (process.platform === 'win32' ? path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'ezcut')
    : process.platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Application Support', 'ezcut')
      : path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'ezcut'));
const OFF = 'EZcut n\'est pas joignable. Demandez à l\'utilisateur d\'ouvrir EZcut et d\'activer « Lien avec Claude » (bouton en haut à droite de la fenêtre), puis réessayez.';

async function call(method, params = {}) {
  let info;
  try { info = JSON.parse(fs.readFileSync(path.join(dataDir, 'control.json'), 'utf8')); } catch { throw new Error(OFF); }
  let res;
  try {
    res = await fetch(`http://127.0.0.1:${info.port}/rpc`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-EZcut-Token': info.token }, body: JSON.stringify({ method, params }) });
  } catch { throw new Error(OFF); }
  const body = await res.json().catch(() => ({ ok: false, error: 'réponse illisible' }));
  if (!body.ok) throw new Error(body.error || 'commande refusée');
  return body.result;
}

const obj = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const S = { type: 'string' }, N = { type: 'number' }, B = { type: 'boolean' }, O = { type: 'object' };
const d = (schema, description) => ({ ...schema, description });

/** Outils exposés. `method` est la commande d'EZcut appelée ; `image` signale un résultat à renvoyer comme image. */
const TOOLS = [
  { name: 'ezcut_status', method: 'status', description: 'État complet du projet ouvert dans EZcut : réglages, médias importés (avec leur id), clips de chaque piste (id, début, durée, effets, transition), tête de lecture. À appeler en premier, et après une série de modifications pour vérifier le résultat.', inputSchema: obj({}) },
  { name: 'ezcut_catalog', method: 'catalog', description: 'Liste la banque d\'EZcut : effets, filtres, transitions et modèles de titres, avec leur id. Filtrer avec query (mot du nom ou de la catégorie, en français ou en anglais). details=true ajoute les réglages de chaque entrée.', inputSchema: obj({ kind: d({ type: 'string', enum: ['all', 'effect', 'filter', 'transition', 'title'] }, 'Famille à lister (défaut : all)'), query: S, details: B }) },
  { name: 'ezcut_import', method: 'import', description: 'Importe des fichiers vidéo, audio ou image dans la bibliothèque du projet. Chemins absolus sur cette machine. Renvoie les médias avec leur id.', inputSchema: obj({ paths: d({ type: 'array', items: S }, 'Chemins absolus des fichiers') }, ['paths']) },
  { name: 'ezcut_media_preview', method: 'mediaPreview', image: true, description: 'Planche d\'images d\'un média importé (plusieurs instants, horodatés), pour voir ce qu\'il contient avant de le monter.', inputSchema: obj({ mediaId: S, count: d(N, 'Nombre d\'images, 1 à 12 (défaut 6)') }, ['mediaId']) },
  { name: 'ezcut_add_clip', method: 'addClip', description: 'Pose un média sur la timeline. track "main" (défaut) : à la suite sur la piste principale (une vidéo, une image) ou à la suite de la musique (un fichier audio), ou à la position index. "overlay" : par-dessus la vidéo, à l\'instant at (logo, image dans l\'image), à 50 % de sa taille. "sound" ou "music" : un fichier audio à l\'instant at, sur la piste Son (voix, bruitages) ou Musique.', inputSchema: obj({ mediaId: S, track: { type: 'string', enum: ['main', 'overlay', 'sound', 'music'] }, index: d(N, 'Position parmi les clips de la piste principale (0 = premier)'), at: d(N, 'Instant en secondes, pour overlay') }, ['mediaId']) },
  { name: 'ezcut_add_title', method: 'addTitle', description: 'Ajoute un titre. preset : id d\'un modèle (voir ezcut_catalog kind=title), par exemple simple, impact, lower, caption. style : champs à remplacer (font, size en fraction de la hauteur d\'image, weight, color "#rrggbb", align, stroke, strokeColor, shadow, box, boxColor, animIn/animOut parmi none, fade, slide, pop, type, animDur). position : {x, y} en fraction du cadre, 0 = centre, y positif vers le haut.', inputSchema: obj({ text: S, preset: S, at: d(N, 'Début en secondes (défaut : tête de lecture)'), duration: N, style: O, position: O }, ['text']) },
  { name: 'ezcut_edit_clip', method: 'editClip', description: 'Modifie un clip. Temps : trimStart / trimEnd (secondes à ajouter ou retirer au bord, positif vers la droite), duration, start (pistes overlay et text), index (réordonner sur la piste principale), wholeVideo=true (étendre un titre ou un logo à toute la vidéo). Son : volume 0–1, fadeIn, fadeOut. Fondu de l\'image : vfadeIn, vfadeOut (secondes). Image : transform {scale, x, y, rot, flipH, flipV}, color {bright -1..1, contrast 0..4, hue -1..1, saturation 0..4}, opacity 0–1, blend (normal, screen, multiply, add, overlay). Titre : text {content, …}.', inputSchema: obj({ clipId: S, trimStart: N, trimEnd: N, duration: N, start: N, index: N, wholeVideo: B, volume: N, fadeIn: N, fadeOut: N, opacity: N, blend: S, transform: O, color: O, text: O }, ['clipId']) },
  { name: 'ezcut_split', method: 'split', description: 'Coupe en deux le clip présent à l\'instant time sur une piste (video par défaut ; overlay, text, audio).', inputSchema: obj({ time: N, track: { type: 'string', enum: ['video', 'overlay', 'text', 'sound', 'audio'] } }, ['time']) },
  { name: 'ezcut_detach_audio', method: 'detachAudio', description: 'Détache le son d\'un clip vidéo : il devient un clip à part sur la piste sound, au même instant, réglable et coupable séparément ; le clip vidéo devient muet.', inputSchema: obj({ clipId: S }, ['clipId']) },
  { name: 'ezcut_remove_clip', method: 'removeClip', description: 'Retire un clip de la timeline (le média reste dans la bibliothèque).', inputSchema: obj({ clipId: S }, ['clipId']) },
  { name: 'ezcut_apply_effect', method: 'applyEffect', description: 'Pose un effet ou un filtre sur un clip vidéo ou image. effectId vient de ezcut_catalog. params : réglages à remplacer (noms donnés par ezcut_catalog details=true).', inputSchema: obj({ clipId: S, effectId: S, params: O }, ['clipId', 'effectId']) },
  { name: 'ezcut_edit_effect', method: 'editEffect', description: 'Modifie, désactive ou retire un effet déjà posé. uid vient de ezcut_status.', inputSchema: obj({ clipId: S, uid: S, params: O, on: B, remove: B }, ['clipId', 'uid']) },
  { name: 'ezcut_set_transition', method: 'setTransition', description: 'Pose (ou retire, avec effectId null) la transition entre un clip de la piste principale et le suivant.', inputSchema: obj({ clipId: d(S, 'Clip sortant'), effectId: { type: ['string', 'null'] }, duration: N, params: O }, ['clipId']) },
  { name: 'ezcut_marker', method: 'marker', description: 'Repères de la timeline (visibles sur la règle). action add (défaut) : pose un repère à time (défaut : tête de lecture), avec name et color "#rrggbb" facultatifs. edit : change name, color ou time du repère id. remove : supprime le repère id. clear : les supprime tous. Renvoie la liste des repères.', inputSchema: obj({ action: { type: 'string', enum: ['add', 'edit', 'remove', 'clear'] }, id: S, time: N, name: S, color: S }) },
  { name: 'ezcut_track', method: 'track', description: 'État d\'une piste : muted (son coupé, aperçu et export), hidden (image masquée, aperçu et export), locked (clips non modifiables : une piste verrouillée refuse toute modification tant qu\'elle n\'est pas déverrouillée ici).', inputSchema: obj({ track: { type: 'string', enum: ['video', 'overlay', 'text', 'sound', 'audio'] }, muted: B, hidden: B, locked: B }, ['track']) },
  { name: 'ezcut_project', method: 'projectSettings', description: 'Règle le projet : name, width et height (1920×1080 pour YouTube, 1080×1920 pour TikTok, Shorts et Reels, 1080×1080 carré), fps.', inputSchema: obj({ name: S, width: N, height: N, fps: N }) },
  { name: 'ezcut_transport', method: 'transport', description: 'Déplace la tête de lecture (time) et lance ou arrête la lecture (action).', inputSchema: obj({ time: N, action: { type: 'string', enum: ['play', 'pause'] } }) },
  { name: 'ezcut_screenshot', method: 'screenshot', image: true, description: 'Image du montage tel qu\'il sera exporté, à l\'instant time (défaut : tête de lecture). Sert à vérifier de visu un titre, un effet, un cadrage.', inputSchema: obj({ time: N, size: d(N, 'Petit côté en pixels, 180 à 1080 (défaut 540)') }) },
  { name: 'ezcut_undo', method: 'undo', description: 'Annule la dernière modification du projet (chaque commande de modification est une étape).', inputSchema: obj({}) },
  { name: 'ezcut_redo', method: 'redo', description: 'Rétablit la modification annulée.', inputSchema: obj({}) },
  { name: 'ezcut_save', method: 'save', description: 'Enregistre le projet. path : chemin absolu d\'un fichier .ezcut (obligatoire la première fois).', inputSchema: obj({ path: S }) },
  { name: 'ezcut_open', method: 'open', description: 'Ouvre un projet .ezcut. Si le projet en cours a des modifications non enregistrées, EZcut demande confirmation à l\'utilisateur.', inputSchema: obj({ path: S }, ['path']) },
  { name: 'ezcut_new', method: 'newProject', description: 'Repart d\'un projet vide. Si le projet en cours a des modifications non enregistrées, EZcut demande confirmation à l\'utilisateur.', inputSchema: obj({}) },
  { name: 'ezcut_export', method: 'export', description: 'Exporte le montage en MP4. outPath : chemin absolu se terminant par .mp4, dans un dossier existant. Refuse d\'écraser un fichier existant sauf overwrite=true. height : petit côté (720, 1080, 1440, 2160). Peut durer plusieurs minutes.', inputSchema: obj({ outPath: S, height: N, fps: N, codec: { type: 'string', enum: ['h264', 'hevc'] }, overwrite: B }, ['outPath']) },
  { name: 'ezcut_logs', method: 'logs', description: 'Dernières lignes du journal d\'EZcut (erreurs de l\'interface, commandes FFmpeg en échec, imports refusés). Fonctionne même si l\'application est fermée ou a planté.', inputSchema: obj({ lines: d(N, 'Nombre de lignes (défaut 200)') }) },
];

async function runTool(name, args) {
  const tool = TOOLS.find(t => t.name === name);
  if (!tool) throw new Error('Outil inconnu : ' + name);
  if (tool.method === 'logs') {
    // Le journal se lit directement sur le disque : utile justement quand l'application ne répond plus.
    const file = path.join(dataDir, 'logs', 'ezcut.log');
    if (!fs.existsSync(file)) return [{ type: 'text', text: 'Aucun journal pour l\'instant (' + file + ').' }];
    const n = Math.max(1, Math.min(2000, Number(args.lines) || 200));
    return [{ type: 'text', text: fs.readFileSync(file, 'utf8').split('\n').slice(-n - 1).join('\n') }];
  }
  const result = await call(tool.method, args);
  if (tool.image && result && result.image) {
    const { image, mimeType, ...rest } = result;
    return [{ type: 'image', data: image, mimeType: mimeType || 'image/jpeg' }, { type: 'text', text: JSON.stringify(rest) }];
  }
  return [{ type: 'text', text: JSON.stringify(result, null, 1) }];
}

const send = msg => process.stdout.write(JSON.stringify(msg) + '\n');
async function handle(msg) {
  const { id, method, params } = msg;
  if (method === 'initialize') return send({ jsonrpc: '2.0', id, result: { protocolVersion: params?.protocolVersion || '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'ezcut', version: '0.1.0' },
    instructions: 'Pilote l\'éditeur vidéo EZcut ouvert sur cette machine. Commencez par ezcut_status. Les modifications sont visibles en direct dans la fenêtre et annulables (ezcut_undo). Vérifiez le rendu avec ezcut_screenshot avant d\'exporter.' } });
  if (method === 'ping') return send({ jsonrpc: '2.0', id, result: {} });
  if (method === 'tools/list') return send({ jsonrpc: '2.0', id, result: { tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) } });
  if (method === 'tools/call') {
    try { return send({ jsonrpc: '2.0', id, result: { content: await runTool(params?.name, params?.arguments || {}) } }); }
    catch (e) { return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: String(e.message || e) }], isError: true } }); }
  }
  if (id !== undefined) send({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Méthode inconnue : ' + method } }); // les notifications (sans id) sont ignorées
}

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  buffer += chunk;
  let nl;
  while ((nl = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, nl).trim(); buffer = buffer.slice(nl + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON invalide' } }); continue; }
    handle(msg).catch(e => { if (msg.id !== undefined) send({ jsonrpc: '2.0', id: msg.id, error: { code: -32603, message: String(e.message || e) } }); });
  }
});
process.stdin.on('end', () => process.exit(0));
