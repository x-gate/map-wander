import type { DecodedGraphic } from "../resources/binary";

export function cursorHotspot(
  graphic: Pick<DecodedGraphic, "width" | "height" | "offX" | "offY">,
) {
  return {
    x: Math.min(graphic.width - 1, Math.max(0, -graphic.offX)),
    y: Math.min(graphic.height - 1, Math.max(0, -graphic.offY)),
  };
}

export function cursorCssValue(graphic: DecodedGraphic) {
  const canvas = document.createElement("canvas");
  canvas.width = graphic.width;
  canvas.height = graphic.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("瀏覽器無法建立 CSS 游標圖像。");
  context.putImageData(
    new ImageData(
      Uint8ClampedArray.from(graphic.rgba),
      graphic.width,
      graphic.height,
    ),
    0,
    0,
  );
  const hotspot = cursorHotspot(graphic);
  return `url("${canvas.toDataURL("image/png")}") ${hotspot.x} ${hotspot.y}, default`;
}
