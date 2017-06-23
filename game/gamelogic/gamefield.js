import { Actions } from "./index";
import { loadModels } from "../helpers/loadMapModel";
import { rangeInclusive } from "../helpers/math";

export default class Gamefield {
  constructor(renderer, physics) {
    this.player = null;
    this.renderer = renderer;
    this.physics = physics;
    this.actions = new Actions(renderer.stage);
    this.ticker = new PIXI.ticker.Ticker();
    this.movementsX = {};
    this.wait = false;
  }

  update(data) {
    data.forEach(player => {
      this.updatePlayerStats(player.key, player.value, false);
    });
  }

  addPlayer(player, values) {
    this.physics.addPlayer(player, values);
    this.renderer.addPlayer(player, values);
    const playerData = this.renderer.getPlayer(player);
    if (playerData) {
      this.actions.playerTurn(playerData, values);
    }
  }

  pushMovement(player, pos) {
    this.movementsX[player].push({
      timestamp: new Date(),
      pos: pos,
      done: false
    });
  }

  updatePlayerStats(player, values, client = true) {
    const playerData = this.renderer.getPlayer(player);

    if (!playerData) {
      // Server sends more players, than client has online
      this.addPlayer(player, values);
    } else {
      if (!this.movementsX[player]) {
        this.movementsX[player] = [];
      }

      //Player has turned
      if (values.pos !== playerData.pos) {
        this.actions.playerTurn(playerData, values);
      }
          const physicsPos = this.physics.updatePosition(player, values);
      if (!client) {
        let distanceDiff = playerData.x - values.x,
          valuesArray = [playerData.x, values.x];
        if (distanceDiff < 0) {
          valuesArray = valuesArray.reverse();
        }

        if (Math.abs(distanceDiff) > 50) {
          rangeInclusive(
            valuesArray[1],
            valuesArray[0],
            6
          ).forEach(number => {
            this.pushMovement(player, number);
          });
        }
      }


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

  clientSidePrediction() {}

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

          renderModel.y = player.position[1];

          if (
            this.movementsX[player.id] &&
            this.movementsX[player.id].length > 0
          ) {
            this.movementsX[player.id] = this.movementsX[player.id]
              .filter(position => !position.done)
              .sort((a, b) => b.timestamp - a.timestamp);

            if (this.movementsX[player.id][0]) {
              renderModel.x = this.movementsX[player.id][0].pos;
              player.position[0] = renderModel.x;
              console.log(this.movementsX[player.id][0].pos);
              this.movementsX[player.id][0].done = true;
            }
          }

          //update renderer stats based on server values
          if (player.id === this.player) {
            this.renderer.stage.pivot.x = renderModel.x - window.innerWidth / 2;
          }
        }
      });
    });
  }

  initialize(data) {
    return new Promise(resolve => {
      PIXI.loader.load(() => {
        data.payload.forEach(player => {
          this.addPlayer(player.key, player.value);
        });
        this.renderer.addBackground();
        loadModels(data.currentMap, this.renderer.stage, this.physics);
        this.controlPlayerMovement();
        this.renderer.run();
        this.ticker.start();
        resolve();
      });
    });
  }
}
