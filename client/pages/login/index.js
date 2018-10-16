import { h, Component } from "preact";
import { route } from "preact-router";
import store from "../../store";

export default class Login extends Component {
  constructor() {
    super();
  }
  login() {
    const username = document.getElementById("username");
    store.player =
      username.value ||
      `player${Math.floor(Math.random() * (5 - 1 + 1) + 100)}`;
    console.log("login success");
    route("/servers");
  }
  render() {
    return (
      <div id="login-page">
        <label htmlFor="username">Username:</label>
        <input id="username" type="text" />
        <div onClick={this.login} id="login-submit">Login</div>
      </div>
    );
  }
}
