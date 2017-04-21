import Socket from "../helpers/sockets";
import Game from "../../game/run.js";
import { observable } from "mobx";

class Store {
  constructor() {
    this.socket = new Socket();
    this.player = `player${Math.floor(Math.random() * (5 - 1 + 1) + 100)}`;
    this.game = new Game(this.player);
    this.socket.connection.onmessage = data => {
      const response = JSON.parse(data.data);

      if (response.type === "serversInfo") {
        this.state.serverlist = response.payload;
        if (this.state.currentserver) {
          this.state.currentserver = this.state.serverlist.filter(
            server => server.id === this.state.currentserver.id
          )[0];
        }
      }

      this.game.handleConnection(response);
    };

    this.state = observable({
      serverlist: [],
      currentserver: null
    });
  }

  joinRoom(serverUID) {
    this.game.addPlayerToServer(this.player, serverUID);
    this.state.currentserver = this.state.serverlist.filter(
      server => server.id === serverUID
    )[0];
  }

  startGame() {
    this.game.startServer(this.state.currentserver.id);
  }
}

const store = new Store();

export default store;
