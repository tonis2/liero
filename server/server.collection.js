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
    this.active = false;
  }

  addPlayer(player, connection) {
    const currentPlayer = this.players.createPlayer(player);
    this.connections.set(currentPlayer, connection);
    this.online += 1;
    //Player has left
    connection.on("close", message => {
      this.players.remove(currentPlayer);
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
    this.active = true;
    this.connections.forEach(connection => {
      connection.send(
        JSON.stringify({
          type: "init",
          payload: this.players.getPlayers(),
          currentMap: map[0][this.map],
          currentSkin: skin[0].default
        })
      );
    });
  }

  //Constantly send updates about player movements
  startUpdates(player) {
    const FPS = 60;
    const connection = this.connections.get(player);
      setInterval(() => {
        connection.send(
          JSON.stringify({ type: "update", payload: this.players.getPlayers() })
        );
      }, 1000/FPS);
  }

  join(player) {
    const connection = this.connections.get(player);
    connection.send(
      JSON.stringify({
        type: "init",
        payload: this.players.getPlayers(),
        currentMap: map[0][this.map],
        currentSkin: skin[0].default
      })
    );
  }

  stringifyData() {
    return {
      name: this.name,
      id: this.id,
      online: this.online,
      map: this.map,
      players: this.players.getPlayers(),
      active:this.active
    };
  }
}
module.exports = GameServer;
