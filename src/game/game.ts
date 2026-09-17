import {
  Application,
  BufferImageSource,
  Container,
  RenderLayer,
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
import {
  cameraPosition,
  clampZoom,
  defaultZoom,
  screenTile,
  tilePosition,
} from "./geometry";
import {
  buildWalkability,
  directionFor,
  directionToward,
  findPathToward,
  movementStepDuration,
  type Cell,
} from "./movement";
import { resolveSpawn, type SpawnPoint } from "./spawn";
import { warpOnStep, type MapWarps } from "./warp";
import type { WarpDefinition } from "../resources/warp";
import { MapVisibility, viewportBounds, type Placement } from "./visibility";
import { VisibleGraphics } from "./visible-graphics";

const STEP_DURATION = 190;

interface Segment {
  from: Cell;
  to: Cell;
  elapsed: number;
  duration: number;
}

export interface GameStatus {
  player: Cell;
  direction: number;
  hover?: Cell;
  target?: Cell;
  message: string;
  zoom: number;
  visibleTiles: number;
  totalTiles: number;
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
  private npcLayer = new Container();
  private depthLayer = new RenderLayer({ sortableChildren: true });
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
  private direction: number;
  private pendingDirection?: number;
  private animationClock: AnimationClock = { action: 0, elapsed: 0 };
  private cameraFollowing = true;
  private characterFoot?: { x: number; y: number };
  private dragging?: { id: number; x: number; y: number; moved: boolean };
  private observer?: ResizeObserver;
  private initialized = false;
  private transitioning = false;
  private visibility: MapVisibility;
  private visible = new Map<number, Placement>();
  private tileSprites = new Map<number, Sprite>();
  private tileGraphics: VisibleGraphics<Texture>;
  private drawOrder = new WeakMap<Container, number>();
  private lastViewport = "";
  private message = "左鍵移動，右鍵改變朝向";
  onStatus: (status: GameStatus) => void = () => {};
  onWarp: (warp: WarpDefinition, direction: number) => void = () => {};

  constructor(
    private host: HTMLElement,
    private resources: LoadedGame,
    spawn?: SpawnPoint,
    private warps: MapWarps = new Map(),
    private initialZoom?: number,
  ) {
    this.visibility = new MapVisibility(resources);
    this.tileGraphics = new VisibleGraphics(
      async (record) => textureFrom(await resources.decodeGraphic(record)),
      (texture) => texture.destroy(true),
      () => {
        this.syncTileSprites();
        const error = this.tileGraphics.errors.values().next();
        if (!error.done)
          this.message = `視野圖像載入失敗：${String(error.value)}`;
        this.emitStatus();
      },
    );
    this.ground.sortableChildren = true;
    this.depthLayer.sortFunction = (a, b) =>
      a.zIndex - b.zIndex ||
      (this.drawOrder.get(a) ?? 0) - (this.drawOrder.get(b) ?? 0);
    this.walkability = buildWalkability(resources.map, resources.mapRecords);
    const { width, height } = resources.map.header;
    const start = resolveSpawn(
      width,
      height,
      (x, y) => this.isWalkable(x, y),
      spawn,
    );
    this.player = { x: start.x, y: start.y };
    this.direction = start.direction;
    const markerTexture = this.texture(resources.marker);
    const idle = resources.clips.get(clipKey(this.direction, 0));
    if (!idle?.frames[0]) throw new Error("角色缺少預設靜止影格。");
    this.marker = new Sprite(markerTexture);
    this.marker.visible = false;
    this.character = new Sprite(this.texture(idle.frames[0].graphic));
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
      autoStart: false,
      resizeTo: this.host,
    });
    this.initialized = true;
    this.host.replaceChildren(this.app.canvas);
    this.app.canvas.setAttribute(
      "aria-label",
      `${this.resources.mapPath} 地圖畫布；左鍵移動或拖曳平移，右鍵改變朝向，滾輪縮放`,
    );
    this.app.canvas.tabIndex = 0;
    this.app.canvas.style.cursor = cursorCssValue(this.resources.cursor);
    this.app.stage.addChild(this.world);
    this.world.addChild(this.ground, this.scene, this.depthLayer, this.marker);
    this.scene.addChild(this.npcLayer);
    this.scene.addChild(this.character);
    this.depthLayer.attach(this.character);
    const { width, height } = this.resources.map.header;
    this.world.scale.set(
      this.initialZoom ??
        defaultZoom(
          width,
          height,
          this.host.clientWidth,
          this.host.clientHeight,
        ),
    );
    this.updateCharacter(0);
    await this.tileGraphics.ready();
    this.app.render();
    this.bindInput();
    this.app.ticker.add((ticker) => this.tick(ticker.deltaMS));
    this.observer = new ResizeObserver(() => {
      if (this.cameraFollowing && this.characterFoot)
        this.centerCameraOn(this.characterFoot);
      else this.refreshViewport();
    });
    this.observer.observe(this.host);
    this.emitStatus();
  }

  get zoom() {
    return this.world.scale.x;
  }

  start() {
    this.app.start();
  }

  private refreshViewport() {
    const bounds = viewportBounds(
      this.world.x,
      this.world.y,
      this.zoom,
      this.host.clientWidth,
      this.host.clientHeight,
    );
    const key = `${bounds.left},${bounds.top},${bounds.right},${bounds.bottom}`;
    if (this.lastViewport === key) return;
    this.lastViewport = key;
    this.visible = new Map(
      this.visibility
        .query(bounds)
        .map((placement) => [placement.key, placement]),
    );
    // Remove sprites before releasing their shared textures.
    for (const [id, sprite] of this.tileSprites) {
      if (this.visible.has(id)) continue;
      this.depthLayer.detach(sprite);
      sprite.destroy();
      this.tileSprites.delete(id);
    }
    this.tileGraphics.set(
      [...this.visible.values()].map(({ record }) => record),
    );
    this.syncTileSprites();
    this.emitStatus();
  }

  private syncTileSprites() {
    for (const placement of this.visible.values()) {
      if (this.tileSprites.has(placement.key)) continue;
      const texture = this.tileGraphics.loaded.get(placement.record.row);
      if (!texture) continue;
      const sprite = new Sprite(texture);
      sprite.position.set(placement.left, placement.top);
      this.drawOrder.set(sprite, placement.key);
      if (placement.label) sprite.label = placement.label;
      if (placement.layer === "ground") {
        sprite.zIndex = placement.key;
        this.ground.addChild(sprite);
      } else {
        sprite.zIndex = placement.depth;
        (placement.layer === "npc" ? this.npcLayer : this.scene).addChild(
          sprite,
        );
        this.depthLayer.attach(sprite);
      }
      this.tileSprites.set(placement.key, sprite);
    }
  }

  private centerCameraOn(point: { x: number; y: number }) {
    const position = cameraPosition(
      point,
      this.host.clientWidth,
      this.host.clientHeight,
      this.world.scale.x,
    );
    this.world.position.set(position.x, position.y);
    this.refreshViewport();
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
      if (this.transitioning) return;
      const drag = this.dragging;
      if (drag && drag.id === event.pointerId) {
        const dx = event.clientX - drag.x;
        const dy = event.clientY - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 2) {
          drag.moved = true;
          this.cameraFollowing = false;
        }
        this.world.x += dx;
        this.world.y += dy;
        drag.x = event.clientX;
        drag.y = event.clientY;
        this.refreshViewport();
      }
      this.movePointer(event);
    });
    canvas.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || this.transitioning) return;
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
        if (this.transitioning) return;
        const rect = canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        const current = this.world.scale.x;
        const next = clampZoom(current * Math.exp(-event.deltaY * 0.0015));
        if (this.cameraFollowing && this.characterFoot) {
          this.world.scale.set(next);
          this.centerCameraOn(this.characterFoot);
          return;
        }
        const ratio = next / current;
        this.world.position.set(
          x - (x - this.world.x) * ratio,
          y - (y - this.world.y) * ratio,
        );
        this.world.scale.set(next);
        this.refreshViewport();
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
    if (this.transitioning) return;
    const { width, height } = this.resources.map.header;
    const start = this.segment?.to ?? this.player;
    const route = findPathToward(start, goal, width, height, (x, y) =>
      this.isWalkable(x, y),
    );
    if (!route) {
      this.message = `格位 (${goal.x}, ${goal.y}) 無法抵達`;
      this.emitStatus();
      return;
    }
    this.route = route.slice(1);
    this.cameraFollowing = true;
    this.pendingDirection = undefined;
    this.target = goal;
    const destination = route[route.length - 1];
    const reachesGoal = destination.x === goal.x && destination.y === goal.y;
    if (route.length === 1)
      this.message = reachesGoal
        ? "角色已在指定格位"
        : `朝向 (${goal.x}, ${goal.y}) 的路徑已被障礙物阻擋`;
    else
      this.message = reachesGoal
        ? `前往 (${goal.x}, ${goal.y})`
        : `朝向 (${goal.x}, ${goal.y}) 移動，將停在 (${destination.x}, ${destination.y})`;
    this.emitStatus();
  }

  private faceToward(target: Cell) {
    if (this.transitioning) return;
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
    if (this.transitioning) return;
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
        const previous = this.player;
        this.player = this.segment.to;
        this.segment = undefined;
        const warp = warpOnStep(this.warps, previous, this.player);
        if (warp) {
          this.route = [];
          this.pendingDirection = undefined;
          this.target = undefined;
          this.transitioning = true;
          this.message = `傳送至地圖 ${warp.to.mapId} (${warp.to.x}, ${warp.to.y})…`;
          this.updateCharacter(0);
          this.emitStatus();
          this.onWarp(warp, this.direction);
          return;
        }
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
    this.characterFoot = foot;
    this.character.texture = this.texture(frame.graphic);
    this.character.position.set(
      foot.x + frame.graphic.offX + frame.offsetX,
      foot.y + frame.graphic.offY + frame.offsetY,
    );
    this.character.zIndex = foot.y + 0.5;
    if (this.cameraFollowing) this.centerCameraOn(foot);
  }

  private emitStatus() {
    this.onStatus({
      player: { ...this.player },
      direction: this.direction,
      hover: this.hover && { ...this.hover },
      target: this.target && { ...this.target },
      message: this.message,
      zoom: this.zoom,
      visibleTiles: this.tileSprites.size,
      totalTiles: this.visibility.total,
    });
  }

  publishStatus() {
    this.emitStatus();
  }

  setTransitioning(value: boolean, message?: string) {
    this.transitioning = value;
    this.dragging = undefined;
    if (message) {
      this.message = message;
      this.emitStatus();
    }
  }

  destroy() {
    this.observer?.disconnect();
    this.tileGraphics.destroy();
    for (const texture of this.textures) texture.destroy(true);
    // Map transitions briefly own two applications. `true` also releases
    // Pixi's global pools, invalidating batches used by the other renderer.
    if (this.initialized)
      this.app.destroy(
        { removeView: true, releaseGlobalResources: false },
        { children: true },
      );
    else this.world.destroy({ children: true });
  }
}
