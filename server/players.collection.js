const uuidV1 = require("uuid/v1");

const playerModel = require("./models/worm");

class Players {
  constructor() {
    this.collection = new Map();
    this.createPlayer = this.createPlayer.bind(this);
  }
  add(key, value) {
    this.collection.set(key, value);
  }

  get(key) {
    return this.collection.get(key);
  }

  remove(key) {
    return this.collection.delete(key);
  }

  getPlayers() {
    let response = [];
    for (let [key, value] of this.collection.entries()) {
      response.push({ key, value });
    }
    return response;
  }

  update(player, params) {
    const playerModel = this.collection.get(player);
    playerModel.setParams(params);
  }

  createPlayer(playerID, skin) {
    const player = new playerModel();
    player.skin = skin;
    this.add(playerID, player);
    return playerID;
  }
}

module.exports = Players;
