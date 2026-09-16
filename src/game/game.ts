import {
  Application,
  BufferImageSource,
  Container,
  Sprite,
  Texture,
} from "pixi.js";
import type { DecodedGraphic } from "../resources/binary";
import { clipKey } from "../resources/game-resources";
import type { LoadedGame } from "../resources/game-resources";
import {
  advanceAnimationClock,
  loopFrameIndex,
  type AnimationClock,
} from "./animation";
import { cursorCssValue } from "./cursor";
import { clampZoom, screenTile, tilePosition } from "./geometry";
import {
  buildWalkability,
  directionFor,
  directionToward,
  findPath,
  movementStepDuration,
  nearestWalkable,
  type Cell,
} from "./movement";

const STEP_DURATION = 190;

interface Segment {
  from: Cell;
  to: Cell;
  elapsed: number;
  duration: number;
}

export interface GameStatus {
  player: Cell;
  hover?: Cell;
  target?: Cell;
  message: string;
}

function textureFrom(graphic: DecodedGraphic) {
  return new Texture({
    source: new BufferImageSource({
      resource: graphic.rgba,
      width: graphic.width,
      height: graphic.height,
      format: "rgba8unorm",
      alphaMode: "no-premultiply-alpha",
      scaleMode: "nearest",
    }),
  });
}

export class WanderGame {
  private app = new Application();
  private world = new Container();
  private ground = new Container();
  private scene = new Container();
  private marker: Sprite;
  private character: Sprite;
  private textures: Texture[] = [];
  private textureByGraphic = new Map<DecodedGraphic, Texture>();
  private walkability: Uint8Array;
  private player: Cell;
  private hover?: Cell;
  private target?: Cell;
  private route: Cell[] = [];
  private segment?: Segment;
  private direction = 4;
  private pendingDirection?: number;
  private animationClock: AnimationClock = { action: 0, elapsed: 0 };
  private dragging?: { id: number; x: number; y: number; moved: boolean };
  private observer?: ResizeObserver;
  private message = "左鍵移動，右鍵改變朝向";
  onStatus: (status: GameStatus) => void = () => {};

  constructor(
    private host: HTMLElement,
    private resources: LoadedGame,
  ) {
    this.walkability = buildWalkability(
      resources.map,
      resources.collisionRecords,
    );
    const markerTexture = this.texture(resources.marker);
    const idle = resources.clips.get(clipKey(this.direction, 0));
    if (!idle?.frames[0]) throw new Error("角色缺少預設靜止影格。");
    this.marker = new Sprite(markerTexture);
    this.marker.visible = false;
    this.character = new Sprite(this.texture(idle.frames[0].graphic));
    const { width, height } = resources.map.header;
    this.player = nearestWalkable(
      { x: Math.floor(width / 2), y: Math.floor(height / 2) },
      width,
      height,
      (x, y) => this.isWalkable(x, y),
    );
  }

  private texture(graphic: DecodedGraphic) {
    let texture = this.textureByGraphic.get(graphic);
    if (!texture) {
      texture = textureFrom(graphic);
      this.textureByGraphic.set(graphic, texture);
      this.textures.push(texture);
    }
    return texture;
  }

  private isWalkable(x: number, y: number) {
    const { width, height } = this.resources.map.header;
    if (x < 0 || y < 0 || x >= width || y >= height) return false;
    return this.walkability[y * width + x] === 1;
  }

  async initialize() {
    await this.app.init({
      background: "#090d11",
      antialias: false,
      autoDensity: true,
      resolution: Math.min(devicePixelRatio, 2),
      preference: "webgl",
      resizeTo: this.host,
    });
    this.host.replaceChildren(this.app.canvas);
    this.app.canvas.setAttribute(
      "aria-label",
      "1011 地圖畫布；左鍵移動或拖曳平移，右鍵改變朝向，滾輪縮放",
    );
    this.app.canvas.tabIndex = 0;
    this.app.canvas.style.cursor = cursorCssValue(this.resources.cursor);
    this.scene.sortableChildren = true;
    this.app.stage.addChild(this.world);
    this.world.addChild(this.ground, this.scene, this.marker);
    this.renderMap();
    this.scene.addChild(this.character);
    this.fit();
    this.bindInput();
    this.updateCharacter(0);
    this.app.ticker.add((ticker) => this.tick(ticker.deltaMS));
    this.observer = new ResizeObserver(() => this.fit());
    this.observer.observe(this.host);
    this.emitStatus();
  }

  private renderMap() {
    const { map, mapGraphics, mapRecords } = this.resources;
    const { width, height } = map.header;
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const index = y * width + x;
        const point = tilePosition(x, y, width);
        for (const layer of ["ground", "object"] as const) {
          const id = map[layer][index];
          const graphic = mapGraphics.get(id);
          if (!graphic) continue;
          const sprite = new Sprite(this.texture(graphic));
          sprite.position.set(point.x + graphic.offX, point.y + graphic.offY);
          const record = mapRecords.get(id);
          if (layer === "ground" || record?.asGround)
            this.ground.addChild(sprite);
          else {
            sprite.zIndex = point.y;
            this.scene.addChild(sprite);
          }
        }
      }
  }

  private fit() {
    const { width, height } = this.resources.map.header;
    const mapWidth = (width + height) * 32;
    const mapHeight = (width + height) * 24 + 160;
    const zoom = clampZoom(
      Math.min(
        (this.host.clientWidth - 80) / mapWidth,
        (this.host.clientHeight - 80) / mapHeight,
        1.5,
      ),
    );
    this.world.scale.set(zoom);
    this.world.position.set(
      this.host.clientWidth / 2 - (height - width) * 16 * zoom,
      this.host.clientHeight / 2 - (width + height) * 12 * zoom + 70,
    );
  }

  private tileFromPointer(clientX: number, clientY: number) {
    const rect = this.app.canvas.getBoundingClientRect();
    return screenTile(
      (clientX - rect.left - this.world.x) / this.world.scale.x,
      (clientY - rect.top - this.world.y) / this.world.scale.y,
      this.resources.map.header.width,
    );
  }

  private validCell(cell: Cell) {
    const { width, height } = this.resources.map.header;
    return cell.x >= 0 && cell.y >= 0 && cell.x < width && cell.y < height;
  }

  private bindInput() {
    const canvas = this.app.canvas;
    canvas.addEventListener("pointerenter", (event) => {
      this.movePointer(event);
    });
    canvas.addEventListener("pointerleave", () => {
      this.marker.visible = false;
      this.hover = undefined;
      this.emitStatus();
    });
    canvas.addEventListener("pointermove", (event) => {
      const drag = this.dragging;
      if (drag && drag.id === event.pointerId) {
        const dx = event.clientX - drag.x;
        const dy = event.clientY - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
        this.world.x += dx;
        this.world.y += dy;
        drag.x = event.clientX;
        drag.y = event.clientY;
      }
      this.movePointer(event);
    });
    canvas.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      this.dragging = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        moved: false,
      };
      canvas.setPointerCapture(event.pointerId);
      canvas.focus();
    });
    canvas.addEventListener("pointerup", (event) => {
      const drag = this.dragging;
      if (!drag || drag.id !== event.pointerId) return;
      this.dragging = undefined;
      if (!drag.moved) {
        const cell = this.tileFromPointer(event.clientX, event.clientY);
        if (this.validCell(cell)) this.moveTo(cell);
      }
    });
    canvas.addEventListener("lostpointercapture", () => {
      this.dragging = undefined;
    });
    canvas.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      const cell = this.tileFromPointer(event.clientX, event.clientY);
      if (this.validCell(cell)) this.faceToward(cell);
    });
    canvas.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        const current = this.world.scale.x;
        const next = clampZoom(current * Math.exp(-event.deltaY * 0.0015));
        const ratio = next / current;
        this.world.position.set(
          x - (x - this.world.x) * ratio,
          y - (y - this.world.y) * ratio,
        );
        this.world.scale.set(next);
      },
      { passive: false },
    );
  }

  private movePointer(event: PointerEvent) {
    const cell = this.tileFromPointer(event.clientX, event.clientY);
    if (!this.validCell(cell)) {
      this.marker.visible = false;
      this.hover = undefined;
    } else {
      this.hover = cell;
      const point = tilePosition(
        cell.x,
        cell.y,
        this.resources.map.header.width,
      );
      this.marker.position.set(
        point.x + this.resources.marker.offX,
        point.y + this.resources.marker.offY,
      );
      this.marker.visible = true;
    }
    this.emitStatus();
  }

  private moveTo(goal: Cell) {
    const { width, height } = this.resources.map.header;
    const start = this.segment?.to ?? this.player;
    const route = findPath(start, goal, width, height, (x, y) =>
      this.isWalkable(x, y),
    );
    if (!route) {
      this.message = `格位 (${goal.x}, ${goal.y}) 無法抵達`;
      this.emitStatus();
      return;
    }
    this.route = route.slice(1);
    this.pendingDirection = undefined;
    this.target = goal;
    this.message =
      route.length === 1 ? "角色已在指定格位" : `前往 (${goal.x}, ${goal.y})`;
    this.emitStatus();
  }

  private faceToward(target: Cell) {
    const origin = this.segment?.to ?? this.player;
    const direction = directionToward(origin, target);
    if (direction === null) {
      this.message = "點擊格位與角色位置相同，朝向維持不變";
      this.emitStatus();
      return;
    }
    this.route = [];
    this.target = undefined;
    if (this.segment) {
      this.pendingDirection = direction;
      this.message = `完成目前一步後轉向方向 ${direction}`;
    } else {
      this.direction = direction;
      this.animationClock = { action: 0, elapsed: 0 };
      this.message = `已轉向方向 ${direction}`;
      this.updateCharacter(0);
    }
    this.emitStatus();
  }

  private tick(deltaMS: number) {
    const elapsed = Math.min(deltaMS, 50);
    if (!this.segment && this.route.length) {
      const to = this.route.shift()!;
      this.segment = {
        from: this.player,
        to,
        elapsed: 0,
        duration: movementStepDuration(this.player, to, STEP_DURATION),
      };
      this.direction = directionFor(this.player, to);
    }
    if (this.segment) {
      this.segment.elapsed += elapsed;
      if (this.segment.elapsed >= this.segment.duration) {
        this.player = this.segment.to;
        this.segment = undefined;
        if (!this.route.length) {
          if (this.pendingDirection !== undefined) {
            this.direction = this.pendingDirection;
            this.pendingDirection = undefined;
          }
          this.target = undefined;
          this.message = `已停在 (${this.player.x}, ${this.player.y})，方向 ${this.direction}`;
          this.emitStatus();
        }
      }
    }
    this.updateCharacter(elapsed);
  }

  private updateCharacter(deltaMS: number) {
    const action: 0 | 1 = this.segment || this.route.length ? 1 : 0;
    this.animationClock = advanceAnimationClock(
      this.animationClock,
      action,
      deltaMS,
    );
    const clip = this.resources.clips.get(clipKey(this.direction, action));
    if (!clip?.frames.length) return;
    const frame =
      clip.frames[
        loopFrameIndex(
          this.animationClock.elapsed,
          clip.duration,
          clip.frames.length,
        )
      ];
    const from = this.segment?.from ?? this.player;
    const to = this.segment?.to ?? this.player;
    const progress = this.segment
      ? Math.min(1, this.segment.elapsed / this.segment.duration)
      : 1;
    const a = tilePosition(from.x, from.y, this.resources.map.header.width);
    const b = tilePosition(to.x, to.y, this.resources.map.header.width);
    const foot = {
      x: a.x + (b.x - a.x) * progress,
      y: a.y + (b.y - a.y) * progress,
    };
    this.character.texture = this.texture(frame.graphic);
    this.character.position.set(
      foot.x + frame.graphic.offX + frame.offsetX,
      foot.y + frame.graphic.offY + frame.offsetY,
    );
    this.character.zIndex = foot.y + 0.5;
  }

  private emitStatus() {
    this.onStatus({
      player: { ...this.player },
      hover: this.hover && { ...this.hover },
      target: this.target && { ...this.target },
      message: this.message,
    });
  }

  destroy() {
    this.observer?.disconnect();
    for (const texture of this.textures) texture.destroy(true);
    this.app.destroy(true, { children: true });
  }
}
