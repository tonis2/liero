const WebSocketServer = require("uws").Server;
const wss = new WebSocketServer({ port: 8000 });
const serverList = require("./serverlist.json");
const Game = require("./server.collection.js");
const GameList = new Map();

serverList.forEach(server => {
  const GameServer = new Game(server);
  GameList.set(GameServer.id, GameServer);
});

const sendToAllConnections = msg => {
  GameList.forEach(socket => {
    socket.connections.forEach(ws => {
      ws.send(JSON.stringify(msg));
    });
  });
};

const getGamesData = () => {
  const gameslist = [...GameList.values()];
  return gameslist.map(game => {
    return game.stringifyData();
  });
};

wss.on("connection", ws => {
  ws.send(
    JSON.stringify({
      type: "serversInfo",
      payload: getGamesData()
    })
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

      sendToAllConnections({
        type: "serversInfo",
        payload: getGamesData()
      });
    }

    if (data.type === "removePlayer") {
      server.removePlayer(data.player, ws);
      sendToAllConnections({
        type: "serversInfo",
        payload: getGamesData()
      });
    }

    if (data.type === "startServer") {
      server.start();
    }

    if (data.type === "destroyServer") {
      GameList.delete(data.GameServerId);
    }
  });
});
