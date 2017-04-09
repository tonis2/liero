import { Actions } from "./index";
import { loadModels } from "../helpers/loadMapModel";

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
        //Player has turned
        if (player.value.pos !== playerData.pos) {
          this.actions.playerTurn(playerData, player.value);
        }
        playerData.pos = player.value.pos;
        //update renderer stats based on server values
        const physicsPos = this.physics.updatePosition(player);
        playerData.position.x = physicsPos.x;
        playerData.position.y = physicsPos.y;
        playerData.children[1].rotation = physicsPos.weapon.rotation;
      }
      if (player.value.shot) {
        this.actions.shoot(JSON.parse(player.value.shot));
      }
    });
  }

  addPlayer(player) {
    this.physics.addPlayer(player);
    this.renderer.addPlayer(player);
    const playerData = this.renderer.getPlayer(player.key);
    if (playerData) {
      this.actions.playerTurn(playerData, player.value);
    }
  }

  initialize(data) {
    return new Promise(resolve => {
      this.player = data.currentPlayer;
      PIXI.loader.load(() => {
        data.payload.forEach(player => {
          this.addPlayer(player);
        });
        this.renderer.addBackground();
        loadModels(data.currentMap, this.renderer.stage, this.physics);
        this.renderer.run();
        resolve();
      });
    });
  }
}
