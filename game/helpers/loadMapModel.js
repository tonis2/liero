export const loadModels = (data, stage, physics) => {
  let row = 0;
  const colHeight = data.height / data.tilesGrid;
  const colWidth = data.width / data.tilesWidth;
  const groundLevel = window.innerHeight;
  data.tilesMap.forEach((item, index) => {
    const Sprite = new PIXI.Sprite.fromFrame(`${item.tile}`);
    const SpriteCount = item.x.to !== item.x.from
      ? Math.floor((item.x.to - item.x.from) / Sprite.width)
      : 1;

    for (let i = 0; i < SpriteCount; i++) {
      const newSprite = new PIXI.Sprite.fromFrame(`${item.tile}`);
      if (item.y.from !== item.y.to) {
        newSprite.y = window.innerHeight -
          Sprite.height -
          item.y.from -
          (Sprite.height * i - 3);
      } else {
        newSprite.y = window.innerHeight - Sprite.height - item.y.from;
      }
      if (item.x.from === item.x.to) {
        newSprite.x = item.x.from;
      } else {
        newSprite.x = item.x.from + (Sprite.width * i - 3);
      }
      stage.addChild(newSprite);
    }
    if (item.polygon) {
      const polygonY = window.innerHeight - item.polygon.y;
      const polygonBody = new p2.Body({
        position: [item.polygon.x, polygonY]
      });
      polygonBody.fromPolygon(item.polygon.map);
      physics.addModel(polygonBody);
    }
  });
};
