export const TILE_WIDTH = 64;
export const TILE_HEIGHT = 48;

// Raw file coordinates are preserved. x grows north-east and y grows south-east.
export function tilePosition(x: number, y: number, width: number) {
  const column = y;
  const row = width - 1 - x;
  return {
    x: ((column - row) * TILE_WIDTH) / 2,
    y: ((column + row + 1) * TILE_HEIGHT) / 2,
  };
}

export function screenTile(px: number, py: number, width: number) {
  const column = Math.floor(px / TILE_WIDTH + py / TILE_HEIGHT);
  const row = Math.floor(py / TILE_HEIGHT - px / TILE_WIDTH);
  return { x: width - 1 - row, y: column };
}

export function clampZoom(value: number) {
  return Math.min(3, Math.max(0.35, value));
}

export function cameraPosition(
  target: { x: number; y: number },
  viewportWidth: number,
  viewportHeight: number,
  scale: number,
) {
  return {
    x: viewportWidth / 2 - target.x * scale,
    y: viewportHeight / 2 - target.y * scale,
  };
}
