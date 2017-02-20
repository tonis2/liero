export default class Weapon {
  constructor(params) {
    this.weapon = new PIXI.Sprite(
      PIXI.loader.resources[params.value.weapon.skin].texture
    );
    this.weapon.x = 5;
    this.weapon.y = 5;
    this.weapon.rotation = params.value.weapon.rotation;
    this.weapon.anchor.set(0.7, 0.5);
    return this.weapon;
  }
}
