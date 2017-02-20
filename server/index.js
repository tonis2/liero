const WebSocketServer = require('uws').Server;
const uuidV1 = require('uuid/v1');
const Players = require('./players.collection.js');
const wss = new WebSocketServer({ port: 3000 });
const players = new Players();

wss.on('connection', ws => {
  const currentPlayer = players.createPlayer();
  ws.on('close', message => {
    players.remove(currentPlayer);
  });

  ws.on('message', message => {
    const data = JSON.parse(message);
    if (data.type === 'update') {
      players.update(data.stats);
    }
  });

  ws.send(
    JSON.stringify({
      type: 'init',
      payload: players.getPlayers(),
      currentPlayer: currentPlayer
    })
  );
  setInterval(
    () => {
      ws.send(
        JSON.stringify({ type: 'update', payload: players.getPlayers() })
      );
    },
    20
  );
});
