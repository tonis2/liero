const WebSocketServer = require("uws").Server;
const path = require("path");
const wss = new WebSocketServer({ port: process.env.PORT || 8000 });
const serverList = require("./serverlist.json");
const Game = require("./server.collection.js");
const GameList = new Map();
const express = require("express");
const app = express();

const PUBLICFOLDER = "./build";

app.use("/public", express.static(path.resolve(PUBLICFOLDER)));

app.get("*", (request, response) => {
  response.sendFile(path.resolve("build/index.html"));
});

app.listen(8080);
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
      server.setReady(data.player);
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
      if (server.active) {
        server.join(data.player);
      } else {
        server.start();
      }

      sendToAllConnections({
        type: "serversInfo",
        payload: getGamesData()
      });
      server.startUpdates();
    }

    if (data.type === "destroyServer") {
      GameList.delete(data.GameServerId);
    }
  });
});
