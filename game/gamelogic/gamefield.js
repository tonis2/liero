import { Actions } from "./index";
import { loadModels } from "../helpers/loadMapModel";

export default class Gamefield {
  constructor(renderer, physics) {
    this.player = null;
    this.renderer = renderer;
    this.physics = physics;
    this.actions = new Actions(renderer.stage);
    this.ticker = new PIXI.ticker.Ticker();
  }

  update(data) {
    data.forEach(player => {
      this.updatePlayerPosition(player);
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

  updatePlayerPosition(player) {
    const playerData = this.renderer.getPlayer(player.key);

    if (!playerData) {
      // Server sends more players, than client has online
      this.addPlayer(player);
    } else {
      //Player has turned
      if (player.value.pos !== playerData.pos) {
        this.actions.playerTurn(playerData, player.value);
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
    }
    if (player.value.shot) {
      this.actions.shoot(JSON.parse(player.value.shot));
    }
  }

  initialize(data) {
    this.ticker.start();
    return new Promise(resolve => {
      PIXI.loader.load(() => {
        data.payload.forEach(player => {
          this.addPlayer(player);
        });
        this.renderer.addBackground();
        loadModels(data.currentMap, this.renderer.stage, this.physics);
        this.renderer.run();
        this.ticker.add(() => {
          this.physics.container.bodies.forEach(player => {
            const renderModel = this.renderer.getPlayer(player.id);
            if (renderModel) {
              if (renderModel.x !== player.position[0]) {
                renderModel.children[0].loop = true;
                renderModel.children[0].playing = true;
              } else {
                renderModel.children[0].playing = false;
                renderModel.children[0].loop = false;
              }
              renderModel.x = player.position[0];
              renderModel.y = player.position[1];
              //update renderer stats based on server values
              if (player.id === this.player) {
                this.renderer.stage.pivot.x =
                  renderModel.x - window.innerWidth / 2;
              }
            }
          });
        });
        resolve();
      });
    });
  }
}
