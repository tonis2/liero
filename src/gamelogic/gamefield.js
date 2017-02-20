import { Player, Weapon, Bullet } from '../models';
import { Actions } from './index';
export default class Gamefield {
  constructor(stage) {
    this.resources = new Map();
    this.player = null;
    this.stage = stage;
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

  initialize(players) {
    setTimeout(
      () => {
        players.forEach(player => {
          this.addPlayer(player);
        });
      },
      100
    );
  }
}
