import Renderer from './renderer';
import Socket from './sockets';
import { Gamefield } from './gamelogic';
import { renderConfig, resources } from './helpers/configs';
const socketConfig = {
  url: 'ws://localhost:3000'
};

const socket = new Socket(socketConfig);
const Stage = new PIXI.Container();

const gamefield = new Gamefield(Stage);
const renderer = new Renderer(renderConfig, Stage);
const key = renderer.keys.keymap;

socket.connection.onmessage = data => {
  const response = JSON.parse(data.data);
  switch (response.type) {
    case 'init':
      gamefield.player = response.currentPlayer;
      renderer.loadResources(resources);
      PIXI.loader.load(gamefield.initialize(response.payload));
      renderer.run();
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
  const currentPlayer = gamefield.resources.get(gamefield.player);

  if (currentPlayer) {
    animations(currentPlayer);
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
