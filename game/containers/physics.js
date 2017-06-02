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

  findDeletedPlayer(id) {
    const model = this.getModel(id);
    this.container.removeBody(model);
  }

  addPlayer(player, values) {
    const polygonBody = new p2.Body({
      mass: 3,
      position: [values.x, values.y],
      fixedRotation: true,
      velocity: [5, 0]
    });
    polygonBody.id = player;
    polygonBody.pos = values.pos;
    polygonBody.weapon = values.weapon;
    polygonBody.fromPolygon(this.polygons.get("worm"));
    this.addModel(polygonBody);
  }

  updatePosition(player, values) {
    const currentPlayer = this.getModel(player);
    currentPlayer.position[0] = values.x;
    currentPlayer.weapon = values.weapon;
    currentPlayer.pos = values.pos;
    return {
      model: currentPlayer,
      x: currentPlayer.position[0],
      y: currentPlayer.position[1],
      weapon: currentPlayer.weapon
    };
  }

  setPolygon(id, polygon) {
    this.polygons.set(id, polygon);
  }

  getModel(id) {
    return this.container.bodies.filter(item => item.id === id)[0];
  }
}
