import KeyListener from '../helpers/keylistener';

export default class Render {
  constructor(config, world) {
    this.renderer = new PIXI.WebGLRenderer(config.width, config.height);
    this.renderer.backgroundColor = 0x061639;
    this.config = config;
    this.keys = new KeyListener();
    this.run = this.run.bind(this);
    document.body.appendChild(this.renderer.view);
    this.world = new PIXI.Container();
    this.stage = new PIXI.Container();
    this.background = new PIXI.Container();

    this.world.addChild(this.background);
    this.world.addChild(this.stage);
  }

  loadResources(resources) {
    resources.forEach(resource => {
      PIXI.loader.add(resource.key, resource.src);
    });
  }

  run() {
    requestAnimationFrame(this.run);
    this.renderer.render(this.world);
  }
}
