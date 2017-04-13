import { h, Component } from "preact";
import { route } from "preact-router";

export default class Login extends Component {
  constructor() {
    super();
  }

  render() {
    return (
      <div id="login-page">
      <h2>Login</h2>
      <span onClick={() => {route('/servers')}}>
            Server list
          </span>
      </div>
    );
  }
}
