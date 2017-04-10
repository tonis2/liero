import "./list.scss";
import { h, Component } from "preact";
import Socket from "../../helpers/sockets";
import Game from '../../../game/run.js';

const socketConfig = {
  url: "ws://localhost:3000"
};

export default class UX extends Component {
  constructor() {
    super();
    this.socket = new Socket(socketConfig);
    this.player = `player${Math.floor(Math.random() * ( 5 - 1 + 1) + 100)}`;
    this.game = new Game(this.socket, this.player);
    this.state = { servers: [] };

    this.socket.connection.onmessage = data => {
      const response = JSON.parse(data.data);
      if (response.type === "serversInfo") {
        this.setState({ servers: response.payload });
      }
    };
  }

  joinServer(data) {
    this.game.addPlayerToServer(this.player, data);
  }

  render() {
    return (
      <div id="server-list">
        {this.state.servers.map(server => {
          return (
            <div className="server-list-item">
              <span>{`Name: ${server.name}`}</span>
              <span>{`Map: ${server.map}`}</span>
              <span>{`Online: ${server.online}`}</span>
              <button onClick={this.joinServer.bind(this, server.id)}>Join</button>
            </div>
          );
        })}
      </div>
    );
  }
}
