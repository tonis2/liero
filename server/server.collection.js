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
    const currentPlayer = this.players.createPlayer(player, "worm");
    connection.ready = false;
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
          skins: skin[0]
        })
      );
    });
  }

  setReady(player) {
    const connection = this.connections.get(player);
    connection.ready = true;
  }

  //Constantly send updates about player movements
  startUpdates() {
    const LOOP = 45;
    const interval = setInterval(() => {
      if (this.connections.size > 0) {
        this.sendUpdates();
      } else {
        clearInterval(interval);
      }
    }, LOOP);
  }

  sendUpdates() {
    this.connections.forEach(connection => {
      if (connection.ready)
        connection.send(
          JSON.stringify({
            type: "update",
            payload: this.players.getPlayers()
          })
        );
    });
  }

  join(player) {
    const connection = this.connections.get(player);
    connection.send(
      JSON.stringify({
        type: "init",
        payload: this.players.getPlayers(),
        currentMap: map[0][this.map],
        skins: skin[0]
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
      active: this.active
    };
  }
}
module.exports = GameServer;
