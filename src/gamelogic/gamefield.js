import { Actions } from './index';
import { loadModels } from '../helpers/loadMapModel';

export default class Gamefield {
  constructor(renderer, physics) {
    this.player = null;
    this.renderer = renderer;
    this.physics = physics;
    this.actions = new Actions(renderer.stage);
  }

  update(data) {
    data.forEach(player => {
      const playerData = this.renderer.getPlayer(player.key);
      if (!playerData) {
        // Server sends more players, than client has online
        this.addPlayer(player);
      } else {
        if (player.value.pos !== playerData.pos) {
          this.actions.playerTurn(playerData, player.value);
        }
        //update renderer stats based on server values
        playerData.pos = player.value.pos;
        this.physics.updatePosition(player);
        playerData.children[1].rotation = player.value.weapon.rotation;
      }
      if (player.value.shot) {
        this.actions.shoot(player.value.shot);
      }
    });
  }

  addPlayer(player) {
    this.renderer.addPlayer(player);
    this.physics.addPlayer(player);
  }

  initialize(data) {
    return new Promise(resolve => {
      this.player = data.currentPlayer;
      PIXI.loader.load(() => {
        this.renderer.addBackground();
        data.payload.forEach(player => {
          this.addPlayer(player);
        });
        loadModels(data.currentMap, this.renderer.stage, this.physics);
        this.renderer.run();
        resolve();
      });
    });
  }
}
