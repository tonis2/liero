import "./styles/main.scss";
import Router from "preact-router";
import { h, render, Component } from "preact";
import Serverlist from './pages/serverlist';
import Login from './pages/login';


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
        </Router>
      </section>
    );
  }
}

render(<Routes />, document.getElementById("UX"));
