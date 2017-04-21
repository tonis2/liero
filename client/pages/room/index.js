import "./room.scss";
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
          {store.state.currentserver.players.map(player => {
            return <span> {player.key}</span>;
          })}
        </section>
        <span onClick={this.startGame}>Start Game!</span>
      </div>
    );
  }
}

export default observer(Room);
