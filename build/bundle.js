(function () {
'use strict';

var keys = {
  W: 87,
  S: 83,
  A: 65,
  D: 68,
  UP: 38,
  DOWN: 40,
  SHIFT: 16
};

var ListenKeys = function ListenKeys() {
  this.keys = {};
  this.keymap = keys;
  this.listenKeys(this.keys);
};

ListenKeys.prototype.on = function on (key, callback) {
  if (this.keys[key]) {
    callback();
  } else {
    return false;
  }
};

ListenKeys.prototype.listenKeys = function listenKeys (keys$$1) {
  var keysPressed = function (e) {
    keys$$1[e.keyCode] = true;
  };

  var keysReleased = function (e) {
    keys$$1[e.keyCode] = false;
  };

  window.onkeydown = keysPressed;
  window.onkeyup = keysReleased;
};

var Render$1 = function Render(config, stage) {
  this.renderer = new PIXI.WebGLRenderer(config.width, config.height);
  this.renderer.backgroundColor = 0x061639;
  this.config = config;
  this.keys = new ListenKeys();
  this.run = this.run.bind(this);
  this.stage = stage;
  document.body.appendChild(this.renderer.view);
};

Render$1.prototype.loadResources = function loadResources (resources) {
  resources.forEach(function (resource) {
    PIXI.loader.add(resource.key, resource.src);
  });
};

Render$1.prototype.run = function run () {
  requestAnimationFrame(this.run);
  this.renderer.render(this.stage);
};

var Socket = function Socket(config) {
  var this$1 = this;

  this.connection = new WebSocket(config.url);
  this.connection.onopen = function (msg) {
    console.log('Socket ready');
    this$1.ready = true;
  };
  this.connection.onerror = this.error.bind(this);
  this.ready = false;
};

Socket.prototype.send = function send (message) {
  this.connection.send(JSON.stringify(message));
};

Socket.prototype.error = function error (err) {
  console.log(err);
};

var Bullet = function Bullet(params) {
  this.bullet = new PIXI.Sprite(PIXI.loader.resources['bullet'].texture);
  this.bullet.rotation = params.weapon.rotation;
  this.bullet.speed = 5;
  this.bullet.pos = params.pos;
  if (params.pos === 'L') {
    this.bullet.scale.x = -1;
    this.bullet.x = params.x + Math.sin(params.weapon.rotation) * 40;
    this.bullet.y = params.y + Math.cos(params.weapon.rotation) * 20;
  } else {
    this.bullet.scale.x = 1;
    this.bullet.x = params.x + Math.cos(params.weapon.rotation) * 30;
    this.bullet.y = params.y + Math.sin(params.weapon.rotation) * 20;
  }
  return this.bullet;
};

var Player = function Player(params) {
  this.player = new PIXI.Sprite(
    PIXI.loader.resources[params.value.skin].texture
  );
  this.player.pos = params.pos;
  this.player.anchor.x = 0.5;
  this.player.anchor.y = 0.5;
  return this.player;
};

var Weapon = function Weapon(params) {
  this.weapon = new PIXI.Sprite(
    PIXI.loader.resources[params.value.weapon.skin].texture
  );
  this.weapon.x = 5;
  this.weapon.y = 5;
  this.weapon.rotation = params.value.weapon.rotation;
  this.weapon.anchor.set(0.7, 0.5);
  return this.weapon;
};

var Gamefield$$1 = function Gamefield$$1(stage) {
  this.resources = new Map();
  this.player = null;
  this.stage = stage;
  this.actions = new Actions(stage);
  this.world = new World(stage);
};

Gamefield$$1.prototype.update = function update (data) {
    var this$1 = this;

  // Server sends less players, than client has online
  if (data.length < this.resources.size) {
    this.findDeletedPlayer(data);
  }
  data.forEach(function (player) {
    if (!this$1.resources.has(player.key)) {
      // Server sends more players, than client has online
      this$1.addPlayer(player);
    } else {
      var playerData = this$1.resources.get(player.key);
      if (player.value.pos !== playerData.pos) {
        this$1.actions.playerTurn(playerData, player.value);
      }
      //update renderer stats based on server values
      playerData.pos = player.value.pos;
      playerData.x = player.value.x;
      playerData.y = player.value.y;
      playerData.children[1].rotation = player.value.weapon.rotation;
    }
    if (player.value.shot) {
      this$1.actions.shoot(JSON.parse(player.value.shot));
    }
  });
};

Gamefield$$1.prototype.addPlayer = function addPlayer (player) {
  var PlayerModel = new PIXI.Container();
  var PlayerWorm = new Player(player);
  var PlayerWeapon = new Weapon(player);
  PlayerModel.pos = player.value.pos;
  PlayerModel.x = player.value.x;
  PlayerModel.x = player.value.y;
  PlayerModel.addChild(PlayerWorm);
  PlayerModel.addChild(PlayerWeapon);
  this.resources.set(player.key, PlayerModel);
  this.stage.addChild(PlayerModel);
  this.actions.playerTurn(PlayerModel, player.value);
};

Gamefield$$1.prototype.findDeletedPlayer = function findDeletedPlayer (data) {
    var this$1 = this;

  this.resources.forEach(function (value, key) {
    var playerOnline = data.filter(function (player) { return player.key === key; });
    if (playerOnline.length === 0) {
      this$1.stage.removeChild(value);
      this$1.resources.delete(key);
    }
  });
};

Gamefield$$1.prototype.initialize = function initialize (data, world) {
    var this$1 = this;

  this.player = data.currentPlayer;
  PIXI.loader.load(function () {
    this$1.world.renderWorld(world);
    data.payload.forEach(function (player) {
      this$1.addPlayer(player);
    });
  });
};

var Actions = function Actions(stage) {
  this.shots = new Map();
  this.stage = stage;
};

Actions.prototype.shoot = function shoot (stats) {
  var bullet = new Bullet(stats);
  bullet.uuid = PIXI.utils.uuid();
  this.shots.set(bullet.uuid, bullet);
  this.stage.addChild(bullet);
};

Actions.prototype.playerTurn = function playerTurn (playerData, values) {
  var worm = playerData.children[0], gun = playerData.children[1];
  if (values.pos === 'L') {
    worm.scale.x = 1;
    gun.scale.x = 1;
    gun.x = -5;
  } else if (values.pos === 'R') {
    worm.scale.x = -1;
    gun.scale.x = -1;
    gun.x = 5;
  }
};

var World = function World(stage) {
  this.stage = stage;
  this.renderWorld = this.renderWorld.bind(this);
};
World.prototype.renderWorld = function renderWorld (config) {
  var background = new PIXI.Sprite(
    PIXI.loader.resources[config.bg].texture
  );
  background.width = config.width;
  background.height = config.height;
  this.stage.addChild(background);
};

var resources = [
  { key: 'worm', src: './images/player/worm.png' },
  { key: 'cat', src: './images/player/cat.png' },
  { key: 'gun', src: './images/player/gun.png' },
  { key: 'bullet', src: './images/player/bullet.png' },
  { key: 'desertBG', src: './images/worlds/desert/desertBG.png' }
];
var renderConfig = {
    width: window.innerWidth,
    height: window.innerHeight - 10
  };

var socketConfig = {
  url: 'ws://localhost:3000'
};

var socket = new Socket(socketConfig);
var Stage = new PIXI.Container();

var gamefield = new Gamefield$$1(Stage);
var renderer = new Render$1(renderConfig, Stage);
var key = renderer.keys.keymap;
var world = {
  bg: 'desertBG',
  width: renderer.renderer.width,
  height: renderer.renderer.height
};
socket.connection.onmessage = function (data) {
  var response = JSON.parse(data.data);
  switch (response.type) {
    case 'init':
      renderer.run();
      renderer.loadResources(resources);
      gamefield.initialize(response, world);
      break;
    case 'update':
      gamefield.update(response.payload);
      break;
  }
};

var animations = function (currentPlayer) {
  var stats = {
    player: gamefield.player,
    y: currentPlayer.y,
    x: currentPlayer.x,
    pos: currentPlayer.pos,
    weapon: {
      rotation: currentPlayer.children[1].rotation
    },
    shot: null
  };

  renderer.keys.on(key.W, function () {
    stats.y -= 3;
  });

  renderer.keys.on(key.S, function () {
    stats.y += 3;
  });

  renderer.keys.on(key.A, function () {
    stats.x -= 3;
    stats.pos = 'L';
  });

  renderer.keys.on(key.D, function () {
    stats.x += 3;
    stats.pos = 'R';
  });

  renderer.keys.on(key.UP, function () {
    if (stats.pos === 'R') {
      stats.weapon.rotation -= 0.1;
    } else {
      stats.weapon.rotation += 0.1;
    }
  });

  renderer.keys.on(key.DOWN, function () {
    if (stats.pos === 'R') {
      stats.weapon.rotation += 0.1;
    } else {
      stats.weapon.rotation -= 0.1;
    }
  });

  renderer.keys.on(key.SHIFT, function () {
    stats.shot = JSON.stringify(stats);
  });

  socket.send({
    type: 'update',
    stats: stats
  });
};

PIXI.ticker.shared.add(function () {
  var currentPlayer = gamefield.resources.get(gamefield.player);

  if (currentPlayer) {
    animations(currentPlayer);
    renderer.stage.pivot.x = currentPlayer.position.x / 3;
    renderer.stage.pivot.y = currentPlayer.position.y / 3;
    // renderer.stage.position.x = renderer.width / 2;
    // renderer.stage.position.y = renderer.height / 2;
  }

  gamefield.actions.shots.forEach(function (bullet) {
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

}());
