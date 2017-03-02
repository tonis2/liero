import KeyListener from '../helpers/keylistener';

export default class Render {
  constructor(config, world) {
    this.renderer = new PIXI.WebGLRenderer(config.width, config.height);
    this.renderer.backgroundColor = 0x061639;
    this.config = config;
    this.keys = new KeyListener();
    this.run = this.run.bind(this);

    this.world = new PIXI.Container();
    this.stage = new PIXI.Container();
    this.background = new PIXI.Container();
    this.physicsWorld = new p2.World();
    this.world.addChild(this.background);
    this.world.addChild(this.stage);

    document.body.appendChild(this.renderer.view);
    this.loadPhysics();
  }

  loadPhysics() {
    // Add a box
    const boxShape = new p2.Box({ width: 2, height: 1 }),
    boxBody = new p2.Body({
      mass: 1,
      position: [0, 2],
      angularVelocity: 1
    });
    boxBody.addShape(boxShape);
    boxBody.id = '1223';
    this.physicsWorld.addBody(boxBody);
    // Add a plane
    const planeShape = new p2.Plane(),
          planeBody = new p2.Body({ position: [0, -1] });
          planeBody.addShape(planeShape);
          planeBody.id = '1234214';
    this.physicsWorld.addBody(planeBody);
    console.log(this.physicsWorld.bodies);
  }

  loadResources(resources) {
    resources.forEach(resource => {
      PIXI.loader.add(resource.key, resource.src);
    });
  }

  run(t) {
    t = t || 0;
    requestAnimationFrame(this.run);
    this.physicsWorld.step(1/60);
    this.renderer.render(this.world);
  }
}
