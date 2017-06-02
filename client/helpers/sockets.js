export default class Socket {
  constructor(config) {
    this.connection = new WebSocket("ws://127.0.0.1:8000");
    this.connection.onopen = msg => {
      console.log("Socket ready");
      this.ready = true;
    };
    this.connection.onerror = this.error.bind(this);
    this.ready = false;
  }

  send(message) {
    this.connection.send(JSON.stringify(message));
  }

  error(err) {
    console.log(err);
  }
}
