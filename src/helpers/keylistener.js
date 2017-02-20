import keys from './keymap';

export default class ListenKeys {
  constructor() {
    this.keys = {};
    this.keymap = keys;
    this.listenKeys(this.keys);
  }

  on(key, callback) {
    if (this.keys[key]) {
      callback();
    } else {
      return false;
    }
  }

  listenKeys(keys) {
    const keysPressed = e => {
      keys[e.keyCode] = true;
    };

    const keysReleased = e => {
      keys[e.keyCode] = false;
    };

    window.onkeydown = keysPressed;
    window.onkeyup = keysReleased;
  }
}
