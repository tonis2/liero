export default class World {
  constructor(stage) {
    this.stage = stage;
    this.renderWorld = this.renderWorld.bind(this);
  }
  renderWorld(config) {
    const background = new PIXI.Sprite(
      PIXI.loader.resources[config.bg].texture
    );
    background.width = config.width;
    background.height = config.height;
    this.stage.addChild(background);
  }
}
