import { Renderer, Physics } from "./containers";
import { Gamefield } from "./gamelogic";
import { renderConfig, timeouts } from "./helpers/configs";
import store from "../client/store";

const renderer = new Renderer(renderConfig);
const physics = new Physics();
const gamefield = new Gamefield(renderer, physics);
const key = renderer.keys.keymap;

const animations = currentPlayer => {
  let stats = {
    player: gamefield.player,
    y: currentPlayer.position[1],
    x: currentPlayer.position[0],
    pos: currentPlayer.pos,
    weapon: {
      rotation: currentPlayer.weapon.rotation
    },
    shot: null,
    jump: null
  };

  renderer.keys.on(key.W, () => {
    if (!timeouts.jump.value) {
      stats.jump = true;
      timeouts.jump.value = true;
      setTimeout(() => {
        timeouts.jump.value = false;
      }, timeouts.jump.time);
    }

    store.socket.send({
      type: "update",
      serverId: store.state.currentserver.id,
      stats
    });
  });

  renderer.keys.on(key.A, () => {
    stats.x -= 6;
    stats.pos = "L";
    store.socket.send({
      type: "update",
      serverId: store.state.currentserver.id,
      stats
    });
  });

  renderer.keys.on(key.D, () => {
    stats.x += 6;
    stats.pos = "R";
    store.socket.send({
      type: "update",
      serverId: store.state.currentserver.id,
      stats
    });
  });

  renderer.keys.on(key.UP, () => {
    if (stats.pos === "R") {
      stats.weapon.rotation -= 0.1;
    } else {
      stats.weapon.rotation += 0.1;
    }
    store.socket.send({
      type: "update",
      serverId: store.state.currentserver.id,
      stats
    });
  });

  renderer.keys.on(key.DOWN, () => {
    if (stats.pos === "R") {
      stats.weapon.rotation += 0.1;
    } else {
      stats.weapon.rotation -= 0.1;
    }
    store.socket.send({
      type: "update",
      serverId: store.state.currentserver.id,
      stats
    });
  });

  renderer.keys.on(key.SHIFT, () => {
    if (!timeouts.shoot.value) {
      stats.shot = JSON.stringify(stats);
      timeouts.shoot.value = true;
      setTimeout(() => {
        timeouts.shoot.value = false;
      }, timeouts.shoot.time);
    }
    store.socket.send({
      type: "update",
      serverId: store.state.currentserver.id,
      stats
    });
  });
};

export default class Game {
  constructor(player) {
    this.player = player;
    gamefield.player = player;
  }

  handleConnection(response) {
    switch (response.type) {
      case "init":
        console.log("Start loading resources", response);
        document.getElementsByTagName("body")[0].classList.add("active");
        const resources = [
          { key: "worm", src: response.skins.worm.default },
          { key: "guns", src: response.skins.guns },
          { key: "background", src: response.currentMap.background },
          { key: "mapObjects", src: response.currentMap.objects },
          { key: "tiles", src: response.currentMap.tiles }
        ];
        physics.setPolygon("worm", response.skins.worm.polygon);
        renderer.stage.width = response.width;
        renderer.stage.height = response.height;
        renderer.loadResources(resources);

        gamefield.initialize(response).then(() => {
          console.log("Files loaded");
          store.socket.send({
            type: "ready",
            player: this.player,
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
        physics.findDeletedPlayer(response.payload);
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
      player: this.player,
      serverId: store.state.currentserver.id
    });
  }

  startAnimations() {
    const FPS = 60;



    setInterval(() => {
      physics.container.step(1 / 5);

      const model = physics.getModel(gamefield.player);
      if (model) {
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
    }, 1000 / FPS);
  }
}
