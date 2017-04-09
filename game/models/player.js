export default class Player {
  constructor(params) {
    this.player = new PIXI.Sprite.fromFrame(params.value.skin);
    this.player.pos = params.pos;
    this.player.anchor.x = 0.5;
    this.player.anchor.y = 0.5;
    return this.player;
  }
}
