import { Actions } from "./index";
import { loadModels } from "../helpers/loadMapModel";

export default class Gamefield {
  constructor(renderer, physics) {
    this.player = null;
    this.renderer = renderer;
    this.physics = physics;
    this.actions = new Actions(renderer.stage);
    this.ticker = new PIXI.ticker.Ticker();
    this.serverPackages = [];
  }

  update(data) {
    this.serverPackages.push(data);
  
    this.serverPackages.slice(0, 2);
  }

  addPlayer(player, values) {
    this.physics.addPlayer(player, values);
    this.renderer.addPlayer(player, values);
    const playerData = this.renderer.getPlayer(player);
    if (playerData) {
      this.actions.playerTurn(playerData, values);
    }
  }

  updatePlayerPosition(player, values) {
    const playerData = this.renderer.getPlayer(player);
    if (!playerData) {
      // Server sends more players, than client has online
      this.addPlayer(player, values);
    } else {
      //Player has turned
      if (values.pos !== playerData.pos) {
        this.actions.playerTurn(playerData, values);
      }

      const physicsPos = this.physics.updatePosition(player, values);
      if (values.jump) {
        physicsPos.model.velocity[1] = -70;
        if (values.pos === "R") {
          physicsPos.model.velocity[0] = 10;
        } else {
          physicsPos.model.velocity[0] = -10;
        }
      }
      playerData.children[1].rotation = physicsPos.weapon.rotation;
      playerData.pos = values.pos;
    }
    if (values.shot) {
      this.actions.shoot(JSON.parse(values.shot));
    }
  }

  controlPlayerMovement() {
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
            this.renderer.stage.pivot.x = renderModel.x - window.innerWidth / 2;
          }
        }
      });
    });
  }

  initialize(data) {
    this.ticker.start();
    return new Promise(resolve => {
      PIXI.loader.load(() => {
        data.payload.forEach(player => {
          this.addPlayer(player.key, player.value);
        });
        this.renderer.addBackground();
        loadModels(data.currentMap, this.renderer.stage, this.physics);
        this.renderer.run();
        this.controlPlayerMovement();
        resolve();
      });
    });
  }
}
