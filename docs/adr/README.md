# Registre des décisions d'architecture (ADR)

Un ADR consigne une décision qui engage durablement le projet : le contexte, le choix, les alternatives écartées et les conséquences.

| N° | Décision | Statut |
|---|---|---|
| [0001](0001-stack-technique.md) | Stack technique | Accepté sous condition des prototypes R1 à R5 |
| [0002](0002-licence.md) | Licence du projet | Accepté |
| [0003](0003-format-effets.md) | Format des packs d'effets | Accepté |

## Statuts

**Proposé** → **Accepté** ou **Rejeté**. Un ADR accepté n'est plus modifié ; s'il devient caduc, un nouvel ADR le remplace et l'ancien passe à **Remplacé par NNNN**.

## Modèle

```markdown
# ADR-NNNN — Titre

- Statut : Proposé
- Date : AAAA-MM-JJ

## Contexte
Le problème et les contraintes.

## Décision
Ce qui est choisi.

## Alternatives écartées
Chaque alternative et la raison de son rejet.

## Conséquences
Ce que la décision facilite, ce qu'elle complique, ce qu'il faudra surveiller.
```
