import { h, Component } from "preact";
import { route } from "preact-router";

export default class Room extends Component {
  constructor(props) {
    super();
    this.props = props;
    console.log(props);
  }


  render() {
    return (
      <div id="room-page">
      <h2>Room</h2>
      <span onClick={(() => {
        route({url:"/"})
      })}>front page</span>
      </div>
    );
  }
}
