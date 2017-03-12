export default class Weapon {
  constructor(params) {
    console.log(params);
    this.weapon = new PIXI.Sprite.fromFrame(params.value.weapon.skin);
    this.weapon.x = 5;
    this.weapon.y = 5;
    this.weapon.rotation = params.value.weapon.rotation || 5;
    this.weapon.anchor.set(0.7, 0.5);
    return this.weapon;
  }
}
