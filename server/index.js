const WebSocketServer = require("uws").Server;
const wss = new WebSocketServer({ port: 3000 });
const serverList = require("./serverlist.json");
const Game = require("./server.collection.js");
const GameList = new Map();

serverList.forEach(server => {
  const GameServer = new Game(server);
  GameList.set(GameServer.id, GameServer);
});

wss.on("connection", ws => {

  ws.send(
    JSON.stringify({ type: "serversInfo", payload: [...GameList.values()] })
  );

  ws.on("message", message => {
    const data = JSON.parse(message);

    const server = GameList.get(data.serverId);

    if (data.type === "update") {
      server.players.update(data.stats);
    }

    if (data.type === "ready") {
      GameServer.startUpdates(playerId);
    }

    if (data.type === "createServer") {
      const GameServer = new Game(data.params);
      GameList.set(GameServer.id, GameServer);
    }

    if (data.type === "addPlayer") {
      server.addPlayer(data.player, ws);
    }

    if (data.type === "startServer") {
      server.start();
    }

    if (data.type === "destroyServer") {
      GameList.delete(data.GameServerId);
    }
  });
});
