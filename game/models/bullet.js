export default class Bullet {
  constructor(params) {
    this.bullet = new PIXI.Sprite.fromFrame("bullet");
    this.bullet.rotation = params.weapon.rotation;
    this.bullet.speed = 5;
    this.bullet.delay = 300;
    this.bullet.ammo = 60;
    this.bullet.range = 600;
    this.bullet.reload = 2000;
    this.bullet.pos = params.pos;
    if (params.pos === "L") {
      this.bullet.scale.x = -1;
      this.bullet.x = params.x + Math.sin(params.weapon.rotation) * 40;
      this.bullet.y = params.y + Math.cos(params.weapon.rotation) * 20;
    } else {
      this.bullet.scale.x = 1;
      this.bullet.x = params.x + Math.cos(params.weapon.rotation) * 30;
      this.bullet.y = params.y + Math.sin(params.weapon.rotation) * 20;
    }
    return this.bullet;
  }
}
