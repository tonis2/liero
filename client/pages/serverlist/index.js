import "./list.scss";
import { h, Component } from "preact";
import { route } from "preact-router";
import { observer, setComponent } from "mobx-observer";
import store from "../../store";

setComponent(Component);
class ServerList extends Component {
  joinServer(uid) {
    store.joinRoom(uid);
    route({ url: "/room" });
  }

  render() {
    return (
      <div id="server-list">
        {store.state.serverlist.map(server => {
          return (
            <div className="server-list-item">
              <span>{`Name: ${server.name}`}</span>
              <span>{`Map: ${server.map}`}</span>
              <span>{`Online: ${server.online}`}</span>
              <button onClick={this.joinServer.bind(this, server.id)}>
                Join
              </button>
            </div>
          );
        })}
      </div>
    );
  }
}

export default observer(ServerList);
