/** Modèles de titres proposés dans la banque. Chacun est un point de départ : tout reste réglable dans l'inspecteur. */
import { defaultText, type TextStyle, type Transform } from '../core/types';

export interface TitlePreset { id: string; label: string; cat: string; style: TextStyle; transform?: Partial<Transform>; }

const t = (o: Partial<TextStyle>): TextStyle => ({ ...defaultText(), ...o });

export const TITLES: TitlePreset[] = [
  { id: 'simple', label: 'Titre simple', cat: 'Titres', style: t({ content: 'Votre titre', size: 0.11, weight: 700 }) },
  { id: 'impact', label: 'Titre choc', cat: 'Titres', style: t({ content: 'TITRE CHOC', font: 'Impact', size: 0.17, weight: 400, stroke: 0.05, strokeColor: '#000000', shadow: 0.7, animIn: 'pop', animOut: 'fade', animDur: 0.35 }) },
  { id: 'elegant', label: 'Titre élégant', cat: 'Titres', style: t({ content: 'Un beau titre', font: 'Georgia', size: 0.1, weight: 400, shadow: 0.35, animIn: 'fade', animOut: 'fade', animDur: 0.8 }) },
  { id: 'chapter', label: 'Chapitre', cat: 'Titres', style: t({ content: 'CHAPITRE 1\nLe départ', font: 'Bahnschrift', size: 0.075, weight: 600, shadow: 0.4, animIn: 'slide', animOut: 'fade' }) },
  { id: 'neon', label: 'Néon', cat: 'Titres', style: t({ content: 'NÉON', font: 'Bahnschrift', size: 0.16, weight: 700, color: '#7dfcff', stroke: 0.02, strokeColor: '#ff3df2', shadow: 1, animIn: 'fade', animOut: 'fade' }) },
  { id: 'lower', label: 'Synthé (nom et rôle)', cat: 'Synthés', style: t({ content: 'Prénom Nom\nCréateur de contenu', size: 0.045, weight: 600, align: 'left', shadow: 0, box: 0.82, boxColor: '#101216', animIn: 'slide', animOut: 'fade' }), transform: { x: -0.27, y: -0.33 } },
  { id: 'lower-accent', label: 'Synthé coloré', cat: 'Synthés', style: t({ content: 'Prénom Nom', size: 0.05, weight: 700, color: '#03241c', align: 'left', shadow: 0, box: 1, boxColor: '#22e3b6', animIn: 'slide', animOut: 'slide' }), transform: { x: -0.3, y: -0.34 } },
  { id: 'place', label: 'Lieu et date', cat: 'Synthés', style: t({ content: 'PARIS — 14 JUILLET', font: 'Consolas', size: 0.04, weight: 400, shadow: 0.6, animIn: 'type', animOut: 'fade', animDur: 1 }), transform: { x: -0.25, y: 0.38 } },
  { id: 'caption', label: 'Sous-titre', cat: 'Sous-titres', style: t({ content: 'Texte du sous-titre', size: 0.05, weight: 600, stroke: 0.08, strokeColor: '#000000', shadow: 0, animIn: 'none', animOut: 'none' }), transform: { y: -0.38 } },
  { id: 'caption-box', label: 'Sous-titre sur fond', cat: 'Sous-titres', style: t({ content: 'Texte du sous-titre', size: 0.045, weight: 600, shadow: 0, box: 0.7, boxColor: '#000000', animIn: 'none', animOut: 'none' }), transform: { y: -0.38 } },
  { id: 'caption-pop', label: 'Sous-titre dynamique', cat: 'Sous-titres', style: t({ content: 'MOT CLÉ', font: 'Impact', size: 0.09, weight: 400, color: '#ffe14d', stroke: 0.07, strokeColor: '#000000', shadow: 0.4, animIn: 'pop', animOut: 'none', animDur: 0.2 }), transform: { y: -0.25 } },
  { id: 'typewriter', label: 'Machine à écrire', cat: 'Animés', style: t({ content: 'Il était une fois…', font: 'Courier New', size: 0.07, weight: 700, shadow: 0.5, animIn: 'type', animOut: 'fade', animDur: 1.2 }) },
  { id: 'credits', label: 'Générique', cat: 'Animés', style: t({ content: 'Réalisation\nVotre nom', font: 'Georgia', size: 0.06, weight: 400, shadow: 0.3, animIn: 'slide', animOut: 'slide', animDur: 0.9 }) },
  { id: 'end', label: 'Écran de fin', cat: 'Titres', style: t({ content: 'Merci d\'avoir regardé', size: 0.085, weight: 700, shadow: 0.5, box: 0.55, boxColor: '#000000', animIn: 'pop', animOut: 'fade' }) },
];
