import { Player, Weapon, Bullet } from '../models';
import { Actions } from './index';
import { load } from '../helpers/loadMapModel';

export default class Gamefield {
  constructor(stage, background) {
    this.player = null;
    this.stage = stage;
    this.background = background;
    this.actions = new Actions(stage);
  }

  update(data) {
    data.forEach(player => {
      // !this.resources.has(player.key)
      if (!this.getPlayer(player.key)) {
        // Server sends more players, than client has online
        this.addPlayer(player);
      } else {
        const playerData = this.getPlayer(player.key);
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
        this.actions.shoot(player.value.shot);
      }
    });
  }

  getPlayer(player = this.player) {
    return this.stage.children.filter(item => item.id === player)[0];
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
    this.actions.playerTurn(PlayerModel, player.value);
  }

  findDeletedPlayer(id) {
    const leftPlayer = this.getPlayer(id);
    this.stage.removeChild(leftPlayer);
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
        load(data.currentMap, this.stage);
        resolve();
      });
    });
  }
}
