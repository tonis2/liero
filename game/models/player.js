export default class Player {
  constructor(params) {
    this.player = this.createAnimation();
    this.player.pos = params.pos;
    this.player.anchor.x = 0.5;
    this.player.anchor.y = 0.5;
    return this.player;
  }

  createAnimation() {
    const frames = [];
    for (var i = 0; i < 3; i++) {
      frames.push(PIXI.Texture.fromFrame("worm" + i + ".png"));
    }
    const anim = new PIXI.extras.AnimatedSprite(frames);
    anim.animationSpeed = 0.2;
    anim.play();
    return anim;
  }
}
