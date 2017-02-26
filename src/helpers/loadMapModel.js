export const load = (data, stage) => {
  let row = 0;
  const colHeight = data.height / data.tilesGrid;
  const colWidth = data.width / data.tilesWidth;
  const groundLevel = window.innerHeight;
  data.tilesMap.forEach((col, index) => {
    if (index % data.tilesWidth === 0) {
      row += 1;
    }

    if (col !== 0) {
      const Sprite = new PIXI.Sprite.fromFrame(`${col}`);
      const indexString = index.toString();
      const rowfromLeft = indexString.substring(
        indexString.length - 1,
        indexString.length
      );
      Sprite.width = colWidth / 2;
      Sprite.height = colHeight / 2;
      Sprite.y = (groundLevel - row * colHeight) / 4;
      Sprite.x = (0 + rowfromLeft * colWidth) / 2;
      stage.addChild(Sprite);
    }
  });
};
