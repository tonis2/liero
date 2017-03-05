export default class Physics {
  constructor() {
    this.container = new p2.World({
      gravity: [0, 5.82]
    });
    this.polygons = new Map();
  }

  addModel(model) {
    this.container.addBody(model);
  }

  addPlayer(player) {
    const polygonBody = new p2.Body({
      mass: 3,
      position: [player.value.x, player.value.y]
    });

    polygonBody.id = player.key;
    polygonBody.fromPolygon(this.polygons.get('worm'));
    this.addModel(polygonBody);
  }

  updatePosition(player) {
    const currentPlayer = this.getModel(player.key);
    currentPlayer.position[0] = player.value.x;
    currentPlayer.position[1] = player.value.y;
    currentPlayer.angle = player.value.rotation;
  }

  setPolygon(id, polygon) {
    this.polygons.set(id, polygon);
  }

  getModel(id) {
    return this.container.bodies.filter(item => item.id === id)[0];
  }
}
