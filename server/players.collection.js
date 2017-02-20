const uuidV1 = require('uuid/v1');

const worm = require('./models/worm');

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

  update(payload) {
    this.add(payload.player, new worm(payload));
  }

  createPlayer() {
    const id = uuidV1(), key = `worm${id}`;
    this.add(key, new worm());
    return key;
  }
}

module.exports = Players;
