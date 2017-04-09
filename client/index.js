import { h, render, Component } from "preact";
import "./styles/main.scss";
import Socket from "./sockets";
const socketConfig = {
  url: "ws://localhost:3000"
};

class UX extends Component {
  constructor() {
    super();
    this.socket = new Socket(socketConfig);
    this.state = { servers: [] };
    this.socket.connection.onmessage = data => {
      const response = JSON.parse(data.data);
      if (response.type === "serversInfo") {
        this.setState({ servers: response.payload });
      }
    };
  }

  render() {
    return (
      <div id="server-list">
        {this.state.servers.map(server => {
          return (
            <div className="server-list-item">
              <span>{server.name}</span>
              <span>{server.map}</span>
              <span>{server.online}</span>
            </div>
          );
        })}
      </div>
    );
  }
}

render(<UX />, document.getElementById("UX"));
