import Renderer from './renderer';
import Socket from './sockets';
import { Gamefield } from './gamelogic';
import { renderConfig } from './helpers/configs';
const socketConfig = {
  url: 'ws://localhost:3000'
};

const socket = new Socket(socketConfig);
const renderer = new Renderer(renderConfig);

const gamefield = new Gamefield(renderer.stage, renderer.background);

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

      renderer.loadResources(resources);
      gamefield.initialize(response).then(() => {
        renderer.run();
        socket.send({
          type: 'ready'
        });
      });
      break;
    case 'update':
      gamefield.update(response.payload);
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
    stats.y -= 3;
  });

  renderer.keys.on(key.S, () => {
    stats.y += 3;
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
  const currentPlayer = gamefield.getPlayer();
  if (currentPlayer) {
    animations(currentPlayer);
    renderer.stage.pivot.x = currentPlayer.position.x / 3;
    renderer.stage.pivot.y = currentPlayer.position.y / 3;
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
      bullet.x > renderConfig.width ||
      bullet.x === 0 ||
      bullet.y > renderConfig.height ||
      bullet.y === 0
    ) {
      renderer.stage.removeChild(bullet);
      gamefield.actions.shots.delete(bullet.uuid);
    }
  });
});
