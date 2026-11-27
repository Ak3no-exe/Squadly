# GameTrack MCP

Permet à Claude d'interroger ton appli GameTrack (jeux, stats, succès, comptes liés). Lecture seule.
Les mots de passe, hachages et 2FA ne sont jamais renvoyés.

## Installation (commune)

```
cd gametrack-mcp
npm install
```

Node 18 ou plus. Comptes lisibles : variable `GT_USERS` (ex. `matteo,leo`, par défaut `matteo,leo`). Seuls ces comptes peuvent être interrogés, le premier est le compte par défaut.
Autres variables optionnelles : `GT_DB_URL`, `GT_FB_KEY`.

## A. Claude Desktop (local, le plus simple)

Ajoute dans `claude_desktop_config.json` (chemin à adapter) :

```json
{
  "mcpServers": {
    "gametrack": {
      "command": "node",
      "args": ["C:/chemin/vers/gametrack-mcp/server.js"]
    }
  }
}
```

Redémarre Claude Desktop. Les outils apparaissent.

## B. Claude web / mobile (serveur distant)

1. Héberge le dossier sur un service gratuit qui fait tourner Node (Render, par exemple), avec :
   - commande de démarrage : `node server.js --http`
   - variable `MCP_TOKEN` : une longue chaîne aléatoire (16 caractères minimum)
2. Ton URL de connecteur sera : `https://TON-SERVICE.onrender.com/mcp/TON_MCP_TOKEN`
3. Dans Claude, ajoute un connecteur personnalisé avec cette URL (sans authentification).
   La disponibilité dépend de ton offre.

Garde le token secret : quiconque a l'URL peut lire tes données GameTrack.

## Outils exposés

- `gametrack_comptes` : liste des comptes avec mini-résumé (pour comparer)
- `gametrack_resume` : totaux, taux de victoire global, succès, visites
- `gametrack_jeux` : liste avec recherche et tri
- `gametrack_jeu` : détail d'un jeu
- `gametrack_succes` : débloqués / restants
- `gametrack_comptes_lies` : Riot, Epic, Xbox…

## Exemples de questions

- « Quel est mon meilleur taux de victoire ? »
- « Combien de victoires sur Valorant ? »
- « Quels succès me restent ? »
- « Leo a combien de succès ? »

Tous les outils acceptent un paramètre `compte` (matteo, leo…).
