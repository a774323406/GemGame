import {
  _decorator,
  Button,
  Color,
  Component,
  EventTouch,
  Label,
  Node,
  Prefab,
  Sprite,
  SpriteFrame,
  sys,
  TextAsset,
  instantiate,
  tween,
  UITransform,
  Vec3,
  HorizontalTextAlignment,
  VerticalTextAlignment,
} from "cc";
import { ResourceManager } from "./framework/ResourceManager";

const { ccclass, property } = _decorator;

type Matrix = number[][];
type BlockLocation = "board" | "tray";

interface LevelData {
  rows: number;
  cols: number;
  complete: Matrix;
  shuffle: Matrix;
}

interface TileState {
  row: number;
  col: number;
  color: number;
  node: Node;
  block: BlockState | null;
}

interface TraySlotState {
  index: number;
  node: Node;
  block: BlockState | null;
}

interface BlockState {
  id: number;
  color: number;
  row: number;
  col: number;
  node: Node;
  normalSprite: Sprite;
  collapsedSprite: Sprite;
  selectedFx: Sprite | null;
  collapsed: boolean;
  selected: boolean;
  location: BlockLocation;
  slot: TraySlotState | null;
}

const COLOR_NAMES = [
  "",
  "Blue",
  "Brown",
  "Cyan",
  "DarkBlue",
  "Green",
  "LightGreen",
  "LightPink",
  "LightYellow",
  "Orange",
  "Pink",
  "Purple",
  "PurpleRed",
  "Red",
  "White",
  "Yellow",
  "DarkBrown",
  "DarkGreen",
  "Black",
  "LightOrange",
];

const STORAGE_LEVEL_KEY = "gem_sort_level";
const MAX_TRAY_SLOTS = 12;

@ccclass("gameScene")
export class gameScene extends Component {
  @property
  public startLevel = 1;

  @property(Prefab)
  public tilePrefab: Prefab = null;

  @property(Prefab)
  public blockPrefab: Prefab = null;

  @property(Prefab)
  public emptyBlockPrefab: Prefab = null;

  @property(Prefab)
  public traySlotPrefab: Prefab = null;

  private root: Node = null;
  private boardRoot: Node = null;
  private tileRoot: Node = null;
  private blockRoot: Node = null;
  private trayRoot: Node = null;
  private hudRoot: Node = null;
  private levelLabel: Label = null;
  private messageLabel: Label = null;

  private levelIndex = 1;
  private levelData: LevelData = null;
  private tiles: TileState[][] = [];
  private blocks: BlockState[] = [];
  private traySlots: TraySlotState[] = [];
  private selectedBlocks: BlockState[] = [];

  private readonly maxCellSize = 57.6;
  private cellSize = 57.6;
  private cellStep = 47.2;
  private boardOrigin = new Vec3();
  private trayCellSize = 57.6;
  private inputLocked = false;
  private blockIdSeed = 0;

  private tileFrames = new Map<number, SpriteFrame>();
  private blockFrames = new Map<number, SpriteFrame>();
  private collapsedFrames = new Map<number, SpriteFrame>();
  private selectFrame: SpriteFrame = null;
  private traySlotFrame: SpriteFrame = null;

  protected async start() {
    await this.prepareScene();
    await this.loadAssets();
    this.levelIndex = Math.max(
      1,
      Number(sys.localStorage.getItem(STORAGE_LEVEL_KEY) || this.startLevel),
    );
    await this.loadLevel(this.levelIndex);
  }

  private async prepareScene() {
    this.root = this.createNode("GameRoot", this.node, 750, 1334);
    this.boardRoot = this.createNode("BoardRoot", this.root, 750, 760);
    this.tileRoot = this.createNode("TileRoot", this.boardRoot, 750, 760);
    this.trayRoot = this.createNode("TrayRoot", this.root, 750, 120);
    this.blockRoot = this.createNode("BlockRoot", this.root, 750, 1334);
    this.hudRoot = this.createNode("HudRoot", this.root, 750, 1334);

    this.levelLabel = this.createLabel("LevelLabel", this.hudRoot, "", 36);
    this.levelLabel.node.setPosition(0, 575);

    this.messageLabel = this.createLabel("MessageLabel", this.hudRoot, "", 42);
    this.messageLabel.node.setPosition(0, 0);
    this.messageLabel.node.active = false;

    this.node.on(Node.EventType.TOUCH_END, this.onSceneTouchEnd, this);
    this.bindBoosterButtons();
  }

  private bindBoosterButtons() {
    const bottom = this.node.getChildByName("bottom");
    const buttons = bottom
      ? bottom.children.filter((child) => child.getComponent(Button))
      : [];

    const binds = [
      () => this.onMagicClicked(),
      () => this.onBrushClicked(),
      () => this.onMagnetClicked(),
    ];
    const names = ["Magic", "Brush", "Magnet"];

    for (let i = 0; i < Math.min(buttons.length, binds.length); i++) {
      const btn = buttons[i].getComponent(Button);
      buttons[i].off(Node.EventType.TOUCH_END);
      btn.node.on("click", binds[i], this);

      const title = this.createLabel(`${names[i]}Label`, buttons[i], names[i], 18);
      title.node.setPosition(0, -46);
    }
  }

  private async loadAssets() {
    await ResourceManager.ins.loadBundle("res");
    await this.loadDefaultPrefabs();

    const select = await this.tryLoadSprite(
      "texture/Tiles/Tiles/gem_select_fx",
    );
    this.selectFrame = select;
    this.traySlotFrame = await this.tryLoadSprite("texture/Trays/TraySlot");

    for (let color = 1; color < COLOR_NAMES.length; color++) {
      const name = COLOR_NAMES[color];
      const [tile, block, collapsed] = await Promise.all([
        this.tryLoadSprite(`texture/Tiles/Holes/LayerBottom_${name}`),
        this.tryLoadSprite(`texture/Tiles/Tiles/Gem_${name}_2`),
        this.tryLoadSprite(`texture/Tiles/TilesCollapsed/Gem_${name}_3`),
      ]);

      if (tile) this.tileFrames.set(color, tile);
      if (block) this.blockFrames.set(color, block);
      if (collapsed) this.collapsedFrames.set(color, collapsed);
    }
  }

  private async loadDefaultPrefabs() {
    const [tile, block, traySlot] = await Promise.all([
      this.tryLoadPrefab("prefab/Blocks/Tile"),
      this.tryLoadPrefab("prefab/Blocks/Block"),
      this.tryLoadPrefab("prefab/Blocks/TraySlot"),
    ]);
    const emptyBlock = await this.tryLoadPrefab("prefab/Blocks/EmptyBlock");

    if (!this.tilePrefab && tile) this.tilePrefab = tile;
    if (!this.blockPrefab && block) this.blockPrefab = block;
    if (!this.emptyBlockPrefab && emptyBlock) this.emptyBlockPrefab = emptyBlock;
    if (!this.traySlotPrefab && traySlot) this.traySlotPrefab = traySlot;
  }

  private async tryLoadPrefab(path: string): Promise<Prefab | null> {
    try {
      return await ResourceManager.ins.loadBundleAsset("res", path, Prefab);
    } catch {
      return null;
    }
  }

  private async tryLoadSprite(path: string): Promise<SpriteFrame | null> {
    const candidates = [`${path}/spriteFrame`, path];
    for (const candidate of candidates) {
      try {
        return await ResourceManager.ins.loadBundleAsset(
          "res",
          candidate,
          SpriteFrame,
        );
      } catch {
        // Try the next Cocos asset path shape.
      }
    }
    return null;
  }

  private async loadLevel(levelIndex: number) {
    this.inputLocked = true;
    this.clearBoard();

    let data = await this.loadLevelData(levelIndex);
    if (!data && levelIndex !== 1) {
      this.levelIndex = 1;
      sys.localStorage.setItem(STORAGE_LEVEL_KEY, "1");
      data = await this.loadLevelData(1);
    }

    if (!data) {
      this.showMessage("No Level Data");
      return;
    }

    this.levelData = data;
    this.levelLabel.string = `Level ${this.levelIndex}`;
    this.buildBoard();
    this.buildTray();
    this.inputLocked = false;
    this.checkWin();
  }

  private async loadLevelData(levelIndex: number): Promise<LevelData | null> {
    try {
      const asset = await ResourceManager.ins.loadBundleAsset(
        "res",
        `Levels/Level${levelIndex}_Complete`,
        TextAsset,
      );
      return this.parseLevel(asset.text);
    } catch (err) {
      console.warn(`[gameScene] Level ${levelIndex} load failed`, err);
      return null;
    }
  }

  private parseLevel(text: string): LevelData | null {
    const sections = text.split(/\r?\n---\r?\n/);
    const complete = this.parseMatrix(sections[0]);
    if (complete.length === 0) return null;

    const shuffle = sections.length > 1 ? this.parseMatrix(sections[1]) : [];
    const rows = complete.length;
    const cols = Math.max(...complete.map((row) => row.length));
    this.normalizeMatrix(complete, rows, cols);

    if (shuffle.length !== rows) {
      return { rows, cols, complete, shuffle: complete.map((row) => [...row]) };
    }

    this.normalizeMatrix(shuffle, rows, cols);
    return { rows, cols, complete, shuffle };
  }

  private parseMatrix(text: string): Matrix {
    return text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) =>
        line
          .split(/\s+/)
          .map((part) => Math.max(0, Math.min(19, Number(part) || 0))),
      );
  }

  private normalizeMatrix(matrix: Matrix, rows: number, cols: number) {
    for (let r = 0; r < rows; r++) {
      if (!matrix[r]) matrix[r] = [];
      for (let c = 0; c < cols; c++) {
        matrix[r][c] = matrix[r][c] || 0;
      }
    }
  }

  private buildBoard() {
    const { rows, cols } = this.levelData;
    const maxBoardWidth = 430;
    const maxBoardHeight = 500;
    this.cellSize = Math.min(this.maxCellSize, maxBoardWidth / cols, maxBoardHeight / rows);
    this.cellStep = this.cellSize * 0.82;

    const width = (cols - 1) * this.cellStep;
    const height = (rows - 1) * this.cellStep;
    this.boardOrigin.set(-width / 2, 185 + height / 2, 0);

    this.tiles = [];
    for (let r = 0; r < rows; r++) {
      this.tiles[r] = [];
      for (let c = 0; c < cols; c++) {
        const color = this.levelData.complete[r][c];
        const pos = this.getTilePosition(r, c);
        const tileNode =
          color > 0
            ? this.createTileNode(color, r, c)
            : this.createEmptyBlockNode(r, c);
        tileNode.setPosition(pos);

        const tile: TileState = { row: r, col: c, color, node: tileNode, block: null };
        this.tiles[r][c] = tile;
        if (color > 0) {
          tileNode.on(Node.EventType.TOUCH_END, () => this.onTileClicked(tile), this);
        }

        const blockColor = this.levelData.shuffle[r][c];
        if (color > 0 && blockColor > 0) {
          const block = this.createBlock(blockColor, r, c, pos);
          tile.block = block;
          this.updateCollapse(block, false);
        }
      }
    }
  }

  private buildTray() {
    const startX = -((MAX_TRAY_SLOTS - 1) * this.trayCellSize) / 2;
    const y = -335;
    this.traySlots = [];

    for (let i = 0; i < MAX_TRAY_SLOTS; i++) {
      const node = this.createTraySlotNode(i);
      node.setPosition(startX + i * this.trayCellSize, y);

      const slot: TraySlotState = { index: i, node, block: null };
      this.traySlots.push(slot);
      node.on(Node.EventType.TOUCH_END, () => this.onTraySlotClicked(slot), this);
    }
  }

  private createBlock(color: number, row: number, col: number, pos: Vec3): BlockState {
    const node = this.createPrefabOrNode(
      this.blockPrefab,
      `Block_${this.blockIdSeed}`,
      this.blockRoot,
      this.cellSize,
      this.cellSize,
    );
    node.setPosition(pos);

    const visualRoot = this.ensureChildNode(node, "Root");

    const selectedNode = this.ensureSpriteChild(
      visualRoot,
      "SelectedFx",
      this.selectFrame,
      this.cellSize,
      this.cellSize,
      ["Selection"],
    );
    selectedNode.active = false;

    const normal = this.ensureSpriteChild(
      visualRoot,
      "Normal",
      this.blockFrames.get(color),
      this.cellSize,
      this.cellSize,
      ["IconView"],
    ).getComponent(Sprite);

    const collapsed = this.ensureSpriteChild(
      visualRoot,
      "Collapsed",
      this.collapsedFrames.get(color) || this.blockFrames.get(color),
      this.cellSize,
      this.cellSize,
      ["IconCollapsed"],
    ).getComponent(Sprite);
    collapsed.node.active = false;

    const block: BlockState = {
      id: this.blockIdSeed++,
      color,
      row,
      col,
      node,
      normalSprite: normal,
      collapsedSprite: collapsed,
      selectedFx: selectedNode.getComponent(Sprite),
      collapsed: false,
      selected: false,
      location: "board",
      slot: null,
    };

    this.blocks.push(block);
    node.on(Node.EventType.TOUCH_END, () => this.onBlockClicked(block), this);
    return block;
  }

  private onBlockClicked(block: BlockState) {
    if (this.inputLocked) return;

    if (block.location === "tray") {
      this.selectTrayRun(block);
      return;
    }

    if (block.collapsed) return;

    const group = this.getConnectedBlocks(block.row, block.col, block.color);
    if (group.length === 0) return;
    this.selectBlocks(group);
  }

  private onTraySlotClicked(slot: TraySlotState) {
    if (this.inputLocked) return;
    const boardBlocks = this.selectedBlocks.filter((b) => b.location === "board");
    if (boardBlocks.length === 0) return;
    this.moveBoardBlocksToTray(boardBlocks, slot.index);
  }

  private onSceneTouchEnd(event: EventTouch) {
    if (this.inputLocked) return;
    if (this.selectedBlocks.length === 0) return;

    const tile = this.findTileAtTouch(event);
    if (tile) {
      this.onTileClicked(tile);
    }
  }

  private onTileClicked(tile: TileState) {
    if (this.inputLocked || !tile || !tile.node.active) return;
    if (tile.color <= 0) return;
    if (tile.block || this.selectedBlocks.length === 0) return;

    const matchingBlocks = this.selectedBlocks.filter((b) => b.color === tile.color);
    if (matchingBlocks.length === 0) return;

    const targets = this.getConnectedEmptyTiles(tile.row, tile.col, tile.color);
    const count = Math.min(targets.length, matchingBlocks.length);
    if (count <= 0) return;

    this.inputLocked = true;
    for (let i = 0; i < count; i++) {
      this.moveBlockToTile(matchingBlocks[i], targets[i], i * 0.04);
    }
    this.unselectAll();
    this.scheduleOnce(() => {
      this.inputLocked = false;
      this.checkWin();
    }, 0.35 + count * 0.04);
  }

  private moveBoardBlocksToTray(blocks: BlockState[], startSlotIndex: number) {
    const slots = this.collectEmptyTraySlots(startSlotIndex, blocks.length);
    if (slots.length < blocks.length) {
      this.showMessage("Tray Full");
      return;
    }

    const count = blocks.length;
    this.inputLocked = true;
    for (let i = 0; i < count; i++) {
      const block = blocks[i];
      const slot = slots[i];
      const tile = this.tiles[block.row]?.[block.col];
      if (tile?.block === block) tile.block = null;

      block.location = "tray";
      block.row = -1;
      block.col = -1;
      block.slot = slot;
      slot.block = block;
      this.updateCollapse(block, false);
      block.node.setSiblingIndex(9999);
      this.moveNode(block.node, slot.node.position, 0.22, i * 0.04);
    }

    this.unselectAll();
    this.scheduleOnce(() => {
      this.inputLocked = false;
    }, 0.32 + count * 0.04);
  }

  private moveBlockToTile(block: BlockState, tile: TileState, delay = 0) {
    if (block.location === "tray" && block.slot) {
      block.slot.block = null;
      block.slot = null;
    } else if (block.location === "board") {
      const from = this.tiles[block.row]?.[block.col];
      if (from?.block === block) from.block = null;
    }

    tile.block = block;
    block.location = "board";
    block.row = tile.row;
    block.col = tile.col;
    this.moveNode(block.node, tile.node.position, 0.24, delay, () => {
      this.updateCollapse(block, true);
    });
    block.node.setSiblingIndex(9999);
  }

  private swapBoardBlocks(a: BlockState, b: BlockState) {
    const tileA = this.tiles[a.row][a.col];
    const tileB = this.tiles[b.row][b.col];
    tileA.block = b;
    tileB.block = a;

    const ar = a.row;
    const ac = a.col;
    a.row = b.row;
    a.col = b.col;
    b.row = ar;
    b.col = ac;

    this.moveNode(a.node, tileB.node.position, 0.24, 0, () => this.updateCollapse(a, true));
    this.moveNode(b.node, tileA.node.position, 0.24, 0, () => this.updateCollapse(b, true));
  }

  private collectEmptyTraySlots(start: number, maxCount: number): TraySlotState[] {
    const result: TraySlotState[] = [];
    const preferredStart = Math.max(0, start);

    for (let i = preferredStart; i < this.traySlots.length && result.length < maxCount; i++) {
      if (!this.traySlots[i].block) result.push(this.traySlots[i]);
    }
    for (let i = 0; i < preferredStart && result.length < maxCount; i++) {
      if (!this.traySlots[i].block) result.push(this.traySlots[i]);
    }
    return result;
  }

  private sortTrayBlocks() {
    const blocks = this.traySlots
      .map((slot) => slot.block)
      .filter((block): block is BlockState => !!block)
      .sort((a, b) => a.color - b.color || a.id - b.id);

    for (const slot of this.traySlots) slot.block = null;
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      const slot = this.traySlots[i];
      slot.block = block;
      block.slot = slot;
      block.node.setSiblingIndex(9999);
      this.moveNode(block.node, slot.node.position, 0.16);
    }
  }

  private getConnectedBlocks(row: number, col: number, color: number): BlockState[] {
    const result: BlockState[] = [];
    const visited = new Set<string>();
    const queue: Array<[number, number]> = [[row, col]];

    while (queue.length > 0) {
      const [r, c] = queue.shift();
      const key = `${r},${c}`;
      if (visited.has(key)) continue;
      visited.add(key);

      const tile = this.tiles[r]?.[c];
      const block = tile?.block;
      if (!block || block.collapsed || block.color !== color) continue;
      result.push(block);

      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr !== 0 || dc !== 0) queue.push([r + dr, c + dc]);
        }
      }
    }

    return result;
  }

  private getConnectedEmptyTiles(row: number, col: number, color: number): TileState[] {
    const result: TileState[] = [];
    const visited = new Set<string>();
    const queue: Array<[number, number]> = [[row, col]];

    while (queue.length > 0) {
      const [r, c] = queue.shift();
      const key = `${r},${c}`;
      if (visited.has(key)) continue;
      visited.add(key);

      const tile = this.tiles[r]?.[c];
      if (!tile || tile.block || tile.color !== color) continue;
      result.push(tile);

      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr !== 0 || dc !== 0) queue.push([r + dr, c + dc]);
        }
      }
    }

    return result;
  }

  private selectTrayRun(block: BlockState) {
    if (!block.slot) return;
    const blocks: BlockState[] = [block];
    for (let i = block.slot.index - 1; i >= 0; i--) {
      const b = this.traySlots[i].block;
      if (!b || b.color !== block.color) break;
      blocks.unshift(b);
    }
    for (let i = block.slot.index + 1; i < this.traySlots.length; i++) {
      const b = this.traySlots[i].block;
      if (!b || b.color !== block.color) break;
      blocks.push(b);
    }
    this.selectBlocks(blocks);
  }

  private selectBlocks(blocks: BlockState[]) {
    this.unselectAll();
    this.selectedBlocks = blocks;
    for (const block of blocks) {
      block.selected = true;
      block.node.setScale(
        block.location === "tray" ? new Vec3(0.72, 0.72, 1) : new Vec3(1.08, 1.08, 1),
      );
      if (block.selectedFx) block.selectedFx.node.active = true;
      block.node.setSiblingIndex(9999);
    }
  }

  private unselectAll() {
    for (const block of this.selectedBlocks) {
      block.selected = false;
      block.node.setScale(block.location === "tray" ? new Vec3(0.62, 0.62, 1) : Vec3.ONE);
      if (block.selectedFx) block.selectedFx.node.active = false;
    }
    this.selectedBlocks = [];
  }

  private updateCollapse(block: BlockState, animate: boolean) {
    const tile = block.location === "board" ? this.tiles[block.row]?.[block.col] : null;
    block.collapsed = !!tile && tile.color === block.color;
    block.normalSprite.node.active = !block.collapsed;
    block.collapsedSprite.node.active = block.collapsed;
    block.node.setScale(block.location === "tray" ? new Vec3(0.62, 0.62, 1) : Vec3.ONE);

    if (block.collapsed && animate) {
      tween(block.node)
        .to(0.08, { scale: new Vec3(1.16, 1.16, 1) })
        .to(0.1, { scale: Vec3.ONE })
        .start();
    }
  }

  private onMagicClicked() {
    this.showRewardAdThenRun(() => {
      const targets = this.selectedBlocks.length
        ? [...this.selectedBlocks]
        : this.blocks.filter((b) => !b.collapsed).slice(0, 6);
      this.unselectAll();
      this.collapseBlocks(targets);
    });
  }

  private onBrushClicked() {
    this.showRewardAdThenRun(() => this.cleanTray());
  }

  private onMagnetClicked() {
    this.showRewardAdThenRun(() => {
      const blocks = this.blocks.filter((b) => !b.collapsed).slice(0, 12);
      this.collapseBlocks(blocks);
    });
  }

  private showRewardAdThenRun(action: () => void) {
    if (this.inputLocked) return;
    // TODO: Call action() from the real rewarded-ad success callback.
    action();
  }

  private cleanTray() {
    const trayBlocks = this.traySlots
      .map((slot) => slot.block)
      .filter((block): block is BlockState => !!block);
    if (trayBlocks.length === 0) return;

    let moved = 0;
    for (const block of trayBlocks) {
      const tile = this.findEmptyTileForColor(block.color);
      if (!tile) continue;
      this.moveBlockToTile(block, tile, moved * 0.05);
      moved++;
    }
    this.unselectAll();
    this.scheduleOnce(() => this.checkWin(), 0.35 + moved * 0.05);
  }

  private collapseBlocks(blocks: BlockState[]) {
    if (blocks.length === 0) return;
    this.inputLocked = true;
    let operations = 0;

    for (const block of blocks) {
      if (!block || block.collapsed) continue;
      if (this.makeCollapse(block, operations * 0.05)) operations++;
    }

    this.unselectAll();
    this.scheduleOnce(() => {
      this.sortTrayBlocks();
      this.inputLocked = false;
      this.checkWin();
    }, 0.45 + operations * 0.05);
  }

  private makeCollapse(block: BlockState, delay = 0): boolean {
    const target = this.findBestTargetTile(block.color);
    if (!target) return false;

    if (!target.block) {
      this.moveBlockToTile(block, target, delay);
      return true;
    }

    const occupant = target.block;
    if (occupant === block) return false;

    if (block.location === "board") {
      this.swapBoardBlocks(block, occupant);
      return true;
    }

    const targetSlot = block.slot || this.traySlots.find((slot) => !slot.block);
    if (!targetSlot) return false;

    target.block = null;
    if (block.slot === targetSlot) {
      block.slot.block = null;
      block.slot = null;
    }
    occupant.location = "tray";
    occupant.row = -1;
    occupant.col = -1;
    occupant.slot = targetSlot;
    targetSlot.block = occupant;
    this.updateCollapse(occupant, false);
    occupant.node.setSiblingIndex(9999);
    this.moveNode(occupant.node, targetSlot.node.position, 0.22, delay);
    this.moveBlockToTile(block, target, delay);
    return true;
  }

  private findEmptyTileForColor(color: number): TileState | null {
    for (const row of this.tiles) {
      for (const tile of row) {
        if (!tile.block && tile.color === color) return tile;
      }
    }
    return null;
  }

  private findBestTargetTile(color: number): TileState | null {
    let occupied: TileState = null;
    for (const row of this.tiles) {
      for (const tile of row) {
        if (tile.color !== color) continue;
        if (!tile.block) return tile;
        if (!tile.block.collapsed) occupied = occupied || tile;
      }
    }
    return occupied;
  }

  private checkWin() {
    if (!this.levelData || this.blocks.length === 0) return;
    const complete = this.blocks.every(
      (block) => block.location === "board" && block.collapsed,
    );
    if (!complete) return;

    this.inputLocked = true;
    this.showMessage("Complete!");
    this.scheduleOnce(() => {
      this.levelIndex++;
      sys.localStorage.setItem(STORAGE_LEVEL_KEY, String(this.levelIndex));
      this.messageLabel.node.active = false;
      this.loadLevel(this.levelIndex);
    }, 1.1);
  }

  private getTilePosition(row: number, col: number): Vec3 {
    return new Vec3(
      this.boardOrigin.x + col * this.cellStep,
      this.boardOrigin.y - row * this.cellStep,
      0,
    );
  }

  private findTileAtTouch(event: EventTouch): TileState | null {
    if (!this.tileRoot) return null;

    const location = event.getUILocation();
    const local = this.tileRoot
      .getComponent(UITransform)
      .convertToNodeSpaceAR(new Vec3(location.x, location.y, 0));
    const half = this.cellSize * 0.5;

    for (const row of this.tiles) {
      for (const tile of row) {
        if (!tile || tile.color <= 0) continue;
        const pos = tile.node.position;
        if (
          Math.abs(local.x - pos.x) <= half &&
          Math.abs(local.y - pos.y) <= half
        ) {
          return tile;
        }
      }
    }

    return null;
  }

  private moveNode(
    node: Node,
    position: Vec3,
    duration: number,
    delay = 0,
    onComplete?: () => void,
  ) {
    tween(node)
      .delay(delay)
      .to(duration, { position: position.clone() }, { easing: "quadOut" })
      .call(() => onComplete?.())
      .start();
  }

  private showMessage(text: string) {
    this.messageLabel.string = text;
    this.messageLabel.node.active = true;
  }

  private clearBoard() {
    this.tileRoot?.destroyAllChildren();
    this.blockRoot?.destroyAllChildren();
    this.trayRoot?.destroyAllChildren();
    this.tiles = [];
    this.blocks = [];
    this.traySlots = [];
    this.selectedBlocks = [];
    this.blockIdSeed = 0;
  }

  private createNode(name: string, parent: Node, width: number, height: number): Node {
    const node = new Node(name);
    parent.addChild(node);
    const transform = node.addComponent(UITransform);
    transform.setContentSize(width, height);
    return node;
  }

  private createSpriteNode(
    name: string,
    parent: Node,
    frame: SpriteFrame | null,
    width: number,
    height: number,
  ): Node {
    const node = this.createNode(name, parent, width, height);
    const sprite = node.addComponent(Sprite);
    sprite.spriteFrame = frame;
    if (!frame) sprite.color = new Color(255, 255, 255, 60);
    return node;
  }

  private createTileNode(color: number, row: number, col: number): Node {
    const node = this.createPrefabOrNode(
      this.tilePrefab,
      `Tile_${row}_${col}`,
      this.tileRoot,
      this.cellSize * 0.96,
      this.cellSize * 0.96,
    );
    const view = this.findDeepChild(node, "View") || node;
    this.applySprite(
      view,
      this.tileFrames.get(color),
      this.cellSize * 0.96,
      this.cellSize * 0.96,
      new Color(255, 255, 255, 60),
    );
    return node;
  }

  private createEmptyBlockNode(row: number, col: number): Node {
    return this.createPrefabOrNode(
      this.emptyBlockPrefab,
      `EmptyBlock_${row}_${col}`,
      this.tileRoot,
      this.cellSize * 0.96,
      this.cellSize * 0.96,
    );
  }

  private createTraySlotNode(index: number): Node {
    const size = this.trayCellSize;
    const node = this.createPrefabOrNode(
      this.traySlotPrefab,
      `TraySlot_${index}`,
      this.trayRoot,
      size,
      size,
    );
    const view = this.findDeepChild(node, "View") || node;
    this.applySprite(
      view,
      this.traySlotFrame,
      size,
      size,
      new Color(255, 255, 255, 95),
    );
    return node;
  }

  private createPrefabOrNode(
    prefab: Prefab | null,
    name: string,
    parent: Node,
    width: number,
    height: number,
  ): Node {
    const node = prefab ? instantiate(prefab) : new Node(name);
    node.name = name;
    parent.addChild(node);
    node.setScale(Vec3.ONE);
    let transform = node.getComponent(UITransform);
    if (!transform) transform = node.addComponent(UITransform);
    transform.setContentSize(width, height);
    return node;
  }

  private ensureSpriteChild(
    parent: Node,
    name: string,
    frame: SpriteFrame | null,
    width: number,
    height: number,
    aliases: string[] = [],
  ): Node {
    let node = parent.getChildByName(name);
    if (!node) {
      for (const alias of aliases) {
        node = this.findDeepChild(parent, alias);
        if (node) break;
      }
    }
    if (!node) {
      node = this.createNode(name, parent, width, height);
    }
    this.applySprite(node, frame, width, height, new Color(255, 255, 255, 60));
    return node;
  }

  private ensureChildNode(parent: Node, name: string): Node {
    let node = parent.getChildByName(name);
    if (!node) {
      node = this.createNode(name, parent, this.cellSize, this.cellSize);
    }
    return node;
  }

  private applySprite(
    node: Node,
    frame: SpriteFrame | null,
    width: number,
    height: number,
    fallbackColor: Color,
  ) {
    let transform = node.getComponent(UITransform);
    if (!transform) transform = node.addComponent(UITransform);
    transform.setContentSize(width, height);

    let sprite = node.getComponent(Sprite);
    if (!sprite) sprite = node.addComponent(Sprite);
    sprite.spriteFrame = frame;
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.color = frame ? Color.WHITE : fallbackColor;
  }

  private findDeepChild(parent: Node, name: string): Node | null {
    for (const child of parent.children) {
      if (child.name === name) return child;
      const found = this.findDeepChild(child, name);
      if (found) return found;
    }
    return null;
  }

  private createLabel(name: string, parent: Node, text: string, size: number): Label {
    const node = this.createNode(name, parent, 260, size + 18);
    const label = node.addComponent(Label);
    label.string = text;
    label.fontSize = size;
    label.lineHeight = size + 6;
    label.color = Color.WHITE;
    label.horizontalAlign = HorizontalTextAlignment.CENTER;
    label.verticalAlign = VerticalTextAlignment.CENTER;
    return label;
  }
}
