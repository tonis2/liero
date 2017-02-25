import { Player, Weapon, Bullet } from '../models';
import { Actions } from './index';
export default class Gamefield {
  constructor(stage, background) {
    this.resources = new Map();
    this.player = null;
    this.stage = stage;
    this.background = background;
    this.actions = new Actions(stage);
  }

  update(data) {
    // Server sends less players, than client has online
    if (data.length < this.resources.size) {
      this.findDeletedPlayer(data);
    }
    data.forEach(player => {
      if (!this.resources.has(player.key)) {
        // Server sends more players, than client has online
        this.addPlayer(player);
      } else {
        const playerData = this.resources.get(player.key);
        if (player.value.pos !== playerData.pos) {
          this.actions.playerTurn(playerData, player.value);
        }
        //update renderer stats based on server values
        playerData.pos = player.value.pos;
        playerData.x = player.value.x;
        playerData.y = player.value.y;
        playerData.children[1].rotation = player.value.weapon.rotation;
      }
      if (player.value.shot) {
        this.actions.shoot(JSON.parse(player.value.shot));
      }
    });
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
    this.resources.set(player.key, PlayerModel);
    this.stage.addChild(PlayerModel);
    this.actions.playerTurn(PlayerModel, player.value);
  }

  findDeletedPlayer(data) {
    this.resources.forEach((value, key) => {
      const playerOnline = data.filter(player => player.key === key);
      if (playerOnline.length === 0) {
        this.stage.removeChild(value);
        this.resources.delete(key);
      }
    });
  }

  addBackground(config) {
    const backgroundIMG = new PIXI.Sprite(
      PIXI.loader.resources['background'].texture
    );
    backgroundIMG.width = window.innerWidth;
    backgroundIMG.height = window.innerHeight;
    this.background.addChild(backgroundIMG);
  }

  addMapObjects() {
    const Bush = new PIXI.Sprite.fromFrame('1');
    const Bush2 = new PIXI.Sprite.fromFrame('2');
    Bush.x = 350;
    Bush.y = 350;
    Bush2.x = 1850;
    Bush2.y = 350;
    this.stage.addChild(Bush);
    this.stage.addChild(Bush2);
  }

  initialize(data) {
    return new Promise(resolve => {
      this.player = data.currentPlayer;
      PIXI.loader.load(() => {
        this.addBackground();
        data.payload.forEach(player => {
          this.addPlayer(player);
        });
        this.addMapObjects();
        resolve();
      });
    });
  }
}
