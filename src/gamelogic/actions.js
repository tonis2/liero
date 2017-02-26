import { Player, Weapon, Bullet } from '../models';

export default class Actions {
  constructor(stage) {
    this.shots = new Map();
    this.stage = stage;
  }

  shoot(stats) {
    const bullet = new Bullet(stats);
    bullet.uuid = PIXI.utils.uuid();
    this.shots.set(bullet.uuid, bullet);
    this.stage.addChild(bullet);
  }

  playerTurn(model, values) {
    const gun = model.children[1], worm = model.children[0];
    if (values.pos === 'L') {
      worm.scale.x = 1;
      gun.scale.x = 1;
      gun.x = -5;
    } else if (values.pos === 'R') {
      worm.scale.x = -1;
      gun.scale.x = -1;
      gun.x = 5;
    }
  }
}
