class Worm {
  constructor() {
    this.x = this.generateRandomNumber();
    this.y = 600;
    this.pos = "L";
    this.weapon = {
      skin: "bazooka",
      rotation: 0
    };
    this.shot = null;
    this.jump = null;
    this.rotation = 0;
  }
  generateRandomNumber() {
    return Math.floor(Math.random() * 750) + 1;
  }

  setParams(params) {
    this.y = params.y;
    this.x = params.x;
    this.pos = params.pos;
    this.weapon = params.weapon || "bazooka";
    this.weapon.rotation = params.weapon.rotation;
    this.shot = params.shot;
    this.jump = params.jump;
  }
}

module.exports = Worm;
