import KeyListener from '../helpers/keylistener';
import { Player, Weapon, Bullet } from '../models';

export default class Render {
  constructor(config) {
    this.renderer = new PIXI.WebGLRenderer(config.width, config.height);
    this.renderer.backgroundColor = 0x061639;
    this.config = config;
    this.keys = new KeyListener();
    this.run = this.run.bind(this);
    this.world = new PIXI.Container();
    this.stage = new PIXI.Container();
    this.background = new PIXI.Container();
    this.world.addChild(this.background);
    this.world.addChild(this.stage);
    document.body.appendChild(this.renderer.view);
  }

  getPlayer(player = this.player) {
    return this.stage.children.filter(item => item.id === player)[0];
  }

  findDeletedPlayer(id) {
    const leftPlayer = this.getPlayer(id);
    this.stage.removeChild(leftPlayer);
  }

  addPlayer(player) {
    const PlayerModel = new PIXI.Container();
    const PlayerWorm = new Player(player);
    const PlayerWeapon = new Weapon(player);
    PlayerModel.pos = player.value.pos;
    PlayerModel.x = player.value.x;
    PlayerModel.x = player.value.y;
    PlayerModel.addChild(PlayerWorm);
    PlayerModel.addChild(PlayerWeapon);
    PlayerModel.id = player.key;
    this.stage.addChild(PlayerModel);
  }

  addBackground(config) {
    const backgroundIMG = new PIXI.Sprite(
      PIXI.loader.resources['background'].texture
    );
    backgroundIMG.width = window.innerWidth;
    backgroundIMG.height = window.innerHeight;
    this.background.addChild(backgroundIMG);
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
