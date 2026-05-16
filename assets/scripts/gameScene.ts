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
import { ToolId, ToolInventory } from "./ToolInventory";

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
const DESIGN_WIDTH = 750;
const DESIGN_HEIGHT = 1334;
const CONNECTED_DIRECTIONS: Array<[number, number]> = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
];

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
  @property(Button)
  public magicBtn: Button = null;
  @property(Button)
  public clearBtn: Button = null;
  @property(Button)
  public magnetBtn: Button = null;

  @property
  public magicAreaRows = 3;

  @property
  public magicAreaCols = 3;

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

  private readonly maxCellSize = 54;
  private readonly boardMaxWidth = 360;
  private readonly boardMaxHeight = 430;
  private readonly boardCellGap = 0;
  private readonly boardTileOverlap = 2;
  private readonly boardBlockIconScale = 0.78;
  private readonly selectedBoardLift = 12;
  private readonly selectedBoardScale = 1.06;
  private readonly selectedTrayLift = 10;
  private readonly boardCenterY = 125;
  private cellSize = 54;
  private cellStep = 54;
  private boardOrigin = new Vec3();
  private readonly traySlotSize = 38;
  private readonly traySlotGap = 0;
  private readonly trayY = -285;
  private magicUses = 0;
  private magicSelecting = false;
  private magicAreaNode: Node = null;
  private magicAreaCenter = { row: 0, col: 0 };
  private magicAreaDragOffset = new Vec3();
  private magicAreaDragStart = new Vec3();
  private magicAreaDidDrag = false;
  private magicAreaStartCenter: { row: number; col: number } | null = null;
  private inputLocked = false;
  private blockIdSeed = 0;

  private tileFrames = new Map<number, SpriteFrame>();
  private blockFrames = new Map<number, SpriteFrame>();
  private collapsedFrames = new Map<number, SpriteFrame>();
  private selectFrame: SpriteFrame = null;
  private traySlotFrame: SpriteFrame = null;
  private wandSelectionFrame: SpriteFrame = null;

  protected async start() {
    await this.prepareScene();
    await this.loadAssets();
    this.levelIndex = Math.max(1, Number(sys.localStorage.getItem(STORAGE_LEVEL_KEY) || this.startLevel));
    await this.loadLevel(this.levelIndex);
  }

  private async prepareScene() {
    this.root = this.createNode("GameRoot", this.node, DESIGN_WIDTH, DESIGN_HEIGHT);
    this.boardRoot = this.createNode("BoardRoot", this.root, DESIGN_WIDTH, 760);
    this.tileRoot = this.createNode("TileRoot", this.boardRoot, DESIGN_WIDTH, 760);
    this.trayRoot = this.node.getChildByName("trayBG") || this.createNode("TrayRoot", this.root, DESIGN_WIDTH, 120);
    if (this.trayRoot.parent === this.root) {
      this.trayRoot.setPosition(0, this.trayY);
    }
    this.blockRoot = this.createNode("BlockRoot", this.root, DESIGN_WIDTH, DESIGN_HEIGHT);
    this.hudRoot = this.createNode("HudRoot", this.root, DESIGN_WIDTH, DESIGN_HEIGHT);

    this.levelLabel = this.createLabel("LevelLabel", this.hudRoot, "", 36);
    this.levelLabel.node.setPosition(0, 575);

    this.messageLabel = this.createLabel("MessageLabel", this.hudRoot, "", 42);
    this.messageLabel.node.setPosition(0, 0);
    this.messageLabel.node.active = false;

    this.node.on(Node.EventType.TOUCH_END, this.onSceneTouchEnd, this);
    if (this.magicBtn || this.clearBtn || this.magnetBtn) {
      this.bindToolButtons();
    } else {
      this.bindBoosterButtons();
    }
  }

  private bindToolButtons() {
    this.magicBtn?.node.on("click", this.onMagicClicked, this);
    this.clearBtn?.node.on("click", this.onBrushClicked, this);
    this.magnetBtn?.node.on("click", this.onMagnetClicked, this);
  }

  private bindBoosterButtons() {
    const bottom = this.node.getChildByName("bottom");
    const buttons = bottom ? bottom.children.filter((child) => child.getComponent(Button)) : [];

    const binds = [() => this.onMagicClicked(), () => this.onBrushClicked(), () => this.onMagnetClicked()];
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

    const select = await this.tryLoadSprite("texture/Tiles/Tiles/gem_select_fx");
    this.selectFrame = select;
    this.traySlotFrame = await this.tryLoadSprite("texture/Trays/TraySlot");
    this.wandSelectionFrame = await this.tryLoadSprite("Images/WandSelectionFrame");

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
        return await ResourceManager.ins.loadBundleAsset("res", candidate, SpriteFrame);
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
      const asset = await ResourceManager.ins.loadBundleAsset("res", `Levels/Level${levelIndex}_Complete`, TextAsset);
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
      .map((line) => line.split(/\s+/).map((part) => Math.max(0, Math.min(19, Number(part) || 0))));
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
    this.cellSize = Math.min(
      this.maxCellSize,
      (this.boardMaxWidth - (cols - 1) * this.boardCellGap) / cols,
      (this.boardMaxHeight - (rows - 1) * this.boardCellGap) / rows,
    );
    this.cellStep = this.cellSize + this.boardCellGap;

    const width = (cols - 1) * this.cellStep;
    const height = (rows - 1) * this.cellStep;
    this.boardOrigin.set(-width / 2, this.boardCenterY + height / 2, 0);

    this.tiles = [];
    for (let r = 0; r < rows; r++) {
      this.tiles[r] = [];
      for (let c = 0; c < cols; c++) {
        const color = this.levelData.complete[r][c];
        const pos = this.getTilePosition(r, c);
        const tileNode = color > 0 ? this.createTileNode(color, r, c) : this.createEmptyBlockNode(r, c);
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
    const step = this.traySlotSize + this.traySlotGap;
    const startX = -((MAX_TRAY_SLOTS - 1) * step) / 2;
    const y = 0;
    this.traySlots = [];

    for (let i = 0; i < MAX_TRAY_SLOTS; i++) {
      const node = this.createTraySlotNode(i);
      node.setPosition(startX + i * step, y);

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
      this.getBoardBlockIconSize(),
      this.getBoardBlockIconSize(),
      ["IconView"],
    ).getComponent(Sprite);

    const collapsed = this.ensureSpriteChild(
      visualRoot,
      "Collapsed",
      this.collapsedFrames.get(color) || this.blockFrames.get(color),
      this.getBoardBlockIconSize(),
      this.getBoardBlockIconSize(),
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

    if (this.magicSelecting) {
      return;
    }

    if (block.selected) {
      this.unselectAll();
      return;
    }

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
    if (this.magicSelecting) {
      return;
    }
    if (tile.block || this.selectedBlocks.length === 0) return;

    const matchingBlocks = this.selectedBlocks.filter((b) => b.color === tile.color);
    if (matchingBlocks.length === 0) return;

    const targets = this.getConnectedEmptyTiles(tile.row, tile.col, tile.color);
    const count = Math.min(targets.length, matchingBlocks.length);
    if (count <= 0) return;

    this.inputLocked = true;
    const movingBlocks = new Set<BlockState>();
    for (let i = 0; i < count; i++) {
      movingBlocks.add(matchingBlocks[i]);
      this.moveBlockToTile(matchingBlocks[i], targets[i], i * 0.04);
    }
    this.unselectAfterMove(movingBlocks);
    this.scheduleOnce(
      () => {
        this.inputLocked = false;
        this.checkWin();
      },
      0.35 + count * 0.04,
    );
  }

  private moveBoardBlocksToTray(blocks: BlockState[], startSlotIndex: number) {
    const slots = this.collectEmptyTraySlots(startSlotIndex, blocks.length);
    if (slots.length === 0) {
      this.showMessage("Tray Full");
      return;
    }

    const count = Math.min(blocks.length, slots.length);
    this.inputLocked = true;
    const movingBlocks = new Set<BlockState>();
    for (let i = 0; i < count; i++) {
      const block = blocks[i];
      const slot = slots[i];
      movingBlocks.add(block);
      const tile = this.tiles[block.row]?.[block.col];
      if (tile?.block === block) tile.block = null;

      block.location = "tray";
      block.row = -1;
      block.col = -1;
      block.slot = slot;
      slot.block = block;
      this.updateCollapse(block, false);
      block.node.setSiblingIndex(9999);
      this.moveNode(block.node, this.getNodePositionInBlockRoot(slot.node), 0.22, i * 0.04);
    }

    this.unselectAfterMove(movingBlocks);
    this.scheduleOnce(
      () => {
        this.inputLocked = false;
      },
      0.32 + count * 0.04,
    );
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
    this.moveNode(block.node, this.getNodePositionInBlockRoot(tile.node), 0.24, delay, () => {
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

    this.moveNode(a.node, this.getNodePositionInBlockRoot(tileB.node), 0.24, 0, () => this.updateCollapse(a, true));
    this.moveNode(b.node, this.getNodePositionInBlockRoot(tileA.node), 0.24, 0, () => this.updateCollapse(b, true));
  }

  private collectEmptyTraySlots(_start: number, maxCount: number): TraySlotState[] {
    const result: TraySlotState[] = [];

    for (let i = 0; i < this.traySlots.length && result.length < maxCount; i++) {
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
      this.moveNode(block.node, this.getNodePositionInBlockRoot(slot.node), 0.16);
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

      const block = this.getSelectableBlock(r, c, color);
      if (!block) continue;
      result.push(block);

      for (const [dr, dc] of CONNECTED_DIRECTIONS) {
        queue.push([r + dr, c + dc]);
      }
    }

    return result;
  }

  private getSelectableBlock(row: number, col: number, color: number): BlockState | null {
    const block = this.tiles[row]?.[col]?.block;
    if (!block || block.collapsed || block.color !== color) return null;
    return block;
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

      for (const [dr, dc] of CONNECTED_DIRECTIONS) {
        queue.push([r + dr, c + dc]);
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
      block.node.setScale(block.location === "tray" ? this.getTrayBlockScale(true) : this.getSelectedBoardScale());
      if (block.location === "board") {
        block.node.setPosition(this.getRaisedBoardBlockPosition(block));
      } else if (block.location === "tray" && block.slot) {
        block.node.setPosition(this.getRaisedTrayBlockPosition(block.slot));
      }
      if (block.selectedFx) block.selectedFx.node.active = false;
      block.node.setSiblingIndex(9999);
    }
  }

  private unselectAll(resetPosition = true) {
    for (const block of this.selectedBlocks) {
      block.selected = false;
      block.node.setScale(block.location === "tray" ? this.getTrayBlockScale(false) : Vec3.ONE);
      if (!resetPosition) {
        if (block.selectedFx) block.selectedFx.node.active = false;
        continue;
      }
      this.resetBlockPosition(block);
      if (block.selectedFx) block.selectedFx.node.active = false;
    }
    this.selectedBlocks = [];
  }

  private unselectAfterMove(movingBlocks: Set<BlockState>) {
    for (const block of this.selectedBlocks) {
      block.selected = false;
      block.node.setScale(block.location === "tray" ? this.getTrayBlockScale(false) : Vec3.ONE);
      if (!movingBlocks.has(block)) {
        this.resetBlockPosition(block);
      }
      if (block.selectedFx) block.selectedFx.node.active = false;
    }
    this.selectedBlocks = [];
  }

  private resetBlockPosition(block: BlockState) {
    if (block.location === "board") {
      block.node.setPosition(this.getTilePosition(block.row, block.col));
    } else if (block.location === "tray" && block.slot) {
      block.node.setPosition(this.getNodePositionInBlockRoot(block.slot.node));
    }
  }

  private updateCollapse(block: BlockState, animate: boolean) {
    const tile = block.location === "board" ? this.tiles[block.row]?.[block.col] : null;
    block.collapsed = !!tile && tile.color === block.color;
    block.normalSprite.node.active = !block.collapsed;
    block.collapsedSprite.node.active = block.collapsed;
    block.node.setScale(block.location === "tray" ? this.getTrayBlockScale(false) : Vec3.ONE);

    if (block.collapsed && animate) {
      tween(block.node)
        .to(0.08, { scale: new Vec3(1.16, 1.16, 1) })
        .to(0.1, { scale: Vec3.ONE })
        .start();
    }
  }

  private onMagicClicked() {
    if (this.inputLocked) return;
    this.prepareTool("magic", () => {
      this.magicUses = ToolInventory.getCount("magic");
      this.enterMagicSelectMode();
    });
  }

  private onBrushClicked() {
    this.prepareTool("brush", () => {
      if (this.cleanTray()) ToolInventory.consume("brush");
    });
  }

  private onMagnetClicked() {
    this.prepareTool("magnet", () => {
      const blocks = this.blocks.filter((b) => !b.collapsed).slice(0, 12);
      if (this.collapseBlocks(blocks)) ToolInventory.consume("magnet");
    });
  }

  private prepareTool(tool: ToolId, onReady: () => void) {
    if (this.inputLocked) return;
    if (ToolInventory.has(tool)) {
      onReady();
      return;
    }

    this.showRewardAdThenRun(() => {
      ToolInventory.add(tool);
      onReady();
    });
  }

  private showRewardAdThenRun(action: () => void) {
    if (this.inputLocked) return;
    // TODO: Call action() from the real rewarded-ad success callback.
    action();
  }

  private enterMagicSelectMode() {
    this.unselectAll();
    this.magicUses = ToolInventory.getCount("magic");
    this.magicSelecting = this.magicUses > 0;
    if (!this.magicSelecting) return;
    this.showMessage("Drag Area");
    this.ensureMagicAreaNode();
    const center = this.getDefaultMagicAreaCenter();
    if (!center) return;
    this.magicAreaStartCenter = { row: center.row, col: center.col };
    this.moveMagicAreaTo(center.row, center.col);
    this.magicAreaNode.active = true;
  }

  private castMagicAt(row: number, col: number) {
    if (!this.magicSelecting || this.magicUses <= 0) return;

    const tiles = this.getMagicAreaTiles(row, col);
    if (tiles.length === 0) return;
    if (this.isMagicAreaAlreadySorted(tiles)) {
      this.resetMagicAreaToStart();
      return;
    }

    if (!this.sortMagicArea(tiles)) {
      this.resetMagicAreaToStart();
      return;
    }

    if (!ToolInventory.consume("magic")) {
      this.resetMagicAreaToStart();
      return;
    }

    this.magicSelecting = false;
    this.magicUses = ToolInventory.getCount("magic");
    this.messageLabel.node.active = false;
    if (this.magicAreaNode) this.magicAreaNode.active = false;
  }

  private getMagicAreaTiles(row: number, col: number): TileState[] {
    const tiles: TileState[] = [];
    const rows = this.getMagicAreaRows();
    const cols = this.getMagicAreaCols();
    const rowStart = row - Math.floor((rows - 1) / 2);
    const colStart = col - Math.floor((cols - 1) / 2);
    for (let r = rowStart; r < rowStart + rows; r++) {
      for (let c = colStart; c < colStart + cols; c++) {
        const tile = this.tiles[r]?.[c];
        if (tile && tile.color > 0) tiles.push(tile);
      }
    }
    return tiles;
  }

  private ensureMagicAreaNode() {
    if (this.magicAreaNode) {
      this.drawMagicAreaNode();
      return;
    }

    this.magicAreaNode = this.createNode("MagicArea", this.getMagicAreaParent(), 1, 1);
    this.magicAreaNode.addComponent(Sprite);
    this.magicAreaNode.on(Node.EventType.TOUCH_START, this.onMagicAreaTouchStart, this);
    this.magicAreaNode.on(Node.EventType.TOUCH_MOVE, this.onMagicAreaTouchMove, this);
    this.magicAreaNode.on(Node.EventType.TOUCH_END, this.onMagicAreaTouchEnd, this);
    this.magicAreaNode.on(Node.EventType.TOUCH_CANCEL, this.onMagicAreaTouchEnd, this);
    this.drawMagicAreaNode();
  }

  private drawMagicAreaNode() {
    if (!this.magicAreaNode) return;
    const width = this.getMagicAreaWidth();
    const height = this.getMagicAreaHeight();

    const sprite = this.magicAreaNode.getComponent(Sprite);
    sprite.enabled = true;
    sprite.spriteFrame = this.wandSelectionFrame;
    sprite.type = Sprite.Type.SLICED;
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.color = this.wandSelectionFrame ? Color.WHITE : new Color(255, 255, 255, 85);

    this.magicAreaNode.getComponent(UITransform).setContentSize(width, height);
  }

  private getMagicAreaWidth(): number {
    return this.getMagicAreaCols() * this.cellStep;
  }

  private getMagicAreaHeight(): number {
    return this.getMagicAreaRows() * this.cellStep;
  }

  private getMagicAreaRows(): number {
    return this.clampMagicAreaSize(this.magicAreaRows);
  }

  private getMagicAreaCols(): number {
    return this.clampMagicAreaSize(this.magicAreaCols);
  }

  private clampMagicAreaSize(value: number): number {
    return Math.min(3, Math.max(1, Math.floor(Number(value) || 3)));
  }

  private onMagicAreaTouchStart(event: EventTouch) {
    event.propagationStopped = true;
    if (!this.magicSelecting || !this.magicAreaNode) return;
    const local = this.getTouchPositionInMagicAreaParent(event);
    if (!local) return;
    const pos = this.magicAreaNode.position;
    this.magicAreaDragStart.set(pos);
    this.magicAreaDidDrag = false;
    this.magicAreaDragOffset.set(pos.x - local.x, pos.y - local.y, 0);
  }

  private onMagicAreaTouchMove(event: EventTouch) {
    event.propagationStopped = true;
    if (!this.magicSelecting || !this.magicAreaNode) return;
    const local = this.getTouchPositionInMagicAreaParent(event);
    if (!local) return;

    const target = new Vec3(local.x + this.magicAreaDragOffset.x, local.y + this.magicAreaDragOffset.y, 0);
    this.magicAreaNode.setPosition(this.clampMagicAreaPosition(target));
    this.magicAreaNode.setSiblingIndex(9999);
    const dx = this.magicAreaNode.position.x - this.magicAreaDragStart.x;
    const dy = this.magicAreaNode.position.y - this.magicAreaDragStart.y;
    if (dx * dx + dy * dy > 16) this.magicAreaDidDrag = true;
  }

  private onMagicAreaTouchEnd(event: EventTouch) {
    event.propagationStopped = true;
    if (!this.magicSelecting || !this.magicAreaNode) return;
    this.onMagicAreaTouchMove(event);
    if (!this.magicAreaDidDrag) return;

    const tile = this.findNearestTileAtPosition(this.getMagicAreaPositionInTileRoot());
    if (!tile) return;
    this.moveMagicAreaTo(tile.row, tile.col);
    this.castMagicAt(tile.row, tile.col);
  }

  private moveMagicAreaTo(row: number, col: number) {
    if (!this.magicAreaNode) return;
    this.magicAreaCenter = { row, col };
    const tile = this.tiles[row]?.[col];
    if (tile) {
      this.magicAreaNode.setPosition(this.getNodePositionInParent(tile.node, this.magicAreaNode.parent));
    } else {
      this.magicAreaNode.setPosition(this.getTilePosition(row, col));
    }
    this.magicAreaNode.setSiblingIndex(9999);
  }

  private getDefaultMagicAreaCenter(): TileState | null {
    for (const row of this.tiles) {
      for (const tile of row) {
        if (tile && tile.color > 0) return tile;
      }
    }
    return null;
  }

  private isMagicAreaAlreadySorted(tiles: TileState[]): boolean {
    return tiles.length > 0 && tiles.every((tile) => !!tile.block && tile.block.color === tile.color);
  }

  private resetMagicAreaToStart() {
    if (!this.magicAreaStartCenter) return;
    this.moveMagicAreaTo(this.magicAreaStartCenter.row, this.magicAreaStartCenter.col);
    this.magicAreaDidDrag = false;
    this.showMessage("Drag Area");
  }

  private sortMagicArea(tiles: TileState[]): boolean {
    const area = new Set(tiles);
    const candidates = tiles
      .map((tile) => tile.block)
      .filter((block): block is BlockState => !!block && block.location === "board");
    if (candidates.length === 0) return false;

    this.inputLocked = true;
    this.unselectAll();

    let operations = 0;
    for (const tile of tiles) {
      if (tile.block?.color === tile.color) {
        this.updateCollapse(tile.block, true);
        continue;
      }

      const match = candidates.find((block) => {
        if (block.color !== tile.color || block.collapsed) return false;
        const currentTile = this.tiles[block.row]?.[block.col];
        return currentTile && area.has(currentTile);
      });
      if (!match) continue;

      const fromTile = this.tiles[match.row]?.[match.col];
      if (!fromTile || !area.has(fromTile)) continue;

      const occupant = tile.block;
      fromTile.block = occupant;
      tile.block = match;

      match.row = tile.row;
      match.col = tile.col;
      match.location = "board";
      match.slot = null;
      this.updateCollapse(match, false);
      this.moveNode(match.node, this.getNodePositionInBlockRoot(tile.node), 0.22, operations * 0.04, () => {
        this.updateCollapse(match, true);
      });

      if (occupant) {
        occupant.row = fromTile.row;
        occupant.col = fromTile.col;
        occupant.location = "board";
        occupant.slot = null;
        this.updateCollapse(occupant, false);
        this.moveNode(occupant.node, this.getNodePositionInBlockRoot(fromTile.node), 0.22, operations * 0.04, () => {
          this.updateCollapse(occupant, true);
        });
      }
      operations++;
    }

    if (operations === 0) {
      this.inputLocked = false;
      return false;
    }

    this.scheduleOnce(
      () => {
        this.inputLocked = false;
        this.checkWin();
      },
      0.35 + operations * 0.04,
    );
    return true;
  }

  private cleanTray(): boolean {
    const trayBlocks = this.traySlots.map((slot) => slot.block).filter((block): block is BlockState => !!block);
    if (trayBlocks.length === 0) return false;

    let moved = 0;
    for (const block of trayBlocks) {
      const tile = this.findEmptyTileForColor(block.color);
      if (!tile) continue;
      this.moveBlockToTile(block, tile, moved * 0.05);
      moved++;
    }
    if (moved === 0) return false;

    this.unselectAll(false);
    this.scheduleOnce(() => this.checkWin(), 0.35 + moved * 0.05);
    return true;
  }

  private collapseBlocks(blocks: BlockState[]): boolean {
    if (blocks.length === 0) return false;
    this.inputLocked = true;
    let operations = 0;

    for (const block of blocks) {
      if (!block || block.collapsed) continue;
      if (this.makeCollapse(block, operations * 0.05)) operations++;
    }
    if (operations === 0) {
      this.inputLocked = false;
      return false;
    }

    this.unselectAll();
    this.scheduleOnce(
      () => {
        this.sortTrayBlocks();
        this.inputLocked = false;
        this.checkWin();
      },
      0.45 + operations * 0.05,
    );
    return true;
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
    this.moveNode(occupant.node, this.getNodePositionInBlockRoot(targetSlot.node), 0.22, delay);
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
    const complete = this.blocks.every((block) => block.location === "board" && block.collapsed);
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
    return new Vec3(this.boardOrigin.x + col * this.cellStep, this.boardOrigin.y - row * this.cellStep, 0);
  }

  private getNodePositionInBlockRoot(node: Node): Vec3 {
    return this.getNodePositionInParent(node, this.blockRoot);
  }

  private getNodePositionInParent(node: Node, parent: Node | null): Vec3 {
    const sourceTransform = node?.getComponent(UITransform);
    const parentTransform = parent?.getComponent(UITransform);
    if (!sourceTransform || !parentTransform) {
      return node.position.clone();
    }

    const worldPosition = sourceTransform.convertToWorldSpaceAR(Vec3.ZERO);
    return parentTransform.convertToNodeSpaceAR(worldPosition);
  }

  private getTouchPositionInTileRoot(event: EventTouch): Vec3 | null {
    if (!this.tileRoot) return null;
    const location = event.getUILocation();
    return this.tileRoot.getComponent(UITransform).convertToNodeSpaceAR(new Vec3(location.x, location.y, 0));
  }

  private getMagicAreaParent(): Node {
    return this.hudRoot || this.tileRoot || this.node;
  }

  private getTouchPositionInMagicAreaParent(event: EventTouch): Vec3 | null {
    const parent = this.magicAreaNode?.parent || this.getMagicAreaParent();
    const transform = parent?.getComponent(UITransform);
    if (!transform) return null;
    const location = event.getUILocation();
    return transform.convertToNodeSpaceAR(new Vec3(location.x, location.y, 0));
  }

  private getMagicAreaPositionInTileRoot(): Vec3 {
    if (!this.magicAreaNode || !this.tileRoot) return Vec3.ZERO.clone();
    const sourceTransform = this.magicAreaNode.getComponent(UITransform);
    const tileTransform = this.tileRoot.getComponent(UITransform);
    if (!sourceTransform || !tileTransform) return this.magicAreaNode.position.clone();

    const worldPosition = sourceTransform.convertToWorldSpaceAR(Vec3.ZERO);
    return tileTransform.convertToNodeSpaceAR(worldPosition);
  }

  private findNearestTileAtPosition(position: Readonly<Vec3>): TileState | null {
    let nearest: TileState | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const row of this.tiles) {
      for (const tile of row) {
        if (!tile || tile.color <= 0) continue;
        const dx = position.x - tile.node.position.x;
        const dy = position.y - tile.node.position.y;
        const distance = dx * dx + dy * dy;
        if (distance < nearestDistance) {
          nearest = tile;
          nearestDistance = distance;
        }
      }
    }

    return nearest;
  }

  private clampMagicAreaPosition(position: Vec3): Vec3 {
    const parent = this.magicAreaNode?.parent || this.getMagicAreaParent();
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (const row of this.tiles) {
      for (const tile of row) {
        if (!tile || tile.color <= 0) continue;
        const tilePosition = this.getNodePositionInParent(tile.node, parent);
        minX = Math.min(minX, tilePosition.x);
        maxX = Math.max(maxX, tilePosition.x);
        minY = Math.min(minY, tilePosition.y);
        maxY = Math.max(maxY, tilePosition.y);
      }
    }

    if (!Number.isFinite(minX)) return position;
    position.x = Math.min(maxX, Math.max(minX, position.x));
    position.y = Math.min(maxY, Math.max(minY, position.y));
    return position;
  }

  private findTileAtTouch(event: EventTouch): TileState | null {
    if (!this.tileRoot) return null;

    const local = this.getTouchPositionInTileRoot(event);
    if (!local) return null;
    const half = this.cellSize * 0.5;

    for (const row of this.tiles) {
      for (const tile of row) {
        if (!tile || tile.color <= 0) continue;
        const pos = tile.node.position;
        if (Math.abs(local.x - pos.x) <= half && Math.abs(local.y - pos.y) <= half) {
          return tile;
        }
      }
    }

    return null;
  }

  private findNearestTileAtTouch(event: EventTouch): TileState | null {
    const local = this.getTouchPositionInTileRoot(event);
    return local ? this.findNearestTileAtPosition(local) : null;
  }

  private moveNode(node: Node, position: Vec3, duration: number, delay = 0, onComplete?: () => void) {
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
    this.magicSelecting = false;
    if (this.magicAreaNode?.isValid) this.magicAreaNode.destroy();
    this.magicAreaNode = null;
    this.magicAreaStartCenter = null;
    this.tileRoot?.destroyAllChildren();
    this.blockRoot?.destroyAllChildren();
    this.clearTraySlots();
    this.tiles = [];
    this.blocks = [];
    this.traySlots = [];
    this.selectedBlocks = [];
    this.blockIdSeed = 0;
  }

  private clearTraySlots() {
    if (!this.trayRoot) return;
    for (const child of [...this.trayRoot.children]) {
      if (child.name.startsWith("TraySlot_")) child.destroy();
    }
  }

  private createNode(name: string, parent: Node, width: number, height: number): Node {
    const node = new Node(name);
    parent.addChild(node);
    const transform = node.addComponent(UITransform);
    transform.setContentSize(width, height);
    return node;
  }

  private createSpriteNode(name: string, parent: Node, frame: SpriteFrame | null, width: number, height: number): Node {
    const node = this.createNode(name, parent, width, height);
    const sprite = node.addComponent(Sprite);
    sprite.spriteFrame = frame;
    if (!frame) sprite.color = new Color(255, 255, 255, 60);
    return node;
  }

  private createTileNode(color: number, row: number, col: number): Node {
    const size = this.getBoardTileSize();
    const node = this.createPrefabOrNode(this.tilePrefab, `Tile_${row}_${col}`, this.tileRoot, size, size);
    const view = this.findDeepChild(node, "View") || node;
    this.applySprite(view, this.tileFrames.get(color), size, size, new Color(255, 255, 255, 60));
    return node;
  }

  private createEmptyBlockNode(row: number, col: number): Node {
    const size = this.getBoardTileSize();
    return this.createPrefabOrNode(this.emptyBlockPrefab, `EmptyBlock_${row}_${col}`, this.tileRoot, size, size);
  }

  private createTraySlotNode(index: number): Node {
    const size = this.traySlotSize;
    const node = this.createPrefabOrNode(this.traySlotPrefab, `TraySlot_${index}`, this.trayRoot, size, size);
    const view = this.findDeepChild(node, "View") || node;
    this.applySprite(view, this.traySlotFrame, size, size, new Color(255, 255, 255, 95));
    return node;
  }

  private getTrayBlockScale(selected: boolean): Vec3 {
    const scale = (this.traySlotSize / this.cellSize) * (selected ? 1.12 : 1);
    return new Vec3(scale, scale, 1);
  }

  private getSelectedBoardScale(): Vec3 {
    return new Vec3(this.selectedBoardScale, this.selectedBoardScale, 1);
  }

  private getRaisedBoardBlockPosition(block: BlockState): Vec3 {
    const pos = this.getTilePosition(block.row, block.col);
    pos.y += this.selectedBoardLift;
    return pos;
  }

  private getRaisedTrayBlockPosition(slot: TraySlotState): Vec3 {
    const pos = this.getNodePositionInBlockRoot(slot.node);
    pos.y += this.selectedTrayLift;
    return pos;
  }

  private getBoardTileSize(): number {
    return this.cellSize + this.boardTileOverlap;
  }

  private getBoardBlockIconSize(): number {
    return this.cellSize * this.boardBlockIconScale;
  }

  private createPrefabOrNode(prefab: Prefab | null, name: string, parent: Node, width: number, height: number): Node {
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

  private applySprite(node: Node, frame: SpriteFrame | null, width: number, height: number, fallbackColor: Color) {
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
