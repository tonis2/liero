const uuidV1 = require("uuid/v1");
const Players = require("./players.collection.js");
const map = require("./maps/maps.json");
const skin = require("./skins/player.json");

class GameServer {
  constructor(params) {
    this.name = params.name;
    this.online = 0;
    this.id = uuidV1();
    this.players = new Players();
    this.connections = new Map();
    this.map = "desert";
  }

  addPlayer(player, connection) {
    const currentPlayer = this.players.createPlayer();
    this.connections.set(currentPlayer, connection);
    this.online += 1;

    //Player has left
    connection.on("close", message => {
      players.remove(currentPlayer);
      this.connections.delete(currentPlayer);
      this.online -= 1;
      this.connections.forEach(socket => {
        socket.send(
          JSON.stringify({ type: "disconnect", payload: currentPlayer })
        );
      });
    });
  }

  start() {
    this.connections.forEach(connection => {
      connection.send(
        JSON.stringify({
          type: "init",
          payload: this.players.getPlayers(),
          currentPlayer: currentPlayer,
          currentMap: map[0][this.map],
          currentSkin: skin[0].default
        })
      );
    });
  }

  //Constantly send updates about player movements
  startUpdates(playerID) {
    const connection = this.connections.get(playerID);
    setInterval(
      () => {
        connection.send(
          JSON.stringify({ type: "update", payload: this.players.getPlayers() })
        );
      },
      20
    );
  }
}
module.exports = GameServer;
