import { h, Component } from "preact";
import { route } from "preact-router";
import { observer, setComponent } from "mobx-observer";
import store from "../../store";

setComponent(Component);
class Room extends Component {
  startGame() {
    store.startGame();
    route({ url: "/serverlist" });
  }

  componentWillMount() {
    if (!store.state.currentserver) route("/");
  }

  render() {
    return (
      <div id="room-page">
        <section id="room-details">
          <h3>{store.state.currentserver.name}</h3>
          <section id="players-list">
            <h4>Players:</h4>
            {store.state.currentserver.players.map(player => {
              return <span> {player.key}</span>;
            })}
          </section>
          <span id="start-game" onClick={this.startGame}>{store.state.currentserver.active ? "Join game" : "Start server"}</span>
        </section>
      </div>
    );
  }
}

export default observer(Room);
