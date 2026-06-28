# Kart Race MMO Server

Serveur Node.js/WebSocket autonome pour le multijoueur de Kart Race.

## PlanetHoster / N0C

Dans l'application Node.js PlanetHoster :

- Dossier de l'application : `mmo-server`
- Fichier de demarrage : `server.js`
- Commande de demarrage : `npm start`
- Version Node.js : 18+ si disponible

Puis installer les dependances dans le dossier `mmo-server` :

```bash
npm install --omit=dev
```

Redemarrer l'application Node.js depuis N0C, ou modifier `tmp/restart.txt`.

## URL a mettre dans le jeu

Quand l'application PlanetHoster repond, tester :

```text
https://TON-DOMAINE/health
```

Puis mettre cette URL WebSocket dans `public/server.json` du projet frontend :

```json
{
  "wsUrl": "wss://TON-DOMAINE"
}
```

Si l'application est publiee dans un sous-chemin, par exemple `/mmo-server`, utiliser :

```json
{
  "wsUrl": "wss://TON-DOMAINE/mmo-server"
}
```
