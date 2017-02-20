import KeyListener from '../helpers/keylistener';

export default class Render {
  constructor(config, stage) {
    this.renderer = new PIXI.WebGLRenderer(config.width, config.height);
    this.renderer.backgroundColor = 0x061639;
    this.config = config;
    this.keys = new KeyListener();
    this.run = this.run.bind(this);
    this.stage = stage;
    document.body.appendChild(this.renderer.view);
  }

  loadResources(resources) {
    resources.forEach(resource => {
      PIXI.loader.add(resource.key, resource.src);
    });
  }

  run() {
    requestAnimationFrame(this.run);
    this.renderer.render(this.stage);
  }
}
