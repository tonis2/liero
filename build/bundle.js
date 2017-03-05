(function () {
'use strict';

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

var Bullet = function Bullet(params) {
  this.bullet = new PIXI.Sprite.fromFrame('bullet');
  this.bullet.rotation = params.weapon.rotation;
  this.bullet.speed = 5;
  this.bullet.delay = 300;
  this.bullet.ammo = 60;
  this.bullet.reload = 2000;
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

var Render$1 = function Render(config) {
  this.renderer = new PIXI.WebGLRenderer(config.width, config.height);
  this.renderer.backgroundColor = 0x061639;
  this.config = config;
  this.keys = new ListenKeys();
  this.run = this.run.bind(this);
  this.world = new PIXI.Container();
  this.stage = new PIXI.Container();
  this.background = new PIXI.Container();
  this.world.addChild(this.background);
  this.world.addChild(this.stage);
  document.body.appendChild(this.renderer.view);
};

Render$1.prototype.getPlayer = function getPlayer (player) {
    if ( player === void 0 ) player = this.player;

  return this.stage.children.filter(function (item) { return item.id === player; })[0];
};

Render$1.prototype.findDeletedPlayer = function findDeletedPlayer (id) {
  var leftPlayer = this.getPlayer(id);
  this.stage.removeChild(leftPlayer);
};

Render$1.prototype.addPlayer = function addPlayer (player) {
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
};

Render$1.prototype.addBackground = function addBackground (config) {
  var backgroundIMG = new PIXI.Sprite(
    PIXI.loader.resources['background'].texture
  );
  backgroundIMG.width = window.innerWidth;
  backgroundIMG.height = window.innerHeight;
  this.background.addChild(backgroundIMG);
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

var Physics = function Physics() {
  this.container = new p2.World({
    gravity: [0, 5.82]
  });
  this.polygons = new Map();
};

Physics.prototype.addModel = function addModel (model) {
  this.container.addBody(model);
};

Physics.prototype.addPlayer = function addPlayer (player) {
  var polygonBody = new p2.Body({
    mass: 3,
    position: [player.value.x, player.value.y]
  });

  polygonBody.id = player.key;
  polygonBody.fromPolygon(this.polygons.get('worm'));
  this.addModel(polygonBody);
};

Physics.prototype.updatePosition = function updatePosition (player) {
  var currentPlayer = this.getModel(player.key);
  currentPlayer.position[0] = player.value.x;
  currentPlayer.position[1] = player.value.y;
  currentPlayer.angle = player.value.rotation;
};

Physics.prototype.setPolygon = function setPolygon (id, polygon) {
  this.polygons.set(id, polygon);
};

Physics.prototype.getModel = function getModel (id) {
  return this.container.bodies.filter(function (item) { return item.id === id; })[0];
};

var loadModels = function (data, stage, physics) {
  var row = 0;
  var colHeight = data.height / data.tilesGrid;
  var colWidth = data.width / data.tilesWidth;
  var groundLevel = window.innerHeight;
  data.tilesMap.forEach(function (item, index) {
    var Sprite = new PIXI.Sprite.fromFrame(("" + (item.tile)));
    var SpriteCount = Math.floor((item.x.to - item.x.from) / Sprite.width);

    for (var i = 0; i < SpriteCount; i++) {
      var newSprite = new PIXI.Sprite.fromFrame(("" + (item.tile)));
      if (item.y.from !== item.y.to) {
        newSprite.y = window.innerHeight -
          Sprite.height -
          item.y.from -
          (Sprite.height * i - 3);
      } else {
        newSprite.y = window.innerHeight - Sprite.height - item.y.from;
      }
      newSprite.x = item.x.from + (Sprite.width * i - 3);
      stage.addChild(newSprite);
    }
    if (item.polygon) {
      var polygonBody = new p2.Body({
        position: [0, 650]
      });
      polygonBody.fromPolygon(item.polygon);
      physics.addModel(polygonBody);
    }
  });
};

var Gamefield$$1 = function Gamefield$$1(renderer, physics) {
  this.player = null;
  this.renderer = renderer;
  this.physics = physics;
  this.actions = new Actions(renderer.stage);
};

Gamefield$$1.prototype.update = function update (data) {
    var this$1 = this;

  data.forEach(function (player) {
    var playerData = this$1.renderer.getPlayer(player.key);
    if (!playerData) {
      // Server sends more players, than client has online
      this$1.addPlayer(player);
    } else {
      if (player.value.pos !== playerData.pos) {
        this$1.actions.playerTurn(playerData, player.value);
      }
      //update renderer stats based on server values
      playerData.pos = player.value.pos;
      this$1.physics.updatePosition(player);
      playerData.children[1].rotation = player.value.weapon.rotation;
    }
    if (player.value.shot) {
      this$1.actions.shoot(player.value.shot);
    }
  });
};

Gamefield$$1.prototype.addPlayer = function addPlayer (player) {
  this.renderer.addPlayer(player);
  this.physics.addPlayer(player);
};

Gamefield$$1.prototype.initialize = function initialize (data) {
    var this$1 = this;

  return new Promise(function (resolve) {
    this$1.player = data.currentPlayer;
    PIXI.loader.load(function () {
      this$1.renderer.addBackground();
      data.payload.forEach(function (player) {
        this$1.addPlayer(player);
      });
      loadModels(data.currentMap, this$1.renderer.stage, this$1.physics);
      this$1.renderer.run();
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
var physics = new Physics();

var gamefield = new Gamefield$$1(renderer, physics);
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
      physics.setPolygon('worm', response.currentSkin.polygon);
      renderer.stage.width = response.width;
      renderer.stage.height = response.height;
      renderer.loadResources(resources);

      gamefield.initialize(response).then(function () {
        socket.send({
          type: 'ready'
        });
      });
      break;
    case 'update':
      gamefield.update(response.payload);
      break;
    case 'disconnect':
      gamefield.findDeletedPlayer(response.payload);
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
    stats.y -= 10;
    if (stats.pos === 'R') {
      stats.x += 6;
    } else {
      stats.x -= 6;
    }
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
  var pixiPlayer = renderer.getPlayer(gamefield.player),
    physicsPlayer = physics.getModel(gamefield.player);
  physics.container.step(1 / 5);
  if (pixiPlayer) {
    pixiPlayer.position.x = physicsPlayer.position[0];
    pixiPlayer.position.y = physicsPlayer.position[1];
    animations(pixiPlayer);
    renderer.stage.pivot.x = pixiPlayer.position.x / 3;
    renderer.stage.pivot.y = pixiPlayer.position.y / 5;
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
      bullet.x > renderer.stage.width ||
      bullet.x === 0 ||
      bullet.y > renderer.stage.height ||
      bullet.y === 0
    ) {
      renderer.stage.removeChild(bullet);
      gamefield.actions.shots.delete(bullet.uuid);
    }
  });
});

}());
