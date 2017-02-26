const WebSocketServer = require('uws').Server;
const uuidV1 = require('uuid/v1');
const Players = require('./players.collection.js');
const wss = new WebSocketServer({ port: 3000 });
const players = new Players();
const map = require('./maps/maps.json');
const skin = require('./skins/player.json');
const wsList = new Map();

wss.on('connection', ws => {
  const currentPlayer = players.createPlayer();
  wsList.set(currentPlayer, ws);

  //When player leaves send message to others to delete
  ws.on('close', message => {
    players.remove(currentPlayer);
    wsList.delete(currentPlayer);
    wsList.forEach(socket => {
      socket.send(
        JSON.stringify({ type: 'disconnect', payload: currentPlayer })
      );
    });
  });

  //Constantly send updates about player movements
  const startUpdates = () => {
    setInterval(
      () => {
        ws.send(
          JSON.stringify({ type: 'update', payload: players.getPlayers() })
        );
      },
      20
    );
  };

  ws.on('message', message => {
    const data = JSON.parse(message);
    if (data.type === 'update') {
      players.update(data.stats);
    }
    if (data.type === 'ready') {
      startUpdates();
    }
  });

  ws.send(
    JSON.stringify({
      type: 'init',
      payload: players.getPlayers(),
      currentPlayer: currentPlayer,
      currentMap: map[0].desert,
      currentSkin: skin[0].default
    })
  );
});
