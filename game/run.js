import { Renderer, Physics } from "./containers";
import { Gamefield } from "./gamelogic";
import { renderConfig } from "./helpers/configs";
import store from "../client/store";

const renderer = new Renderer(renderConfig);
const physics = new Physics();

const gamefield = new Gamefield(renderer, physics);
const key = renderer.keys.keymap;

const timeouts = {
  jump: { value: false, time: 1500 },
  shoot: { value: false, time: 200 }
};

const animations = currentPlayer => {
  let stats = {
    player: gamefield.player,
    y: currentPlayer.position[1],
    x: currentPlayer.position[0],
    pos: currentPlayer.pos,
    weapon: {
      rotation: currentPlayer.weapon.rotation
    },
    shot: null
  };

  renderer.keys.on(key.W, () => {
    if (!timeouts.jump.value) {
      currentPlayer.velocity[1] = -70;
      if (stats.pos === "R") {
        currentPlayer.velocity[0] = 10;
      } else {
        currentPlayer.velocity[0] = -10;
      }
      timeouts.jump.value = true;
      setTimeout(() => {
        timeouts.jump.value = false;
      }, timeouts.jump.time);
    }
  });

  renderer.keys.on(key.A, () => {
    stats.x -= 3;
    stats.pos = "L";
  });

  renderer.keys.on(key.D, () => {
    stats.x += 3;
    stats.pos = "R";
  });

  renderer.keys.on(key.UP, () => {
    if (stats.pos === "R") {
      stats.weapon.rotation -= 0.1;
    } else {
      stats.weapon.rotation += 0.1;
    }
  });

  renderer.keys.on(key.DOWN, () => {
    if (stats.pos === "R") {
      stats.weapon.rotation += 0.1;
    } else {
      stats.weapon.rotation -= 0.1;
    }
  });

  renderer.keys.on(key.SHIFT, () => {
    if (!timeouts.shoot.value) {
      stats.shot = JSON.stringify(stats);
      timeouts.shoot.value = true;
      setTimeout(() => {
        timeouts.shoot.value = false;
      }, timeouts.shoot.time);
    }
  });

  store.socket.send({
    type: "update",
    serverId: store.state.currentserver.id,
    stats
  });
};

export default class Game {
  constructor(player) {
    gamefield.player = player;
  }

  handleConnection(response) {
    switch (response.type) {
      case "init":
        console.log("Start loading resources");
        document.getElementById("gameWindow").classList.add("active");
        const resources = [
          { key: "skin", src: response.currentSkin.objects },
          { key: "background", src: response.currentMap.background },
          { key: "mapObjects", src: response.currentMap.objects },
          { key: "tiles", src: response.currentMap.tiles }
        ];
        physics.setPolygon("worm", response.currentSkin.polygon);
        renderer.stage.width = response.width;
        renderer.stage.height = response.height;
        renderer.loadResources(resources);

        gamefield.initialize(response).then(() => {
          console.log("Files loaded");
          store.socket.send({
            type: "ready",
            serverId: store.state.currentserver.id
          });
          this.startAnimations();
        });
        break;

      case "update":
        gamefield.update(response.payload);
        break;

      case "disconnect":
        renderer.findDeletedPlayer(response.payload);
        break;
    }
  }

  addPlayerToServer(player, serverId) {
    store.socket.send({
      type: "addPlayer",
      player: player,
      serverId: serverId
    });
  }

  startServer() {
    store.socket.send({
      type: "startServer",
      serverId: store.state.currentserver.id
    });
  }

  startAnimations() {
    PIXI.ticker.shared.add(() => {
      const model = physics.getModel(store.player);
      physics.container.step(1 / 5);
      if (model) {
        renderer.stage.pivot.x = model.position[0] - window.innerWidth / 2;
        animations(model);
      }

      gamefield.actions.shots.forEach(bullet => {
        if (bullet.pos === "R") {
          bullet.x += Math.cos(bullet.rotation) * bullet.speed;
          bullet.y += Math.sin(bullet.rotation) * bullet.speed;
        } else {
          bullet.x -= Math.cos(bullet.rotation) * bullet.speed;
          bullet.y -= Math.sin(bullet.rotation) * bullet.speed;
        }
        if (
          bullet.x - model.position[0] > bullet.range ||
          bullet.x - model.position[0] < -bullet.range ||
          bullet.x === 0 ||
          bullet.y - model.position[1] > bullet.range ||
          bullet.y - model.position[1] < -bullet.range ||
          bullet.y === 0
        ) {
          renderer.stage.removeChild(bullet);
          gamefield.actions.shots.delete(bullet.uuid);
        }
      });
    });
  }
}
