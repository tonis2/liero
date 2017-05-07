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

        if (player.value.x !== playerData.x) {
          playerData.children[0].loop = true;
          playerData.children[0].playing = true;
        } else {
          playerData.children[0].playing = false;
          playerData.children[0].loop = false;
        }
        const physicsPos = this.physics.updatePosition(player);

        if (player.value.jump) {
          physicsPos.model.velocity[1] = -70;
          if (player.value.pos === "R") {
            physicsPos.model.velocity[0] = 10;
          } else {
            physicsPos.model.velocity[0] = -10;
          }
        }

        playerData.children[1].rotation = physicsPos.weapon.rotation;
        playerData.pos = player.value.pos;
        //update renderer stats based on server values
        playerData.position.x = physicsPos.x;
        playerData.position.y = physicsPos.y;
        //update renderer stats based on server values
        if (player.key === this.player) {
          this.renderer.stage.pivot.x =
            playerData.position.x - window.innerWidth / 2;
        }
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
