export default class ListenKeys {
  constructor(callback) {
    this.keys = {};
    this.listenKeys();
  }

  listenKeys(keys, callback) {
    const keysPressed = e => {
      this.keys[e.keyCode] = true;
    };

    const keysReleased = e => {
      this.keys[e.keyCode] = false;
    };
    
    window.onkeydown = keysPressed;
    window.onkeyup = keysReleased;
  }
}
