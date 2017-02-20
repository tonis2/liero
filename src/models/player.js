export default class Player {
  constructor(params) {
    this.player = new PIXI.Sprite(
      PIXI.loader.resources[params.value.skin].texture
    );
    this.player.pos = params.pos;
    this.player.anchor.x = 0.5;
    this.player.anchor.y = 0.5;
    return this.player;
  }
}
