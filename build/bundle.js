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

var Render$1 = function Render(config, world) {
  this.renderer = new PIXI.WebGLRenderer(config.width, config.height);
  this.renderer.backgroundColor = 0x061639;
  this.config = config;
  this.keys = new ListenKeys();
  this.run = this.run.bind(this);
  document.body.appendChild(this.renderer.view);
  this.world = new PIXI.Container();
  this.stage = new PIXI.Container();
  this.background = new PIXI.Container();

  this.world.addChild(this.background);
  this.world.addChild(this.stage);
};

Render$1.prototype.loadResources = function loadResources (resources) {
  resources.forEach(function (resource) {
    PIXI.loader.add(resource.key, resource.src);
  });
};

Render$1.prototype.run = function run () {
  requestAnimationFrame(this.run);
  this.renderer.render(this.world);
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
  this.bullet = new PIXI.Sprite.fromFrame('bullet');
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
  this.player = new PIXI.Sprite.fromFrame(params.value.skin);
  this.player.pos = params.pos;
  this.player.anchor.x = 0.5;
  this.player.anchor.y = 0.5;
  return this.player;
};

var Weapon = function Weapon(params) {
  this.weapon = new PIXI.Sprite.fromFrame(params.value.weapon.skin);
  this.weapon.x = 5;
  this.weapon.y = 5;
  this.weapon.rotation = params.value.weapon.rotation;
  this.weapon.anchor.set(0.7, 0.5);
  return this.weapon;
};

var Gamefield$$1 = function Gamefield$$1(stage, background) {
  this.player = null;
  this.stage = stage;
  this.background = background;
  this.actions = new Actions(stage);
};

Gamefield$$1.prototype.update = function update (data) {
    var this$1 = this;

  // Server sends less players, than client has online
  // if (data.length < this.resources.size) {
  // this.findDeletedPlayer(data);
  // }
  data.forEach(function (player) {
    // !this.resources.has(player.key)
    if (!this$1.getPlayer(player.key)) {
      // Server sends more players, than client has online
      this$1.addPlayer(player);
    } else {
      var playerData = this$1.stage.children.filter(
        function (item) { return item.id === player.key; }
      )[0];
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

Gamefield$$1.prototype.getPlayer = function getPlayer (player) {
    if ( player === void 0 ) player = this.player;

  return this.stage.children.filter(function (item) { return item.id === player; })[0];
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
  PlayerModel.id = player.key;
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

Gamefield$$1.prototype.addBackground = function addBackground (config) {
  var backgroundIMG = new PIXI.Sprite(
    PIXI.loader.resources['background'].texture
  );
  backgroundIMG.width = window.innerWidth;
  backgroundIMG.height = window.innerHeight;
  this.background.addChild(backgroundIMG);
};

Gamefield$$1.prototype.addMapObjects = function addMapObjects () {
  var Bush = new PIXI.Sprite.fromFrame('1');
  var Bush2 = new PIXI.Sprite.fromFrame('2');
  Bush.x = 350;
  Bush.y = 350;
  Bush2.x = 1850;
  Bush2.y = 350;
  this.stage.addChild(Bush);
  this.stage.addChild(Bush2);
};

Gamefield$$1.prototype.initialize = function initialize (data) {
    var this$1 = this;

  return new Promise(function (resolve) {
    this$1.player = data.currentPlayer;
    PIXI.loader.load(function () {
      this$1.addBackground();
      data.payload.forEach(function (player) {
        this$1.addPlayer(player);
      });
      this$1.addMapObjects();
      resolve();
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

Actions.prototype.playerTurn = function playerTurn (model, values) {
  var gun = model.children[1], worm = model.children[0];
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

var renderConfig = {
  width: window.innerWidth,
  height: window.innerHeight - 10
};

var socketConfig = {
  url: 'ws://localhost:3000'
};

var socket = new Socket(socketConfig);
var renderer = new Render$1(renderConfig);

var gamefield = new Gamefield$$1(renderer.stage, renderer.background);

var key = renderer.keys.keymap;
socket.connection.onmessage = function (data) {
  var response = JSON.parse(data.data);
  switch (response.type) {
    case 'init':
      var resources = [
        { key: 'skin', src: response.currentSkin.objects },
        { key: 'background', src: response.currentMap.background },
        { key: 'mapObjects', src: response.currentMap.objects },
        { key: 'tiles', src: response.currentMap.tiles }
      ];

      renderer.loadResources(resources);
      gamefield.initialize(response).then(function () {
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
  var currentPlayer = gamefield.getPlayer();
  if (currentPlayer) {
    animations(currentPlayer);
    renderer.stage.pivot.x = currentPlayer.position.x / 3;
    renderer.stage.pivot.y = currentPlayer.position.y / 3;
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
