export const load = (data, stage) => {
  let row = 0;
  const colHeight = data.height / data.tilesGrid;
  const colWidth = data.width / data.tilesWidth;
  const groundLevel = window.innerHeight;

  data.tilesMap.forEach((item, index) => {
    if (item.x.from !== item.x.to) {
      const Sprite = new PIXI.Sprite.fromFrame(`${item.tile}`);
      const SpriteCount = Math.floor((item.x.to - item.x.from) / Sprite.width );

      for (let i = 0; i < SpriteCount; i++) {
          const newSprite =  new PIXI.Sprite.fromFrame(`${item.tile}`);
          newSprite.y = 850;
          newSprite.x = item.x.from + (Sprite.width  * i  -3);
          stage.addChild(newSprite);
      }
    }
    // if (col !== 0) {
    //
    //   const indexString = index.toString();
    //   const rowfromLeft = indexString.substring(
    //     indexString.length - 1,
    //     indexString.length
    //   );

    //   Sprite.zOrder = 5;
    //
    // }
  });
};
