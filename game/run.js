import { Renderer, Physics } from "./containers";
import { Gamefield } from "./gamelogic";
import { renderConfig, timeouts } from "./helpers/configs";
import keymap from "./helpers/keymap.json";
import Keylistener from "./helpers/keylistener";
import store from "../client/store";

const renderer = new Renderer(renderConfig);
const physics = new Physics();
const gamefield = new Gamefield(renderer, physics);

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
          this.keylistener = new Keylistener();
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

  generateUpdatePayload(stats) {
    return {
      type: "update",
      player: gamefield.player,
      keys: this.keylistener.keys,
      stats: stats,
      serverId: store.state.currentserver.id,
      timestamp: new Date()
    };
  }

  playerMovement(player) {
    const timeouts = {
      jump: { value: false, time: 1500 },
      shoot: { value: false, time: 200 }
    };
    let stats = {
      x: player.position[0],
      y: player.position[1],
      pos: player.pos,
      weapon: {
        rotation: player.weapon.rotation
      },
      shot: null,
      jump: null
    };

    if (this.keylistener.keys[keymap[0].UP]) {
      if (stats.pos === "R") {
        stats.weapon.rotation -= 0.1;
      } else {
        stats.weapon.rotation += 0.1;
      }
    }

    if (this.keylistener.keys[keymap[0].A]) {
      stats.x -= 6;
      stats.pos = "L";
    }

    if (this.keylistener.keys[keymap[0].D]) {
      stats.x += 6;
      stats.pos = "R";
    }

    if (this.keylistener.keys[keymap[0].W]) {
      stats.jump = true;
    }

    if (this.keylistener.keys[keymap[0].DOWN]) {
      if (stats.pos === "R") {
        stats.weapon.rotation += 0.1;
      } else {
        stats.weapon.rotation -= 0.1;
      }
    }

    if (this.keylistener.keys[keymap[0].SHIFT]) {
      if (!timeouts.shoot.value) {
        stats.shot = JSON.stringify(stats);
        timeouts.shoot.value = true;
        setTimeout(() => {
          timeouts.shoot.value = false;
        }, timeouts.shoot.time);
      }
    }

    gamefield.updatePlayerStats(gamefield.player, stats);
    store.socket.send(this.generateUpdatePayload(stats));
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
      const model = physics.getPlayer(gamefield.player);
      if(model) {
        this.playerMovement(model);
      }
      physics.container.step(1 / 5);
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
