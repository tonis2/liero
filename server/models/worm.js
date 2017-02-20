class Worm {
  constructor(payload) {
    this.skin = 'worm';
    this.x = payload ? payload.x : this.generateRandomNumber();
    this.y = payload ? payload.y : this.generateRandomNumber();
    this.pos = payload ? payload.pos : 'R';
    this.weapon = {
      skin: 'gun',
      rotation: payload ? payload.weapon.rotation : 0
    };
    this.shot = payload ? payload.shot : null;
  }
  generateRandomNumber() {
    return Math.floor(Math.random() * 250) + 1;
  }
}

module.exports = Worm;
