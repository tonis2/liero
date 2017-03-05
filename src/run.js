import Socket from './sockets';
import { Renderer, Physics } from './containers';
import { Gamefield } from './gamelogic';
import { renderConfig } from './helpers/configs';
const socketConfig = {
  url: 'ws://localhost:3000'
};

const socket = new Socket(socketConfig);
const renderer = new Renderer(renderConfig);
const physics = new Physics();

const gamefield = new Gamefield(renderer, physics);
const key = renderer.keys.keymap;

socket.connection.onmessage = data => {
  const response = JSON.parse(data.data);
  switch (response.type) {
    case 'init':
      const resources = [
        { key: 'skin', src: response.currentSkin.objects },
        { key: 'background', src: response.currentMap.background },
        { key: 'mapObjects', src: response.currentMap.objects },
        { key: 'tiles', src: response.currentMap.tiles }
      ];
      physics.setPolygon('worm', response.currentSkin.polygon);
      renderer.stage.width = response.width;
      renderer.stage.height = response.height;
      renderer.loadResources(resources);

      gamefield.initialize(response).then(() => {
        socket.send({
          type: 'ready'
        });
      });
      break;
    case 'update':
      gamefield.update(response.payload);
      break;
    case 'disconnect':
      renderer.findDeletedPlayer(response.payload);
      break;
  }
};

const animations = currentPlayer => {
  let stats = {
    player: gamefield.player,
    y: currentPlayer.y,
    x: currentPlayer.x,
    pos: currentPlayer.pos,
    weapon: {
      rotation: currentPlayer.children[1].rotation
    },
    shot: null
  };

  renderer.keys.on(key.W, () => {
    stats.y -= 10;
    if (stats.pos === 'R') {
      stats.x += 6;
    } else {
      stats.x -= 6;
    }
  });

  renderer.keys.on(key.A, () => {
    stats.x -= 3;
    stats.pos = 'L';
  });

  renderer.keys.on(key.D, () => {
    stats.x += 3;
    stats.pos = 'R';
  });

  renderer.keys.on(key.UP, () => {
    if (stats.pos === 'R') {
      stats.weapon.rotation -= 0.1;
    } else {
      stats.weapon.rotation += 0.1;
    }
  });

  renderer.keys.on(key.DOWN, () => {
    if (stats.pos === 'R') {
      stats.weapon.rotation += 0.1;
    } else {
      stats.weapon.rotation -= 0.1;
    }
  });

  renderer.keys.on(key.SHIFT, () => {
    stats.shot = JSON.stringify(stats);
  });

  socket.send({
    type: 'update',
    stats
  });
};

PIXI.ticker.shared.add(() => {
  const pixiPlayer = renderer.getPlayer(gamefield.player),
    physicsPlayer = physics.getModel(gamefield.player);
  physics.container.step(1 / 5);
  if (pixiPlayer) {
    pixiPlayer.position.x = physicsPlayer.position[0];
    pixiPlayer.position.y = physicsPlayer.position[1];
    animations(pixiPlayer);
    renderer.stage.pivot.x = pixiPlayer.position.x / 3;
    renderer.stage.pivot.y = pixiPlayer.position.y / 5;
  }

  gamefield.actions.shots.forEach(bullet => {
    if (bullet.pos === 'R') {
      bullet.x += Math.cos(bullet.rotation) * bullet.speed;
      bullet.y += Math.sin(bullet.rotation) * bullet.speed;
    } else {
      bullet.x -= Math.cos(bullet.rotation) * bullet.speed;
      bullet.y -= Math.sin(bullet.rotation) * bullet.speed;
    }
    if (
      bullet.x > 800 ||
      bullet.x === 0 ||
      bullet.y > 800 ||
      bullet.y === 0
    ) {
      renderer.stage.removeChild(bullet);
      gamefield.actions.shots.delete(bullet.uuid);
    }
  });
});
