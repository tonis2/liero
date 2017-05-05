class Worm {
  constructor() {
    this.x =  this.generateRandomNumber();
    this.y =  this.generateRandomNumber();
    this.pos =  'L';
    this.weapon = {
      skin: 'bazooka',
      rotation: 0
    };
    this.shot = null;
    this.rotation = 0;
  }
  generateRandomNumber() {
    return Math.floor(Math.random() * 250) + 1;
  }

  setParams(params) {
    this.x = params.x;
    this.y = params.y;
    this.pos = params.pos;
    this.weapon = params.weapon || 'gun';
    this.weapon.rotation = params.weapon.rotation;
    this.shot = params.shot;
  }
}

module.exports = Worm;
