# 05 — Interface

> Maquettes filaires de principe. La maquette haute fidélité est un livrable de la phase 0 et doit être validée avant tout développement d'interface.

## Écran principal

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ EZcut   Fichier  Édition  Affichage  Aide          Projet sans titre    [Exporter] │
├───────────────────────┬──────────────────────────────────┬───────────────────┤
│ Médias│Effets│Trans.│  │                                  │ INSPECTEUR        │
│ Looks │Textes│Audio    │                                  │                   │
│ ───────────────────── │           APERÇU                 │ ▸ Transformation  │
│ [Rechercher…]         │                                  │ ▸ Vitesse         │
│ ┌────┐ ┌────┐ ┌────┐  │                                  │ ▾ Couleur         │
│ │    │ │    │ │    │  │                                  │   Exposition ──●─ │
│ └────┘ └────┘ └────┘  │                                  │   Contraste  ─●── │
│ ┌────┐ ┌────┐ ┌────┐  │  00:00:12:08   ◀ ▶ ▶▶   Qualité ▾ ⛶ │ ▸ Effets (2)      │
│ │    │ │    │ │    │  │                                  │ ▸ Audio           │
│ └────┘ └────┘ └────┘  │                                  │                   │
├───────────────────────┴──────────────────────────────────┴───────────────────┤
│ ↶ ↷ │ ✂ Scinder │ 🧲 Magnétisme │ Ripple │                       Zoom ─●──── │
│ 00:00      00:05      00:10      00:15      00:20      00:25      00:30      │
│ T1  │        [ Titre ]                                                       │
│ V2  │              [▓▓▓▓ incrustation ▓▓▓▓]                                  │
│ V1  │ [▓▓▓▓▓▓ clip A ▓▓▓▓▓▓]⧓[▓▓▓▓▓▓▓▓ clip B ▓▓▓▓▓▓▓▓]                      │
│ A1  │ [∿∿∿∿∿∿∿∿∿∿ musique ∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿]                      │
└──────────────────────────────────────────────────────────────────────────────┘
```

- Quatre zones fixes : bibliothèque (gauche), aperçu (centre), inspecteur (droite), timeline (bas). Séparateurs redimensionnables.
- La bibliothèque et la banque d'effets partagent le même panneau, par onglets.
- L'inspecteur n'affiche que ce qui concerne la sélection. Sans sélection, il montre les réglages du projet.
- Un seul bouton d'action principal, toujours visible : Exporter.

## Banque d'effets

```
┌─ Effets ─────────────────────────────┐
│ [Rechercher un effet…]     ☆ Favoris │
│ Tous│Glitch│Rétro│Flou│Lumière│Ciné  │
│ (•) Installés  ( ) Communauté        │
│ ┌────────┐ ┌────────┐ ┌────────┐     │
│ │        │ │▶ animé │ │      ⤓ │     │   ← la tuile survolée joue l'effet
│ │        │ │ sur le │ │        │     │     sur le clip de l'utilisateur
│ └────────┘ │ clip   │ └────────┘     │
│  VHS       └────────┘  Néon          │   ⤓ = pas encore téléchargé
│            RGB Split                 │
│            par @auteur · MIT         │
│ ┌────────┐ ┌────────┐ ┌────────┐     │
│ │        │ │        │ │        │     │
│ └────────┘ └────────┘ └────────┘     │
└──────────────────────────────────────┘
```

Comportement détaillé : [04 — Banque d'effets](04-banque-effets.md#aperçu-au-survol).

## Principes d'ergonomie

1. **Glisser-déposer partout** : médias vers la timeline, effets vers un clip, transitions vers un point de coupe.
2. **Une action, un retour visible** en moins de 100 ms.
3. **Divulgation progressive** : chaque section de l'inspecteur montre trois ou quatre réglages essentiels ; « Avancé » déplie le reste.
4. **Rien de destructif** : tout se règle après coup, tout s'annule.
5. **États vides utiles** : une bibliothèque vide invite à déposer des fichiers, une timeline vide explique quoi y glisser.
6. **Raccourcis standard du montage** (espace, J/K/L, I/O, Ctrl+Z, suppr), personnalisables plus tard.
7. **Aucune fenêtre modale** pour les tâches longues : progression dans une zone discrète, annulation possible.

## Système visuel

| Élément | Règle |
|---|---|
| Thèmes | Sombre par défaut, clair disponible, suivi du réglage Windows possible |
| Couleurs | Définies par des variables sémantiques (fond, surface, texte, accent, danger), jamais de valeur codée en dur dans un composant |
| Accent | Une seule couleur d'accent, réservée à la sélection et à l'action principale |
| Typographie | Une seule famille sans empattement, chiffres à chasse fixe pour les timecodes |
| Formes | Coins arrondis, rayon unique par niveau (contrôle, carte, panneau) |
| Animations | Courtes (150 à 200 ms), désactivables, jamais sur le chemin d'une action répétée |
| Densité d'écran | Rendu net de 100 % à 200 % d'échelle Windows |
| Accessibilité | Contraste suffisant dans les deux thèmes, navigation clavier complète, cibles de clic confortables |

## Couleurs des pistes

Une couleur par type de contenu, identique dans les deux thèmes : vidéo, audio, texte, effet. Elle ne doit pas être le seul moyen de distinguer les types (icône en complément).

## Vérifications de cohérence

Avant toute livraison d'interface : les deux thèmes, trois échelles d'affichage (100 %, 150 %, 200 %), fenêtre à la taille minimale, navigation au clavier.
