import Router from "preact-router";
import { setComponent } from "mobx-observer";
import { h, render, Component } from "preact";
import Serverlist from "./pages/serverlist";
import Login from "./pages/login";
import Room from "./pages/room";

class Routes extends Component {
  constructor() {
    super();
  }
  render() {
    return (
      <section id="container">
        <Router>
          <Login path="/" />
          <Serverlist path="/servers" />
          <Room path="/game" />
        </Router>
      </section>
    );
  }
}

render(<Routes />, document.getElementById("UX"));
