import {
  _decorator,
  Button,
  BlockInputEvents,
  Color,
  Component,
  director,
  Director,
  EffectAsset,
  EventTouch,
  game,
  Game,
  Graphics,
  Label,
  LabelOutline,
  Material,
  Node,
  ParticleSystem2D,
  Prefab,
  Sprite,
  SpriteFrame,
  sys,
  TextAsset,
  instantiate,
  tween,
  Tween,
  UIOpacity,
  UITransform,
  Widget,
  Vec2,
  Vec3,
  Vec4,
  HorizontalTextAlignment,
  VerticalTextAlignment,
} from "cc";
import { ResourceManager } from "./framework/ResourceManager";
import TipsManager from "./framework/TipsManager";
import { ToolId, ToolInventory } from "./ToolInventory";
import { mapControl } from "./mapControl";
import UIManager, { UILayer } from "./framework/ui/UIManager";
import AudioManager from "./framework/AudioManager";
import { soundName, uiName } from "./gamePrefabMgr";
import PlayData from "./data/PlayData";
import { calculateLevelTiming } from "./data/LevelDifficulty";
import { TutorialProgress } from "./data/TutorialProgress";
import { GuideOverlay } from "./ui/GuideOverlay";
import { GameSceneBundle, GameSceneName } from "./framework/GameSceneBundle";
import {
  FeedAcquisitionService,
  FeedAcquisitionState,
} from "./framework/Platform/FeedAcquisitionService";
import { resolveFeedRevisitChallengeLevel } from "./framework/Platform/FeedRevisitConfig";
import { FeedRevisitService } from "./framework/Platform/FeedRevisitService";
import { SdkUtils } from "./framework/Platform/sdk/SdkUtils";

const { ccclass, property } = _decorator;

type Matrix = number[][];
type BlockLocation = "board" | "tray";
type CountdownWarningState = "stopped" | "paused" | "playing";
type TutorialStep =
  | "none"
  | "core_select_first"
  | "core_store_first"
  | "core_select_second"
  | "core_place_second"
  | "core_select_tray"
  | "core_place_last"
  | "tray_expand"
  | "magic_button"
  | "magic_drag"
  | "brush_button"
  | "magnet_button";

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

interface CachedGameAssets {
  tilePrefab: Prefab | null;
  blockPrefab: Prefab | null;
  emptyBlockPrefab: Prefab | null;
  traySlotPrefab: Prefab | null;
  selectFrame: SpriteFrame | null;
  traySlotFrame: SpriteFrame | null;
  boardBaseFrame: SpriteFrame | null;
  wandSelectionFrame: SpriteFrame | null;
  glowEffect: EffectAsset | null;
  sparkleFrame: SpriteFrame | null;
  lockFrame: SpriteFrame | null;
  tileFrames: Map<number, SpriteFrame>;
  blockFrames: Map<number, SpriteFrame>;
  collapsedFrames: Map<number, SpriteFrame>;
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
const STORAGE_LEVEL_SEQUENCE_KEY = "gem_sort_level_sequence_v2";
const TRAY_COLS = 12;
const MAX_TRAY_ROWS = 3;
const MAX_TRAY_SLOTS = TRAY_COLS * MAX_TRAY_ROWS;
const MAGNET_SORT_COUNT = 12;
const COUNTDOWN_WARNING_SECONDS = 30;
const COUNTDOWN_BREATH_SCALE = 1.1;
const COUNTDOWN_BREATH_HALF_CYCLE = 0.48;
const DESIGN_WIDTH = 750;
const DESIGN_HEIGHT = 1334;
const LAST_STANDARD_LEVEL = 222;
const REPLAY_START_LEVEL = 10;
const FEED_ACQUISITION_LEVEL = 1;
const FEED_ACQUISITION_SECONDS = 60;
const FEED_ACQUISITION_REVIVE_SECONDS = 45;
const FEED_EXTERNAL_UI_DELAY_MS = 5000;
const GUIDE_ROOT_NAME = "__GemBeginnerGuide";
const GUIDE_REWARD_NAME = "__GemToolUnlockReward";
const GUIDE_PROXY_NAME = "__GemGuideTargetProxy";
const TOOL_UNLOCK_REWARD_AMOUNT = 1;
const TOOL_UNLOCK_LEVELS: Record<ToolId, number> = {
  magic: 3,
  brush: 5,
  magnet: 7,
};
const TOOL_DISPLAY_NAMES: Record<ToolId, string> = {
  magic: "魔法棒",
  brush: "扫把",
  magnet: "磁铁",
};
const TOOL_REWARD_DESCRIPTIONS: Record<ToolId, string> = {
  magic: "拖动魔法区域，自动整理选中的 3×3 宝石",
  brush: "自动把托盘里的宝石放回对应颜色的位置",
  magnet: "自动整理棋盘中的 12 颗宝石",
};
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
  private static assetsLoadPromise: Promise<CachedGameAssets> | null = null;
  private static levelDataCache = new Map<number, LevelData>();

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
  public settingBtn: Button = null;

  @property(Button)
  public magicBtn: Button = null;
  @property(Button)
  public clearBtn: Button = null;
  @property(Button)
  public magnetBtn: Button = null;
  @property(mapControl)
  public mapControl: mapControl = null;

  @property(Button)
  public addTrayBtn: Button = null; //添加tray槽

  @property(Label)
  public levelLabel: Label = null;

  @property(Label)
  public timerLabel: Label = null;

  @property(Label)
  public messageLabel: Label = null;

  @property
  public magicAreaRows = 3;

  @property
  public magicAreaCols = 3;

  @property
  public selectedGlowStrength = 0.36;

  @property
  public sortedGlowStrength = 0.22;

  @property
  public glowRadius = 0.012;

  @property
  public glowPulseSpeed = 6;

  @property
  public correctSparkleCount = 10;

  @property({
    tooltip: "动态难度计算失败时使用的默认关卡时间，单位为秒。",
  })
  public levelTimeSeconds = 300;

  @property({
    tooltip: "观看激励视频复活后最多增加的时间，单位为秒。",
  })
  public reviveBonusSeconds = 180;

  private root: Node = null;
  private boardRoot: Node = null;
  private boardBaseRoot: Node = null;
  private tileRoot: Node = null;
  private blockRoot: Node = null;
  private trayBgRoot: Node = null;
  private trayRoot: Node = null;
  private hudRoot: Node = null;
  private timerNormalColor = Color.WHITE.clone();

  private levelIndex = 1;
  private levelData: LevelData = null;
  private tiles: TileState[][] = [];
  private blocks: BlockState[] = [];
  private traySlots: TraySlotState[] = [];
  private selectedBlocks: BlockState[] = [];

  private readonly maxCellSize = 54;
  private readonly boardMaxWidth = 650;
  private readonly boardMaxHeight = 620;
  private readonly boardCellGap = 0;
  private readonly boardTileOverlap = 2;
  private readonly boardBasePadding = 7;
  private readonly boardBlockIconScale = 0.78;
  private readonly selectedBoardLift = 12;
  private readonly selectedBoardScale = 1.06;
  private readonly selectedTrayLift = 10;
  private readonly boardCenterY = 125;
  private cellSize = 54;
  private cellStep = 54;
  private boardOrigin = new Vec3();
  private readonly trayMaxWidth = 650;
  private traySlotSize = 38;
  private readonly traySlotGap = 0;
  private readonly trayRowGap = 4;
  private readonly trayBgPaddingX = 30;
  private readonly trayBgPaddingY = 62;
  private readonly trayAddButtonGap = 22;
  private activeTrayRows = 1;
  private magicUses = 0;
  private magicSelecting = false;
  private magicAreaNode: Node = null;
  private magicAreaCenter = { row: 0, col: 0 };
  private magicAreaDragOffset = new Vec3();
  private magicAreaDragStart = new Vec3();
  private magicAreaDidDrag = false;
  private magicAreaStartCenter: { row: number; col: number } | null = null;
  private inputLocked = false;
  private settingsOpen = false;
  private inputLockedBeforeSettings = false;
  private timerRunningBeforeSettings = false;
  private remainingTime = 0;
  private currentLevelTimeSeconds = 300;
  private currentReviveBonusSeconds = 90;
  private timerRunning = false;
  private lastDisplayedSecond = -1;
  private countdownWarningState: CountdownWarningState = "stopped";
  private timerLabelBaseScale = Vec3.ONE.clone();
  private appHidden = false;
  private adPaused = false;
  private blockIdSeed = 0;
  private feedMode = false;
  private feedAcquisition = false;
  private feedRevisitChallenge = false;
  private feedSceneReady = false;
  private feedHasStarted = false;
  private feedGuideShown = false;
  private feedEnteredAtMs = 0;
  private feedPauseApplied = false;
  private inputLockedBeforeFeedPause = false;
  private timerRunningBeforeFeedPause = false;
  private levelCompletionHandled = false;
  private feedChallengeRewardGranted = false;
  private feedChallengeRewardTool: ToolId | null = null;

  private tutorialStep: TutorialStep = "none";
  private tutorialPaused = false;
  private tutorialTransitioning = false;
  /** 本关仍有尚未触发/完成的教学时，允许操作但不显示也不推进倒计时。 */
  private tutorialTimerGateActive = false;
  private tutorialTargetProxy: Node | null = null;
  private tutorialFirstColor = 0;
  private tutorialSecondColor = 0;
  private tutorialFirstBlockIds = new Set<number>();
  private tutorialSecondBlockIds = new Set<number>();
  private tutorialMagicTarget: { row: number; col: number } | null = null;
  private tutorialVisualToken = 0;
  private tutorialMapInputState: {
    pinch: boolean;
    wheel: boolean;
    drag: boolean;
  } | null = null;
  private pendingToolRewardAnimations = new Set<ToolId>();

  private tileFrames = new Map<number, SpriteFrame>();
  private blockFrames = new Map<number, SpriteFrame>();
  private collapsedFrames = new Map<number, SpriteFrame>();
  private selectFrame: SpriteFrame = null;
  private traySlotFrame: SpriteFrame = null;
  private boardBaseFrame: SpriteFrame = null;
  private wandSelectionFrame: SpriteFrame = null;
  private sparkleFrame: SpriteFrame = null;
  private lockFrame: SpriteFrame = null;
  private glowEffect: EffectAsset = null;
  private glowMaterials = new Map<number, Material>();
  private glowFlashTokens = new Map<number, number>();

  protected onLoad() {
    game.on(Game.EVENT_HIDE, this.onGameHide, this);
    game.on(Game.EVENT_SHOW, this.onGameShow, this);
    director.on(SdkUtils.EVENT_AD_PAUSE_CHANGED, this.onAdPauseChanged, this);
  }

  protected async start() {
    FeedAcquisitionService.init();
    this.feedMode = FeedAcquisitionService.isActive();
    this.feedAcquisition = FeedAcquisitionService.isAcquisition();
    this.feedRevisitChallenge = FeedAcquisitionService.isRevisit();
    if (this.feedMode) {
      FeedAcquisitionService.addListener(this.onFeedStateChanged);
    }

    await this.prepareScene();
    await this.loadAssets();
    this.levelIndex = this.feedRevisitChallenge
      ? resolveFeedRevisitChallengeLevel(FeedAcquisitionService.getExtra())
      : this.feedAcquisition
        ? FEED_ACQUISITION_LEVEL
        : this.getStoredLevelIndex();
    const levelLoaded = await this.loadLevel(this.levelIndex);

    if (this.feedMode && levelLoaded) {
      this.feedSceneReady = true;
      this.applyFeedState(FeedAcquisitionService.getState());
      this.bindFeedFallbackTouch();
      // 至少完成一帧实际渲染后再通知平台，避免卡片首帧仍是空画面。
      director.once(Director.EVENT_END_FRAME, this.reportFeedSceneReady, this);
    }
  }

  private async prepareScene() {
    /**
     * 现在 GameScene 只负责场景按钮 / 道具按钮 / 关卡流程。
     * 棋盘视图相关节点统一由 mapControl 管理：
     * GameRoot / BoardRoot / BoardBaseRoot / TileRoot / BlockRoot。
     * HudRoot 仍由 gameScene 自己管理，避免关卡文字 / message 跟着棋盘拖动缩放。
     */
    if (!this.mapControl) {
      this.mapControl = this.node.getComponentInChildren(mapControl);
    }

    /**
     * 如果场景里没有手动挂 MapControl 节点，这里自动创建一个。
     * 你也可以在编辑器里创建 MapControl 节点并拖到 gameScene 的 mapControl 属性上。
     */
    if (!this.mapControl) {
      const mapNode = this.createNode("MapControl", this.node, DESIGN_WIDTH, DESIGN_HEIGHT);
      this.mapControl = mapNode.addComponent(mapControl);
      console.warn("[gameScene] 场景中没有找到 mapControl，已自动创建 MapControl 节点");
    }

    this.mapControl.init(DESIGN_WIDTH, DESIGN_HEIGHT);

    this.root = this.mapControl.gameRoot;
    this.boardRoot = this.mapControl.boardRoot;
    this.boardBaseRoot = this.mapControl.boardBaseRoot;
    this.tileRoot = this.mapControl.tileRoot;
    this.blockRoot = this.mapControl.blockRoot;

    /**
     * HudRoot 不放进 mapControl / GameRoot。
     * 否则 LevelLabel / MessageLabel 会跟着棋盘缩放和拖动。
     */
    this.hudRoot = this.node.getChildByName("HudRoot");

    /**
     * 托盘和底部按钮不放进 GameRoot。
     * 这样双指缩放 / 拖动时，只会移动棋盘视图，底部道具栏不会跟着动。
     *
     * 层级建议：
     * trayBG
     *   trays        // 只放空白槽位和移动到托盘的钻石
     *   addTrayBtn   // 增加一行空白槽按钮
     */
    this.trayBgRoot = this.node.getChildByName("trayBG");
    this.trayRoot = this.trayBgRoot?.getChildByName("trays") || null;

    if (!this.settingBtn) {
      this.settingBtn = this.node.getChildByName("settingBtn")?.getComponent(Button) || null;
    }
    this.bindSettingButton();

    if (!this.addTrayBtn) {
      const addTrayBtnNode =
        this.trayBgRoot?.getChildByName("addTrayBtn") || this.findDeepChild(this.trayBgRoot, "addTrayBtn");
      this.addTrayBtn = addTrayBtnNode?.getComponent(Button) || null;
    }

    this.bindAddTrayButton();

    this.levelLabel ||= this.findDeepChild(this.hudRoot, "LevelLabel")?.getComponent(Label) || null;
    this.timerLabel ||= this.findDeepChild(this.hudRoot, "TimerLabel")?.getComponent(Label) || null;
    this.messageLabel ||= this.findDeepChild(this.hudRoot, "MessageLabel")?.getComponent(Label) || null;
    if (this.timerLabel) {
      this.timerNormalColor = this.timerLabel.color.clone();
      this.timerLabelBaseScale = this.timerLabel.node.scale.clone();
    }

    /**
     * 棋盘点击只监听 mapControl 节点，不再监听整个 gameScene。
     * 避免设置按钮、底部道具按钮等 UI 也触发棋盘逻辑。
     */
    this.mapControl.node.on(Node.EventType.TOUCH_END, this.onSceneTouchEnd, this);

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

  private bindSettingButton() {
    if (!this.settingBtn) {
      return;
    }

    this.settingBtn.node.off("click", this.onSettingClicked, this);
    this.settingBtn.node.on("click", this.onSettingClicked, this);

    // 棋盘和 HUD 会在运行时调整层级，设置按钮始终放在 Canvas 最上层接收点击。
    this.settingBtn.node.setSiblingIndex(this.node.children.length - 1);
  }

  private onSettingClicked() {
    if (this.tutorialStep !== "none" || this.tutorialTransitioning) {
      this.showFloatingTip("请先完成当前引导");
      return;
    }
    if (this.inputLocked) return;
    if (this.isFeedExternalUiGuardActive()) {
      this.showFeedExternalUiGuardTip();
      return;
    }
    if (this.settingsOpen) {
      return;
    }

    const manager = UIManager.instance;
    if (!manager) {
      return;
    }

    this.settingsOpen = true;
    this.inputLockedBeforeSettings = this.inputLocked;
    this.timerRunningBeforeSettings = this.timerRunning;
    this.inputLocked = true;
    this.timerRunning = false;
    this.syncCountdownWarningState();

    const panel = manager.open(
      uiName.settingPanel,
      {
        enterType: 1,
        onClose: () => this.finishSettingsPause(),
        onRetry: () => {
          this.finishSettingsPause(false);
          this.loadLevel(this.levelIndex);
        },
        onBack: () => {
          this.finishSettingsPause(false);
          this.finishFeedExperience();
          void GameSceneBundle.loadScene(GameSceneName.Main);
        },
      },
      UILayer.Popup,
    );

    if (!panel) {
      this.finishSettingsPause();
    }
  }

  private finishSettingsPause(restoreGameState = true) {
    if (!this.settingsOpen) {
      return;
    }

    this.settingsOpen = false;
    const feedState = this.feedMode ? FeedAcquisitionService.getState() : null;
    const feedStillBlocking = !!feedState && (!feedState.entered || feedState.exited);
    if (feedStillBlocking) {
      // 设置关闭动画期间如果切出了推荐流，不能让设置回调反向恢复游戏。
      // 同时把“Feed 返回后应恢复的状态”改成打开设置前的真实游戏状态。
      if (this.feedPauseApplied) {
        this.inputLockedBeforeFeedPause = restoreGameState ? this.inputLockedBeforeSettings : false;
        this.timerRunningBeforeFeedPause = restoreGameState ? this.timerRunningBeforeSettings : true;
      }
      this.inputLocked = true;
      this.timerRunning = false;
      PlayData.Instance.ispause = true;
    } else if (restoreGameState) {
      this.inputLocked = this.inputLockedBeforeSettings;
      this.timerRunning = this.timerRunningBeforeSettings;
      PlayData.Instance.ispause = false;
    } else {
      PlayData.Instance.ispause = false;
    }
    this.inputLockedBeforeSettings = false;
    this.timerRunningBeforeSettings = false;
    this.syncCountdownWarningState();
    if (restoreGameState && !feedStillBlocking) {
      this.scheduleOnce(() => this.tryStartTutorialForCurrentLevel(), 0);
    }
  }

  private bindAddTrayButton() {
    if (!this.addTrayBtn) {
      return;
    }

    this.addTrayBtn.node.off("click", this.onAddTrayClicked, this);
    this.addTrayBtn.node.on("click", this.onAddTrayClicked, this);
  }

  private onAddTrayClicked() {
    if (this.inputLocked) {
      return;
    }
    if (!TutorialProgress.isTrayExpandUnlocked()) return;
    if (
      this.levelIndex === 2 &&
      !TutorialProgress.isTrayExpandGuideDone() &&
      this.tutorialStep !== "tray_expand"
    ) {
      return;
    }

    if (this.tutorialStep !== "none" && this.tutorialStep !== "tray_expand") {
      return;
    }

    if (this.activeTrayRows >= MAX_TRAY_ROWS) {
      this.refreshTrayLayout();
      return;
    }
    if (this.isLevel2FreeExpandAvailable()) {
      TutorialProgress.completeTrayExpandGuide();
      this.activeTrayRows++;
      this.refreshTrayLayout();
      this.finishTutorialStep();
      return;
    }

    if (this.isFeedExternalUiGuardActive()) {
      this.showFeedExternalUiGuardTip();
      return;
    }
    SdkUtils.showADVideo(() => {
      this.activeTrayRows++;
      this.refreshTrayLayout();
    });
  }

  private bindBoosterButtons() {
    const bottom = this.node.getChildByName("bottom");
    const buttons = bottom ? bottom.children.filter((child) => child.getComponent(Button)) : [];

    const binds = [() => this.onMagicClicked(), () => this.onBrushClicked(), () => this.onMagnetClicked()];
    for (let i = 0; i < Math.min(buttons.length, binds.length); i++) {
      const btn = buttons[i].getComponent(Button);
      buttons[i].off(Node.EventType.TOUCH_END);
      btn.node.on("click", binds[i], this);
    }
  }

  private async loadAssets() {
    if (!gameScene.assetsLoadPromise) {
      gameScene.assetsLoadPromise = this.loadSharedAssets();
    }

    const assets = await gameScene.assetsLoadPromise;
    if (!this.tilePrefab && assets.tilePrefab) this.tilePrefab = assets.tilePrefab;
    if (!this.blockPrefab && assets.blockPrefab) this.blockPrefab = assets.blockPrefab;
    if (!this.emptyBlockPrefab && assets.emptyBlockPrefab) this.emptyBlockPrefab = assets.emptyBlockPrefab;
    if (!this.traySlotPrefab && assets.traySlotPrefab) this.traySlotPrefab = assets.traySlotPrefab;

    this.selectFrame = assets.selectFrame;
    this.traySlotFrame = assets.traySlotFrame;
    this.boardBaseFrame = assets.boardBaseFrame;
    this.wandSelectionFrame = assets.wandSelectionFrame;
    this.sparkleFrame = assets.sparkleFrame;
    this.lockFrame = assets.lockFrame;
    this.glowEffect = assets.glowEffect;
    this.tileFrames = assets.tileFrames;
    this.blockFrames = assets.blockFrames;
    this.collapsedFrames = assets.collapsedFrames;
    this.refreshToolBadges();
  }

  private refreshToolBadges() {
    const tools: Array<{ button: Button; tool: ToolId }> = [
      { button: this.magicBtn, tool: "magic" },
      { button: this.clearBtn, tool: "brush" },
      { button: this.magnetBtn, tool: "magnet" },
    ];

    for (const { button, tool } of tools) {
      if (!button?.node) continue;
      const count = ToolInventory.getCount(tool);
      const unlocked = this.isToolUnlocked(tool);
      const countBadge = button.node.getChildByName("CountBadge");
      const adBadge = button.node.getChildByName("AdBadge");
      const countLabel = countBadge?.getChildByName("Count")?.getComponent(Label);

      if (countBadge) countBadge.active = unlocked && count > 0;
      if (adBadge) adBadge.active = unlocked && count <= 0;
      if (countLabel) countLabel.string = String(count);
      this.refreshToolLockBadge(button.node, tool, unlocked);
    }
  }

  private refreshToolLockBadge(buttonNode: Node, tool: ToolId, unlocked: boolean) {
    let lockRoot = buttonNode.getChildByName("TutorialLock");
    if (unlocked) {
      if (lockRoot?.isValid) lockRoot.active = false;
      return;
    }

    if (!lockRoot) {
      lockRoot = this.createNode("TutorialLock", buttonNode, 126, 92);
      lockRoot.setPosition(0, 12, 0);

      const lockIcon = this.createNode("Icon", lockRoot, 50, 50);
      lockIcon.setPosition(0, 13, 0);
      const lockSprite = lockIcon.addComponent(Sprite);
      lockSprite.sizeMode = Sprite.SizeMode.CUSTOM;

      const unlockText = this.createNode("UnlockText", lockRoot, 150, 34);
      unlockText.setPosition(0, -33, 0);
      const label = unlockText.addComponent(Label);
      label.fontSize = 20;
      label.lineHeight = 24;
      label.horizontalAlign = HorizontalTextAlignment.CENTER;
      label.verticalAlign = VerticalTextAlignment.CENTER;
      label.color = new Color(255, 255, 255, 255);
      const outline = unlockText.addComponent(LabelOutline);
      outline.color = new Color(91, 48, 139, 255);
      outline.width = 3;
    }

    lockRoot.active = true;
    lockRoot.setSiblingIndex(buttonNode.children.length - 1);
    const sprite = lockRoot.getChildByName("Icon")?.getComponent(Sprite);
    if (sprite) sprite.spriteFrame = this.lockFrame;
    const label = lockRoot.getChildByName("UnlockText")?.getComponent(Label);
    if (label) label.string = `第${TOOL_UNLOCK_LEVELS[tool]}关解锁`;
  }

  private async loadSharedAssets(): Promise<CachedGameAssets> {
    await ResourceManager.ins.loadBundle("res");

    const [
      tilePrefab,
      blockPrefab,
      traySlotPrefab,
      emptyBlockPrefab,
      selectFrame,
      traySlotFrame,
      boardBaseFrame,
      wandSelectionFrame,
      glowEffect,
      sparkleFrame,
      lockFrame,
      colorAssets,
    ] = await Promise.all([
      this.tryLoadPrefab("prefab/Blocks/Tile"),
      this.tryLoadPrefab("prefab/Blocks/Block"),
      this.tryLoadPrefab("prefab/Blocks/TraySlot"),
      this.tryLoadPrefab("prefab/Blocks/EmptyBlock"),
      this.tryLoadSprite("texture/Tiles/Tiles/gem_select_fx"),
      this.tryLoadSprite("texture/Trays/game_tray_slot_v2"),
      this.tryLoadSprite("texture/Trays/TraySlot"),
      this.tryLoadSprite("Images/WandSelectionFrame"),
      this.tryLoadEffect("effects/GemGlow"),
      this.tryLoadSprite("texture/UIs/sparkle3"),
      this.tryLoadSprite("texture/UIs/icon_lock"),
      Promise.all(
        COLOR_NAMES.map(async (name, color) => {
          if (color === 0) return null;
          const [tile, block, collapsed] = await Promise.all([
            this.tryLoadSprite(`texture/Tiles/Holes/LayerBottom_${name}`),
            this.tryLoadSprite(`texture/Tiles/Tiles/Gem_${name}_2`),
            this.tryLoadSprite(`texture/Tiles/TilesCollapsed/Gem_${name}_3`),
          ]);
          return { color, tile, block, collapsed };
        }),
      ),
    ]);

    const tileFrames = new Map<number, SpriteFrame>();
    const blockFrames = new Map<number, SpriteFrame>();
    const collapsedFrames = new Map<number, SpriteFrame>();

    for (const asset of colorAssets) {
      if (!asset) continue;
      if (asset.tile) tileFrames.set(asset.color, asset.tile);
      if (asset.block) blockFrames.set(asset.color, asset.block);
      if (asset.collapsed) collapsedFrames.set(asset.color, asset.collapsed);
    }

    return {
      tilePrefab,
      blockPrefab,
      emptyBlockPrefab,
      traySlotPrefab,
      selectFrame,
      traySlotFrame,
      boardBaseFrame,
      wandSelectionFrame,
      glowEffect,
      sparkleFrame,
      lockFrame,
      tileFrames,
      blockFrames,
      collapsedFrames,
    };
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

  private async tryLoadEffect(path: string): Promise<EffectAsset | null> {
    try {
      return await ResourceManager.ins.loadBundleAsset("res", path, EffectAsset);
    } catch {
      return null;
    }
  }

  private async loadLevel(levelIndex: number): Promise<boolean> {
    this.clearTutorialPresentation();
    this.inputLocked = true;
    this.timerRunning = false;
    this.resetCountdownWarning();
    this.levelCompletionHandled = false;
    this.feedChallengeRewardGranted = false;
    this.feedChallengeRewardTool = null;
    this.levelData = null;
    this.clearBoard();

    const resolved = await this.resolvePlayableLevel(levelIndex);
    if (!resolved) {
      this.showMessage("No Level Data");
      return false;
    }

    this.levelIndex = resolved.levelIndex;
    const data = resolved.data;
    if (!this.feedMode) {
      sys.localStorage.setItem(STORAGE_LEVEL_KEY, String(this.levelIndex));
    }

    this.levelData = data;
    this.ensureUnlocksForCurrentLevel();
    this.refreshTutorialTimerGate();
    const timing = calculateLevelTiming(
      this.levelIndex,
      data,
      this.levelTimeSeconds,
      this.reviveBonusSeconds,
    );
    // 获客体验使用独立固定时间；每日挑战沿用随机正式关卡自身的计时。
    this.currentLevelTimeSeconds = this.feedAcquisition
      ? FEED_ACQUISITION_SECONDS
      : timing.initialSeconds;
    this.currentReviveBonusSeconds = this.feedAcquisition
      ? FEED_ACQUISITION_REVIVE_SECONDS
      : timing.reviveSeconds;
    console.log(`[gameScene] Level ${this.levelIndex} difficulty`, timing);
    if (this.levelLabel) {
      this.levelLabel.string = this.feedRevisitChallenge ? "每日宝石挑战" : `LEVEL ${this.levelIndex}`;
    }
    this.buildBoard();
    this.buildTray();
    const scenePlayable =
      this.blocks.length > 0 &&
      this.tiles.length === data.rows &&
      this.traySlots.length === MAX_TRAY_SLOTS;
    if (!scenePlayable) {
      this.inputLocked = true;
      this.timerRunning = false;
      this.showMessage("Scene Load Failed");
      console.error("[gameScene] 棋盘或托盘未完整创建，禁止上报推荐流场景 7001");
      return false;
    }

    this.remainingTime = Math.max(1, this.currentLevelTimeSeconds);
    this.lastDisplayedSecond = -1;
    this.refreshTimerLabel();
    const waitingForFeedEnter = this.feedMode && !FeedAcquisitionService.getState().entered;
    // 等首帧布局稳定后再开放输入，避免玩家在引导遮罩出现前抢先改变第一关局面。
    this.inputLocked = true;
    this.timerRunning = false;
    this.checkWin();
    if (!waitingForFeedEnter) {
      this.scheduleOnce(() => {
        if (!this.node?.isValid || this.levelCompletionHandled) return;
        this.inputLocked = false;
        this.timerRunning = true;
        this.tryStartTutorialForCurrentLevel();
      }, 0.18);
    }
    return true;
  }

  protected update(deltaTime: number) {
    const clockAdvancing = this.isLevelClockAdvancing();
    this.syncCountdownWarningState(clockAdvancing);
    if (!clockAdvancing) return;

    this.remainingTime = Math.max(0, this.remainingTime - deltaTime);
    this.refreshTimerLabel();
    // 同一帧从 30 秒以上跨入警戒区时立即开始，不等待下一帧。
    this.syncCountdownWarningState(true);
    if (this.remainingTime > 0) return;

    this.timerRunning = false;
    this.inputLocked = true;
    this.resetCountdownWarning();
    this.openFailPanel();
  }

  private async loadLevelData(levelIndex: number): Promise<LevelData | null> {
    const cached = gameScene.levelDataCache.get(levelIndex);
    if (cached) return cached;

    try {
      const asset = await ResourceManager.ins.loadBundleAsset("res", `Levels/Level${levelIndex}_Complete`, TextAsset);
      const data = this.parseLevel(asset.text);
      gameScene.levelDataCache.set(levelIndex, data);
      return data;
    } catch (err) {
      console.warn(`[gameScene] Level ${levelIndex} load failed`, err);
      return null;
    }
  }

  /** 把旧版 1～225（缺 118/121/161）的存档映射到新版连续 1～222。 */
  private getStoredLevelIndex(): number {
    const storedLevel = Math.max(
      1,
      Math.floor(Number(sys.localStorage.getItem(STORAGE_LEVEL_KEY) || this.startLevel) || 1),
    );
    if (sys.localStorage.getItem(STORAGE_LEVEL_SEQUENCE_KEY) === "1") {
      return Math.min(LAST_STANDARD_LEVEL, storedLevel);
    }

    const removedLevelNumbers = [118, 121, 161];
    const removedBeforeStoredLevel = removedLevelNumbers.filter(
      (removedLevel) => storedLevel > removedLevel,
    ).length;
    const migratedLevel = Math.min(
      LAST_STANDARD_LEVEL,
      Math.max(1, storedLevel - removedBeforeStoredLevel),
    );
    sys.localStorage.setItem(STORAGE_LEVEL_KEY, String(migratedLevel));
    sys.localStorage.setItem(STORAGE_LEVEL_SEQUENCE_KEY, "1");
    return migratedLevel;
  }

  /** 缺号时向后寻找下一份正式关卡；超过正式关卡范围后回到第 1 关。 */
  private async resolvePlayableLevel(levelIndex: number): Promise<{ levelIndex: number; data: LevelData } | null> {
    const requested = Math.max(1, Math.floor(Number(levelIndex) || 1));
    const searchEnd = requested <= LAST_STANDARD_LEVEL ? LAST_STANDARD_LEVEL : requested;

    for (let candidate = requested; candidate <= searchEnd; candidate++) {
      const data = await this.loadLevelData(candidate);
      if (data) return { levelIndex: candidate, data };
    }

    if (requested !== 1) {
      const firstLevel = await this.loadLevelData(1);
      if (firstLevel) return { levelIndex: 1, data: firstLevel };
    }

    return null;
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
        if (color > 0) {
          const baseNode = this.createBoardBaseNode(r, c);
          baseNode.setPosition(pos);
        }

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
    this.activeTrayRows =
      this.levelIndex === 2 && TutorialProgress.isTrayExpandGuideDone()
        ? Math.min(2, MAX_TRAY_ROWS)
        : 1;
    this.traySlotSize = this.getTraySlotSize();
    this.traySlots = [];

    for (let i = 0; i < MAX_TRAY_SLOTS; i++) {
      const node = this.createTraySlotNode(i);

      const slot: TraySlotState = { index: i, node, block: null };
      this.traySlots.push(slot);

      node.off(Node.EventType.TOUCH_END);
      node.on(Node.EventType.TOUCH_END, () => this.onTraySlotClicked(slot), this);
    }

    this.refreshTrayLayout();
  }

  /**
   * 根据当前已经开启的托盘行数刷新：
   * 1. 空白槽位显隐和位置
   * 2. trayBG 背景尺寸
   * 3. addTrayBtn 位置和显隐
   * 4. 已经放入托盘的钻石位置
   */
  private refreshTrayLayout() {
    if (!this.trayRoot) {
      return;
    }

    this.activeTrayRows = Math.min(MAX_TRAY_ROWS, Math.max(1, this.activeTrayRows));

    this.traySlotSize = this.getTraySlotSize();

    const stepX = this.traySlotSize + this.traySlotGap;
    const stepY = this.traySlotSize + this.trayRowGap;

    const trayWidth = (TRAY_COLS - 1) * stepX + this.traySlotSize;
    const trayHeight = (this.activeTrayRows - 1) * stepY + this.traySlotSize;

    this.setNodeSize(this.trayRoot, trayWidth, trayHeight);

    for (let i = 0; i < this.traySlots.length; i++) {
      const slot = this.traySlots[i];
      const row = Math.floor(i / TRAY_COLS);
      const col = i % TRAY_COLS;
      const active = row < this.activeTrayRows;

      slot.node.active = active;

      const x = -((TRAY_COLS - 1) * stepX) * 0.5 + col * stepX;
      const y = (this.activeTrayRows - 1) * stepY * 0.5 - row * stepY;

      slot.node.setPosition(x, y);

      const view = this.findDeepChild(slot.node, "View") || slot.node;
      this.applySprite(view, this.traySlotFrame, this.traySlotSize, this.traySlotSize, new Color(255, 255, 255, 95));

      if (slot.block) {
        slot.block.node.active = active;
        slot.block.node.setPosition(this.getNodePositionInTrayRoot(slot.node));
        slot.block.node.setScale(this.getTrayBlockScale(false));
      }
    }

    this.refreshTrayBgSize(trayWidth, trayHeight);
    this.refreshAddTrayButton();
  }

  private refreshTrayBgSize(trayWidth: number, trayHeight: number) {
    if (!this.trayBgRoot) {
      return;
    }

    const bgWidth = trayWidth + this.trayBgPaddingX;
    const bgHeight = trayHeight + this.trayBgPaddingY;

    this.setNodeSize(this.trayBgRoot, bgWidth, bgHeight);

    const bgSprite = this.trayBgRoot.getComponent(Sprite);
    if (bgSprite) {
      bgSprite.sizeMode = Sprite.SizeMode.CUSTOM;
    }
  }

  private refreshAddTrayButton() {
    if (!this.addTrayBtn) {
      return;
    }

    const isMaxRows = this.activeTrayRows >= MAX_TRAY_ROWS;
    const waitingForLevel2Guide =
      this.levelIndex === 2 &&
      !TutorialProgress.isTrayExpandGuideDone() &&
      this.getAllTrayBlocksForClean().length === 0;
    this.addTrayBtn.node.active =
      TutorialProgress.isTrayExpandUnlocked() && !isMaxRows && !waitingForLevel2Guide;

    if (isMaxRows || !this.trayBgRoot) {
      return;
    }

    const bgTransform = this.trayBgRoot.getComponent(UITransform);
    const bgHeight = bgTransform?.height || 0;

    this.addTrayBtn.node.setPosition(0, -bgHeight * 0.5 - this.trayAddButtonGap);
  }

  private isTraySlotActive(slot: TraySlotState): boolean {
    return !!slot && Math.floor(slot.index / TRAY_COLS) < this.activeTrayRows;
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

  private playGemUpSound() {
    director.emit("up");
  }

  private playGemDownSound() {
    director.emit("down");
  }

  private shouldPlayMoveSound(node: Node, targetPosition: Vec3): boolean {
    if (!node || !targetPosition) {
      return false;
    }

    const pos = node.position;
    const dx = pos.x - targetPosition.x;
    const dy = pos.y - targetPosition.y;

    /**
     * 只是抬起原地放下时，不播放 down。
     * 只有真实移动到另一个位置时，才播放一次 down。
     */
    return dx * dx + dy * dy > 0.25;
  }

  private onBlockClicked(block: BlockState) {
    if (this.inputLocked) return;

    if (!this.isTutorialBlockAllowed(block)) {
      return;
    }

    if (this.magicSelecting) {
      return;
    }

    if (block.selected) {
      this.unselectAll();
      return;
    }

    if (block.location === "tray") {
      this.selectTrayRun(block);
      this.onTutorialBlockSelectionCompleted(block);
      return;
    }

    if (block.collapsed) return;

    const group = this.getConnectedBlocks(block.row, block.col, block.color);
    if (group.length === 0) return;
    this.selectBlocks(group);
    this.onTutorialBlockSelectionCompleted(block);
  }

  private onTraySlotClicked(slot: TraySlotState) {
    if (this.inputLocked) return;
    if (!this.isTraySlotActive(slot)) return;
    if (!this.isTutorialTraySlotAllowed(slot)) return;

    const boardBlocks = this.selectedBlocks.filter((b) => b.location === "board");
    if (boardBlocks.length === 0) return;

    this.moveBoardBlocksToTray(boardBlocks, slot.index, () => this.onTutorialTrayMoveCompleted());
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
    if (!this.isTutorialTileAllowed(tile)) return;
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
        /**
         * 手动把下面槽位里的钻石移动回上方棋盘后，
         * 槽位中间可能会留下空洞，或者同色被拆开。
         * 这里补一次自然整理：
         * - 如果已经排好，不会重新播放排序动画。
         * - 如果有空洞 / 同色被拆散，才会自动整理。
         */
        this.sortTrayBlocks();

        this.inputLocked = false;
        this.onTutorialTileMoveCompleted();
        this.tryStartTutorialForCurrentLevel();
        this.checkWin();
      },
      0.35 + count * 0.04,
    );
  }

  private moveBoardBlocksToTray(blocks: BlockState[], startSlotIndex: number, onComplete?: () => void) {
    const slots = this.collectEmptyTraySlots(startSlotIndex, blocks.length);
    if (slots.length === 0) {
      this.showFloatingTip("托盘已满");
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
      if (tile?.block === block) {
        tile.block = null;
      }

      /**
       * 重点：
       * 先从 blockRoot 切到 trayRoot。
       * 这样托盘里的钻石不会再跟着 GameRoot 缩放 / 拖动。
       */
      this.changeParentKeepWorldPosition(block.node, this.trayRoot);

      block.location = "tray";
      block.row = -1;
      block.col = -1;
      block.slot = slot;
      slot.block = block;

      this.updateCollapse(block, false);

      block.node.setSiblingIndex(9999);

      const targetPos = this.getNodePositionInTrayRoot(slot.node);
      this.moveNode(block.node, targetPos, 0.22, i * 0.04);
    }

    this.unselectAfterMove(movingBlocks);

    this.scheduleOnce(
      () => {
        this.sortTrayBlocks();
        this.inputLocked = false;
        onComplete?.();
        this.tryStartTutorialForCurrentLevel();
      },
      0.32 + count * 0.04,
    );
  }

  private moveBlockToTile(block: BlockState, tile: TileState, delay = 0) {
    if (block.location === "tray" && block.slot) {
      block.slot.block = null;
      block.slot = null;

      /**
       * 重点：
       * 从托盘回棋盘，要切回 blockRoot。
       * 这样钻石会重新跟着棋盘缩放 / 拖动。
       */
      this.changeParentKeepWorldPosition(block.node, this.blockRoot);
    } else if (block.location === "board") {
      const from = this.tiles[block.row]?.[block.col];
      if (from?.block === block) {
        from.block = null;
      }
    }

    tile.block = block;
    block.location = "board";
    block.row = tile.row;
    block.col = tile.col;

    const targetPos = this.getNodePositionInBlockRoot(tile.node);

    this.moveNode(block.node, targetPos, 0.24, delay, () => {
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
      const slot = this.traySlots[i];

      if (!this.isTraySlotActive(slot)) {
        continue;
      }

      if (!slot.block) {
        result.push(slot);
      }
    }
    return result;
  }

  /**
   * 自动整理下面空白槽位。
   *
   * 这版不是每次都强行排序。
   * 只有出现以下情况才会真正移动：
   * 1. 中间有空槽，需要把钻石压缩到前面。
   * 2. 同一种颜色被拆成了多段，比如：黑 黑 粉 粉 黑 黑。
   *
   * 如果已经是类似下面这种状态，就不再重新排一次：
   * 黑 黑 粉 粉
   * 粉 粉 黑 黑
   *
   * 排序时会保留颜色第一次出现的顺序，而不是固定按颜色编号排。
   * 这样更接近视频里的自然整理效果，不会显得很刻意。
   */
  private sortTrayBlocks(): boolean {
    if (!this.traySlots || this.traySlots.length === 0) {
      return false;
    }

    const activeSlots = this.traySlots.filter((slot) => this.isTraySlotActive(slot));

    if (activeSlots.length === 0) {
      return false;
    }

    const currentBlocks = activeSlots
      .map((slot) => slot.block)
      .filter((block): block is BlockState => !!block && block.location === "tray");

    if (currentBlocks.length === 0) {
      return false;
    }

    const targetBlocks = this.getGroupedTrayBlocksByFirstColorOrder(currentBlocks);

    /**
     * 如果现在已经是“同色连续 + 空槽在后面”，就不要再播放排序动画。
     */
    let needSort = false;

    for (let i = 0; i < activeSlots.length; i++) {
      const currentBlock = activeSlots[i].block || null;
      const targetBlock = targetBlocks[i] || null;

      if (currentBlock !== targetBlock) {
        needSort = true;
        break;
      }
    }

    if (!needSort) {
      return false;
    }

    for (const slot of activeSlots) {
      slot.block = null;
    }

    for (let i = 0; i < targetBlocks.length; i++) {
      const block = targetBlocks[i];
      const slot = activeSlots[i];

      if (!slot) {
        continue;
      }

      slot.block = block;

      block.location = "tray";
      block.row = -1;
      block.col = -1;
      block.slot = slot;

      this.changeParentKeepWorldPosition(block.node, this.trayRoot);
      this.updateCollapse(block, false);

      block.node.active = true;
      block.node.setScale(this.getTrayBlockScale(false));
      block.node.setSiblingIndex(9999);

      this.moveNode(block.node, this.getNodePositionInTrayRoot(slot.node), 0.16, i * 0.015);
    }

    return true;
  }

  /**
   * 按颜色第一次出现的顺序分组。
   *
   * 例：
   * 黑 黑 粉 粉 黑 黑 => 黑 黑 黑 黑 粉 粉
   * 粉 粉 黑 黑       => 粉 粉 黑 黑
   */
  private getGroupedTrayBlocksByFirstColorOrder(blocks: BlockState[]): BlockState[] {
    const colorOrder: number[] = [];
    const colorMap = new Map<number, BlockState[]>();

    for (const block of blocks) {
      if (!colorMap.has(block.color)) {
        colorMap.set(block.color, []);
        colorOrder.push(block.color);
      }

      colorMap.get(block.color)!.push(block);
    }

    const result: BlockState[] = [];

    for (const color of colorOrder) {
      const group = colorMap.get(color);

      if (!group) {
        continue;
      }

      result.push(...group);
    }

    return result;
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

    if (blocks.length > 0) {
      this.playGemUpSound();
    }

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
      this.setBlockGlow(block, true, this.selectedGlowStrength);
      block.node.setSiblingIndex(9999);
    }
  }

  private unselectAll(resetPosition = true) {
    for (const block of this.selectedBlocks) {
      block.selected = false;
      block.node.setScale(block.location === "tray" ? this.getTrayBlockScale(false) : Vec3.ONE);
      this.setBlockGlow(block, false);
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
    const remainingBlocks: BlockState[] = [];

    for (const block of this.selectedBlocks) {
      if (!movingBlocks.has(block)) {
        remainingBlocks.push(block);
        continue;
      }

      block.selected = false;
      block.node.setScale(block.location === "tray" ? this.getTrayBlockScale(false) : Vec3.ONE);
      this.setBlockGlow(block, false);
      if (block.selectedFx) block.selectedFx.node.active = false;
    }

    // 一次只能放下部分钻石时，其余钻石继续保持抬起，方便连续点击其他坑位。
    this.selectedBlocks = remainingBlocks;
  }

  private resetBlockPosition(block: BlockState) {
    if (block.location === "board") {
      block.node.setPosition(this.getTilePosition(block.row, block.col));
    } else if (block.location === "tray" && block.slot) {
      block.node.setPosition(this.getNodePositionInTrayRoot(block.slot.node));
    }
  }

  private updateCollapse(block: BlockState, animate: boolean) {
    const tile = block.location === "board" ? this.tiles[block.row]?.[block.col] : null;
    block.collapsed = !!tile && tile.color === block.color;
    block.normalSprite.node.active = !block.collapsed;
    block.collapsedSprite.node.active = block.collapsed;
    block.node.setScale(block.location === "tray" ? this.getTrayBlockScale(false) : Vec3.ONE);

    if (block.collapsed && animate) {
      this.flashBlockGlow(block, this.sortedGlowStrength, 0.32);
      this.playCorrectSparkle(block);
      tween(block.node)
        .to(0.08, { scale: new Vec3(1.16, 1.16, 1) })
        .to(0.1, { scale: Vec3.ONE })
        .start();
    }
  }

  private playCorrectSparkle(block: BlockState) {
    if (!this.sparkleFrame || !this.blockRoot || !block.node?.isValid) {
      return;
    }

    const node = this.createNode(`CorrectSparkle_${block.id}`, this.blockRoot, this.cellSize, this.cellSize);
    node.setPosition(this.getTilePosition(block.row, block.col));
    node.setSiblingIndex(10000);

    const particle = node.addComponent(ParticleSystem2D);
    particle.custom = true;
    particle.spriteFrame = this.sparkleFrame;
    particle.totalParticles = Math.max(6, Math.min(18, Math.floor(this.correctSparkleCount || 10)));
    particle.duration = 0.42;
    particle.emissionRate = 26;
    particle.life = 0.52;
    particle.lifeVar = 0.16;
    particle.angle = 90;
    particle.angleVar = 360;
    particle.posVar = new Vec2(this.cellSize * 0.32, this.cellSize * 0.28);
    particle.speed = this.cellSize * 0.78;
    particle.speedVar = this.cellSize * 0.32;
    particle.gravity = new Vec2(0, -this.cellSize * 0.45);
    particle.tangentialAccel = 0;
    particle.radialAccel = 0;
    particle.startSize = this.cellSize * 0.06;
    particle.startSizeVar = this.cellSize * 0.025;
    particle.endSize = this.cellSize * 0.01;
    particle.endSizeVar = 0;
    particle.startSpin = 0;
    particle.startSpinVar = 240;
    particle.endSpin = 260;
    particle.endSpinVar = 260;
    particle.startColor = new Color(255, 248, 120, 245);
    particle.startColorVar = new Color(20, 20, 35, 10);
    particle.endColor = new Color(255, 255, 255, 0);
    particle.endColorVar = new Color(0, 0, 0, 0);
    particle.positionType = 2;
    particle.autoRemoveOnFinish = true;
    particle.resetSystem();

    this.playCorrectStarBursts(block);

    this.scheduleOnce(() => {
      if (node.isValid) {
        node.destroy();
      }
    }, 1);
  }

  private playCorrectStarBursts(block: BlockState) {
    const center = this.getTilePosition(block.row, block.col);
    const radius = this.cellSize * 0.34;
    const offsets = [
      new Vec3(-radius, radius * 0.45, 0),
      new Vec3(radius * 0.55, radius * 0.75, 0),
      new Vec3(radius * 0.82, -radius * 0.28, 0),
      new Vec3(-radius * 0.45, -radius * 0.78, 0),
    ];

    for (let i = 0; i < offsets.length; i++) {
      const size = this.cellSize * (i % 2 === 0 ? 0.1 : 0.085);
      const star = this.createSpriteNode(`CorrectStar_${block.id}_${i}`, this.blockRoot, this.sparkleFrame, size, size);
      star.setPosition(center.x + offsets[i].x, center.y + offsets[i].y, 0);
      star.setSiblingIndex(10001 + i);
      star.setScale(new Vec3(0.15, 0.15, 1));
      star.angle = i * 35;

      const opacity = star.addComponent(UIOpacity);
      opacity.opacity = 0;
      const delay = i * 0.06;

      tween(opacity)
        .delay(delay)
        .to(0.08, { opacity: 255 })
        .delay(0.2)
        .to(0.18, { opacity: 0 })
        .start();

      tween(star)
        .delay(delay)
        .to(0.12, { scale: new Vec3(0.8, 0.8, 1), angle: star.angle + 45 }, { easing: "backOut" })
        .to(0.26, { scale: new Vec3(0.25, 0.25, 1), angle: star.angle + 130 }, { easing: "quadOut" })
        .call(() => {
          if (star.isValid) {
            star.destroy();
          }
        })
        .start();
    }
  }

  private setBlockGlow(block: BlockState, active: boolean, strength = this.selectedGlowStrength) {
    const sprites = this.getBlockSprites(block);

    if (!active) {
      this.glowFlashTokens.set(block.id, (this.glowFlashTokens.get(block.id) || 0) + 1);
      for (const sprite of sprites) {
        sprite.customMaterial = null;
        (sprite as any).updateMaterial?.();
      }
      return;
    }

    const material = this.getBlockGlowMaterial(block);
    if (!material) {
      return;
    }

    material.setProperty("glowColor", new Vec4(1, 0.92, 0.25, 1));
    material.setProperty("glowParams", new Vec4(this.glowRadius, strength, this.glowPulseSpeed, 0.72));

    for (const sprite of sprites) {
      sprite.customMaterial = material;
      (sprite as any).updateMaterial?.();
    }
  }

  private flashBlockGlow(block: BlockState, strength: number, duration = 0.55) {
    const token = (this.glowFlashTokens.get(block.id) || 0) + 1;
    this.glowFlashTokens.set(block.id, token);
    this.setBlockGlow(block, true, strength);

    this.scheduleOnce(() => {
      if (!block.node?.isValid || this.glowFlashTokens.get(block.id) !== token) {
        return;
      }

      if (block.selected) {
        this.setBlockGlow(block, true, this.selectedGlowStrength);
      } else {
        this.setBlockGlow(block, false);
      }
    }, duration);
  }

  private getBlockGlowMaterial(block: BlockState): Material | null {
    if (!this.glowEffect) {
      return null;
    }

    let material = this.glowMaterials.get(block.id);
    if (!material) {
      material = new Material();
      material.initialize({
        effectAsset: this.glowEffect,
        defines: {
          USE_TEXTURE: true,
        },
      });
      this.glowMaterials.set(block.id, material);
    }

    return material;
  }

  private getBlockSprites(block: BlockState): Sprite[] {
    const sprites: Sprite[] = [];
    if (block.normalSprite) sprites.push(block.normalSprite);
    if (block.collapsedSprite) sprites.push(block.collapsedSprite);
    return sprites;
  }

  private onMagicClicked() {
    if (this.inputLocked) return;
    if (!this.isToolActionAllowed("magic")) return;
    void this.prepareTool("magic", () => {
      this.magicUses = ToolInventory.getCount("magic");
      this.enterMagicSelectMode();
      if (this.tutorialStep === "magic_button" && this.magicSelecting) {
        this.startMagicDragTutorial();
      }
    });
  }

  /**
   * clearBtn：清理下面所有已经开启的槽位。
   *
   * 效果参考视频：
   * - 处理当前已经开启的所有槽位。
   * - 把槽位里的钻石，自动移动回上方对应颜色的空白格子。
   * - 成功移动的槽位会变空。
   */
  private onBrushClicked() {
    if (this.inputLocked) {
      return;
    }
    if (!this.isToolActionAllowed("brush")) return;
    void this.prepareTool("brush", () => {
      const isGuideUse = this.tutorialStep === "brush_button";
      let consumed = false;
      if (this.cleanTray(() => {
        if (consumed) this.completeToolTutorial("brush");
      })) {
        consumed = ToolInventory.consume("brush");
        if (consumed && isGuideUse) ToolInventory.markGuideDone("brush");
        this.refreshToolBadges();
      } else if (isGuideUse) {
        this.skipToolTutorial("brush");
      }
    });
  }

  /**
   * magnetBtn：自动整理上方棋盘 12 个钻石。
   *
   * 规则：
   * 1. 只整理上方棋盘，最多完成 MAGNET_SORT_COUNT 个归位操作。
   * 2. 如果正确钻石在上方棋盘里，直接移动 / 交换到正确位置。
   * 3. 如果正确钻石在下面槽位里，只允许和上方错误钻石交换。
   *    这样下面槽位的钻石数量不会减少。
   * 4. 不会把下面槽位钻石直接放到上方空格，因为那会减少下面槽位上的钻石数量。
   */
  private onMagnetClicked() {
    if (this.inputLocked) return;
    if (!this.isToolActionAllowed("magnet")) return;
    void this.prepareTool("magnet", () => {
      const isGuideUse = this.tutorialStep === "magnet_button";
      let consumed = false;
      if (this.autoSortBoardByMagnet(MAGNET_SORT_COUNT, () => {
        if (consumed) this.completeToolTutorial("magnet");
      })) {
        consumed = ToolInventory.consume("magnet");
        if (consumed && isGuideUse) ToolInventory.markGuideDone("magnet");
        this.refreshToolBadges();
      } else if (isGuideUse) {
        this.skipToolTutorial("magnet");
      }
    });
  }

  private async prepareTool(tool: ToolId, onReady: () => void): Promise<boolean> {
    if (this.inputLocked) return false;
    if (!this.isToolUnlocked(tool)) {
      this.showFloatingTip(`第${TOOL_UNLOCK_LEVELS[tool]}关解锁${TOOL_DISPLAY_NAMES[tool]}`);
      return false;
    }
    if (ToolInventory.has(tool)) {
      onReady();
      return true;
    }

    // 教学必须能离线完成。即使玩家曾在动画中退出导致试用次数耗尽，
    // 也只补一份教学用次数，不在强制引导里拉起广告。
    if (this.isActiveToolTutorial(tool)) {
      ToolInventory.add(tool, 1);
      this.refreshToolBadges();
      onReady();
      return true;
    }

    return this.showRewardAdThenRun(() => {
      ToolInventory.add(tool);
      this.refreshToolBadges();
      onReady();
    });
  }

  private async showRewardAdThenRun(action: () => void, allowWhenLocked = false): Promise<boolean> {
    if (this.isFeedExternalUiGuardActive()) {
      this.showFeedExternalUiGuardTip();
      return false;
    }
    if (this.inputLocked && !allowWhenLocked) return false;

    const rewarded = await SdkUtils.showRewardedVideo();
    if (!rewarded) return false;

    action();
    return true;
  }

  private enterMagicSelectMode() {
    this.unselectAll();
    this.magicUses = ToolInventory.getCount("magic");
    this.magicSelecting = this.magicUses > 0;
    if (!this.magicSelecting) return;
    this.showMessage("请选择区域");
    this.ensureMagicAreaNode();
    const center = this.getDefaultMagicAreaCenter();
    if (!center) return;
    this.magicAreaStartCenter = { row: center.row, col: center.col };
    this.moveMagicAreaTo(center.row, center.col);
    this.magicAreaNode.active = true;
  }

  private castMagicAt(row: number, col: number) {
    if (!this.magicSelecting || this.magicUses <= 0) return;
    const isGuideUse = this.tutorialStep === "magic_drag";

    if (
      this.tutorialStep === "magic_drag" &&
      this.tutorialMagicTarget &&
      (row !== this.tutorialMagicTarget.row || col !== this.tutorialMagicTarget.col)
    ) {
      this.resetMagicAreaToStart();
      this.showMagicDragTutorial();
      return;
    }

    const tiles = this.getMagicAreaTiles(row, col);
    if (tiles.length === 0) return;
    if (this.isMagicAreaAlreadySorted(tiles)) {
      this.resetMagicAreaToStart();
      return;
    }

    let consumed = false;
    if (!this.sortMagicArea(tiles, () => {
      if (consumed) this.completeToolTutorial("magic");
    })) {
      if (isGuideUse) {
        this.skipToolTutorial("magic");
      } else {
        this.resetMagicAreaToStart();
      }
      return;
    }

    consumed = ToolInventory.consume("magic");
    if (!consumed) {
      if (isGuideUse) {
        this.skipToolTutorial("magic");
      } else {
        this.resetMagicAreaToStart();
      }
      return;
    }
    if (isGuideUse) ToolInventory.markGuideDone("magic");
    this.refreshToolBadges();

    this.magicSelecting = false;
    this.magicUses = ToolInventory.getCount("magic");
    if (this.messageLabel) this.messageLabel.node.active = false;
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
    const parent = this.getMagicAreaParent();

    if (this.magicAreaNode) {
      if (this.magicAreaNode.parent !== parent) {
        this.changeParentKeepWorldPosition(this.magicAreaNode, parent);
      }
      this.drawMagicAreaNode();
      this.magicAreaNode.setSiblingIndex(parent.children.length - 1);
      return;
    }

    this.magicAreaNode = this.createNode("MagicArea", parent, 1, 1);
    this.magicAreaNode.addComponent(Sprite);
    this.magicAreaNode.on(Node.EventType.TOUCH_START, this.onMagicAreaTouchStart, this);
    this.magicAreaNode.on(Node.EventType.TOUCH_MOVE, this.onMagicAreaTouchMove, this);
    this.magicAreaNode.on(Node.EventType.TOUCH_END, this.onMagicAreaTouchEnd, this);
    this.magicAreaNode.on(Node.EventType.TOUCH_CANCEL, this.onMagicAreaTouchEnd, this);
    this.drawMagicAreaNode();
    this.magicAreaNode.setSiblingIndex(parent.children.length - 1);
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

    const nearestTile = this.findNearestTileAtPosition(this.getMagicAreaPositionInTileRoot());
    if (!nearestTile) return;

    // 教学要求玩家理解“拖动区域后释放”，不应该要求3×3框的中心格
    // 与目标中心完全重合。进入目标3×3范围后自动吸附到正确中心，
    // 避免视觉上已经拖到高亮区，却因为偏一格而被强制复位。
    const tile = this.snapMagicTutorialDrop(nearestTile);
    this.moveMagicAreaTo(tile.row, tile.col);
    this.castMagicAt(tile.row, tile.col);
  }

  private snapMagicTutorialDrop(tile: TileState): TileState {
    if (this.tutorialStep !== "magic_drag" || !this.tutorialMagicTarget) {
      return tile;
    }

    const target = this.tiles[this.tutorialMagicTarget.row]?.[this.tutorialMagicTarget.col];
    if (!target) return tile;

    const rowTolerance = Math.floor(this.getMagicAreaRows() * 0.5);
    const colTolerance = Math.floor(this.getMagicAreaCols() * 0.5);
    const isInsideTargetArea =
      Math.abs(tile.row - target.row) <= rowTolerance &&
      Math.abs(tile.col - target.col) <= colTolerance;
    return isInsideTargetArea ? target : tile;
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
    this.showMessage("请选择区域");
  }

  private sortMagicArea(tiles: TileState[], onComplete?: () => void): boolean {
    const candidates = this.blocks.filter((block) => block.location === "board" || block.location === "tray");
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
        if (block.location === "tray") return !!block.slot;

        const currentTile = this.tiles[block.row]?.[block.col];
        return currentTile && currentTile !== tile;
      });
      if (!match) continue;

      const fromTile = match.location === "board" ? this.tiles[match.row]?.[match.col] : null;
      const fromSlot = match.location === "tray" ? match.slot : null;
      if (match.location === "board" && (!fromTile || fromTile === tile)) continue;
      if (match.location === "tray" && !fromSlot) continue;

      const occupant = tile.block;
      if (fromTile) {
        fromTile.block = occupant;
      } else if (fromSlot) {
        fromSlot.block = occupant;
      }
      tile.block = match;

      match.row = tile.row;
      match.col = tile.col;
      match.location = "board";
      match.slot = null;

      this.changeParentKeepWorldPosition(match.node, this.blockRoot);
      this.updateCollapse(match, false);
      this.moveNode(match.node, this.getNodePositionInBlockRoot(tile.node), 0.22, operations * 0.04, () => {
        this.updateCollapse(match, true);
      });

      if (occupant) {
        if (fromTile) {
          occupant.row = fromTile.row;
          occupant.col = fromTile.col;
          occupant.location = "board";
          occupant.slot = null;
          this.updateCollapse(occupant, false);
          this.moveNode(occupant.node, this.getNodePositionInBlockRoot(fromTile.node), 0.22, operations * 0.04, () => {
            this.updateCollapse(occupant, true);
          });
        } else if (fromSlot) {
          occupant.row = -1;
          occupant.col = -1;
          occupant.location = "tray";
          occupant.slot = fromSlot;

          this.changeParentKeepWorldPosition(occupant.node, this.trayRoot);

          this.updateCollapse(occupant, false);
          this.moveNode(occupant.node, this.getNodePositionInTrayRoot(fromSlot.node), 0.22, operations * 0.04);
        }
      }
      operations++;
    }

    if (operations === 0) {
      this.inputLocked = false;
      return false;
    }

    this.scheduleOnce(
      () => {
        this.sortTrayBlocks();
        this.inputLocked = false;
        onComplete?.();
        this.checkWin();
      },
      0.35 + operations * 0.04,
    );
    return true;
  }

  /**
   * clearBtn：清理下面所有已经开启的槽位。
   *
   * 这版逻辑更接近你视频里的“帮忙排序”：
   * 1. 扫描当前已经开启的所有槽位。
   * 2. 如果槽位里没有钻石，提示“空白格子没有钻石”。
   * 3. 下面槽位里的钻石会优先移动到上方对应颜色的位置，让它们直接归位。
   * 4. 如果目标位置已经被错误钻石占着，会先把这个错误钻石挪到上方任意空格。
   * 5. 被挪走的错误钻石不要求排序好，只要先腾出目标位即可。
   * 6. 暂时无法归位的槽位钻石会留在槽位里，并重新压缩排序。
   */
  private cleanTray(onComplete?: () => void): boolean {
    const trayBlocks = this.getAllTrayBlocksForClean();

    if (trayBlocks.length === 0) {
      this.showFloatingTip("空白格子没有钻石");
      return false;
    }

    const operations = this.collectTrayAutoSortOperations(trayBlocks);

    if (operations.length === 0) {
      /**
       * 没有可执行操作时，不要一直刷很多条“暂无可放回上方的钻石”。
       * 保留一次提示，同时把下方槽位压缩一下，让玩家看到 clear 有反馈。
       */
      this.sortTrayBlocks();
      this.showFloatingTip("暂无可整理的钻石");
      return false;
    }

    this.inputLocked = true;
    this.unselectAll(false);

    let moveIndex = 0;

    for (const op of operations) {
      /**
       * 如果目标格子上有错误钻石，先把它挪到上方空白格子里。
       * 注意：这个错误钻石不要求归位，只是腾位置。
       */
      if (op.displacedBlock && op.bufferTile) {
        this.moveBlockToTile(op.displacedBlock, op.bufferTile, moveIndex * 0.045);
        moveIndex++;
      }

      /**
       * 再把槽位里的钻石放到它对应颜色的目标格子。
       */
      this.moveBlockToTile(op.trayBlock, op.targetTile, moveIndex * 0.045);
      moveIndex++;
    }

    this.scheduleOnce(
      () => {
        /**
         * 剩余暂时无法上去的槽位钻石，重新压缩排序到槽位前面。
         */
        this.refreshTrayLayout();
        this.sortTrayBlocks();

        this.inputLocked = false;
        onComplete?.();
        this.checkWin();
      },
      0.35 + moveIndex * 0.045,
    );

    return true;
  }

  /**
   * 获取当前已经开启的所有托盘槽位中的钻石。
   */
  private getAllTrayBlocksForClean(): BlockState[] {
    return this.traySlots
      .filter((slot) => this.isTraySlotActive(slot))
      .map((slot) => slot.block)
      .filter((block): block is BlockState => !!block && block.location === "tray");
  }

  /**
   * clear 自动整理操作。
   *
   * trayBlock：下面槽位里准备上去的钻石。
   * targetTile：它最终要去的正确颜色格子。
   * displacedBlock：如果 targetTile 上原本有错误钻石，就先挪走它。
   * bufferTile：错误钻石被挪去的上方空格，不要求颜色正确。
   */
  private collectTrayAutoSortOperations(trayBlocks: BlockState[]): Array<{
    trayBlock: BlockState;
    targetTile: TileState;
    displacedBlock: BlockState | null;
    bufferTile: TileState | null;
  }> {
    const operations: Array<{
      trayBlock: BlockState;
      targetTile: TileState;
      displacedBlock: BlockState | null;
      bufferTile: TileState | null;
    }> = [];

    /**
     * 模拟棋盘占用关系，避免一次 clear 里多个钻石抢同一个格子。
     */
    const simulatedBlockAtTile = new Map<TileState, BlockState | null>();
    const simulatedTileOfBlock = new Map<BlockState, TileState>();

    for (const row of this.tiles) {
      for (const tile of row) {
        if (!tile || tile.color <= 0) {
          continue;
        }

        simulatedBlockAtTile.set(tile, tile.block);

        if (tile.block) {
          simulatedTileOfBlock.set(tile.block, tile);
        }
      }
    }

    /**
     * clear 时优先处理：
     * 1. 在槽位里没有左右同色相邻的散乱钻石。
     * 2. 再处理已经连在一起的钻石。
     * 3. 同优先级按槽位顺序。
     */
    const sortedTrayBlocks = [...trayBlocks].sort((a, b) => {
      const aPriority = this.getTrayBlockCleanPriority(a);
      const bPriority = this.getTrayBlockCleanPriority(b);

      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }

      return (a.slot?.index ?? 9999) - (b.slot?.index ?? 9999);
    });

    for (const trayBlock of sortedTrayBlocks) {
      const targetTile = this.findBestTargetTileForTrayAutoSort(trayBlock.color, simulatedBlockAtTile);

      if (!targetTile) {
        continue;
      }

      const occupant = simulatedBlockAtTile.get(targetTile) || null;

      if (!occupant) {
        /**
         * 目标格本来就是空的，直接把槽位钻石放上去。
         */
        operations.push({
          trayBlock,
          targetTile,
          displacedBlock: null,
          bufferTile: null,
        });

        simulatedBlockAtTile.set(targetTile, trayBlock);
        simulatedTileOfBlock.set(trayBlock, targetTile);
        continue;
      }

      /**
       * 如果目标格已经是正确钻石，就不需要也不能覆盖。
       */
      if (occupant.color === targetTile.color) {
        continue;
      }

      /**
       * 目标格被错误钻石占着：
       * 找一个上方空格把这个错误钻石挪走。
       * 这个空格不要求颜色正确，只要能腾出目标格即可。
       */
      const bufferTile = this.findBestBufferTileForDisplacedBlock(targetTile, simulatedBlockAtTile);

      if (!bufferTile) {
        continue;
      }

      operations.push({
        trayBlock,
        targetTile,
        displacedBlock: occupant,
        bufferTile,
      });

      simulatedBlockAtTile.set(bufferTile, occupant);
      simulatedTileOfBlock.set(occupant, bufferTile);

      simulatedBlockAtTile.set(targetTile, trayBlock);
      simulatedTileOfBlock.set(trayBlock, targetTile);
    }

    return operations;
  }

  /**
   * 找槽位钻石应该归位的目标格。
   *
   * 可选目标：
   * 1. tile.color === color。
   * 2. 目标格为空，或者目标格上是错误颜色钻石。
   * 3. 不覆盖已经正确归位的钻石。
   */
  private findBestTargetTileForTrayAutoSort(
    color: number,
    simulatedBlockAtTile: Map<TileState, BlockState | null>,
  ): TileState | null {
    const candidates: TileState[] = [];

    for (const row of this.tiles) {
      for (const tile of row) {
        if (!tile || tile.color !== color) {
          continue;
        }

        const block = simulatedBlockAtTile.get(tile) || null;

        /**
         * 已经正确的格子不动。
         */
        if (block && block.color === tile.color) {
          continue;
        }

        candidates.push(tile);
      }
    }

    if (candidates.length <= 0) {
      return null;
    }

    candidates.sort((a, b) => {
      const aBlock = simulatedBlockAtTile.get(a) || null;
      const bBlock = simulatedBlockAtTile.get(b) || null;

      /**
       * 空格优先，其次才是被错误钻石占着的格子。
       */
      const aOccupied = aBlock ? 1 : 0;
      const bOccupied = bBlock ? 1 : 0;

      if (aOccupied !== bOccupied) {
        return aOccupied - bOccupied;
      }

      const aPriority = this.getBoardTileAutoSortPriority(a);
      const bPriority = this.getBoardTileAutoSortPriority(b);

      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }

      if (a.row !== b.row) {
        return a.row - b.row;
      }

      return a.col - b.col;
    });

    return candidates[0];
  }

  /**
   * 给被挤出来的错误钻石找一个上方空格。
   *
   * 这个空格不要求颜色正确，只是作为缓冲位。
   * 但是不要使用即将被槽位钻石占用的 targetTile。
   */
  private findBestBufferTileForDisplacedBlock(
    targetTile: TileState,
    simulatedBlockAtTile: Map<TileState, BlockState | null>,
  ): TileState | null {
    const candidates: TileState[] = [];

    for (const row of this.tiles) {
      for (const tile of row) {
        if (!tile || tile.color <= 0 || tile === targetTile) {
          continue;
        }

        const block = simulatedBlockAtTile.get(tile) || null;

        if (block) {
          continue;
        }

        candidates.push(tile);
      }
    }

    if (candidates.length <= 0) {
      return null;
    }

    candidates.sort((a, b) => {
      /**
       * 缓冲位优先选普通空格，不强制正确。
       * 这里按从下到上、从左到右找，尽量不要干扰上方已整理区域。
       */
      if (a.row !== b.row) {
        return b.row - a.row;
      }

      return a.col - b.col;
    });

    return candidates[0];
  }

  /**
   * 托盘槽位清理优先级。
   *
   * 0 = 左右没有同色相邻，优先清理。
   * 1 = 左右有同色相邻，后清理。
   *
   * 只判断同一行内的左右相邻，不跨行判断。
   */
  private getTrayBlockCleanPriority(block: BlockState): number {
    const slotIndex = block.slot?.index;

    if (slotIndex === undefined || slotIndex === null) {
      return 0;
    }

    const row = Math.floor(slotIndex / TRAY_COLS);
    const col = slotIndex % TRAY_COLS;

    const leftSlot = col > 0 ? this.traySlots[slotIndex - 1] : null;
    const rightSlot = col < TRAY_COLS - 1 ? this.traySlots[slotIndex + 1] : null;

    const leftBlock = leftSlot && Math.floor(leftSlot.index / TRAY_COLS) === row ? leftSlot.block : null;
    const rightBlock = rightSlot && Math.floor(rightSlot.index / TRAY_COLS) === row ? rightSlot.block : null;

    const hasSameColorNeighbor = leftBlock?.color === block.color || rightBlock?.color === block.color;

    return hasSameColorNeighbor ? 1 : 0;
  }

  /**
   * 目标格排序优先级。
   *
   * 0 = 周围已有同色正确钻石，优先补这个位置。
   * 1 = 普通可整理位置。
   */
  private getBoardTileAutoSortPriority(tile: TileState): number {
    for (const [dr, dc] of CONNECTED_DIRECTIONS) {
      const near = this.tiles[tile.row + dr]?.[tile.col + dc];
      const nearBlock = near?.block;

      if (nearBlock && nearBlock.color === tile.color && nearBlock.collapsed) {
        return 0;
      }
    }

    return 1;
  }

  /**
   * 磁铁：自动整理上方棋盘。
   *
   * 重点区别：
   * - 魔法棒可以处理指定区域。
   * - 磁铁是自动挑选上方棋盘中未归位的位置，最多处理 12 个。
   * - 如果使用下面槽位里的钻石，必须把上方错误钻石换到这个槽位里，保证槽位占用数量不减少。
   */
  private autoSortBoardByMagnet(maxCount: number = MAGNET_SORT_COUNT, onComplete?: () => void): boolean {
    const operations = this.collectMagnetSortOperations(maxCount);

    if (operations.length <= 0) {
      this.showFloatingTip("无钻石可以吸附");
      return false;
    }

    this.inputLocked = true;
    this.unselectAll(false);

    for (let i = 0; i < operations.length; i++) {
      const op = operations[i];
      const delay = i * 0.05;

      if (op.fromSlot) {
        this.applyMagnetTraySwapOperation(op.trayBlock, op.fromSlot, op.targetTile, op.displacedBlock!, delay);
      } else if (op.fromTile) {
        this.applyMagnetBoardOperation(op.boardBlock, op.fromTile, op.targetTile, delay);
      }
    }

    this.scheduleOnce(
      () => {
        this.refreshTrayLayout();
        this.sortTrayBlocks();
        this.inputLocked = false;
        onComplete?.();
        this.checkWin();
      },
      0.35 + operations.length * 0.05,
    );

    return true;
  }

  /**
   * 磁铁整理操作。
   *
   * 两种情况：
   * 1. fromTile 有值：上方棋盘内移动 / 交换。
   * 2. fromSlot 有值：下面槽位钻石和上方错误钻石交换，槽位数量不减少。
   */
  private collectMagnetSortOperations(maxCount: number): Array<{
    boardBlock: BlockState | null;
    trayBlock: BlockState | null;
    fromTile: TileState | null;
    fromSlot: TraySlotState | null;
    targetTile: TileState;
    displacedBlock: BlockState | null;
  }> {
    const operations: Array<{
      boardBlock: BlockState | null;
      trayBlock: BlockState | null;
      fromTile: TileState | null;
      fromSlot: TraySlotState | null;
      targetTile: TileState;
      displacedBlock: BlockState | null;
    }> = [];

    const simulatedBlockAtTile = new Map<TileState, BlockState | null>();
    const simulatedTileOfBlock = new Map<BlockState, TileState>();
    const simulatedSlotOfBlock = new Map<BlockState, TraySlotState>();

    for (const row of this.tiles) {
      for (const tile of row) {
        if (!tile || tile.color <= 0) {
          continue;
        }

        simulatedBlockAtTile.set(tile, tile.block);

        if (tile.block) {
          simulatedTileOfBlock.set(tile.block, tile);
        }
      }
    }

    for (const slot of this.traySlots) {
      if (!this.isTraySlotActive(slot) || !slot.block) {
        continue;
      }

      simulatedSlotOfBlock.set(slot.block, slot);
    }

    const targetTiles = this.getMagnetTargetTiles(simulatedBlockAtTile);

    for (const targetTile of targetTiles) {
      if (operations.length >= maxCount) {
        break;
      }

      const currentBlock = simulatedBlockAtTile.get(targetTile) || null;

      if (currentBlock && currentBlock.color === targetTile.color) {
        continue;
      }

      const source = this.findMagnetSourceForTarget(
        targetTile,
        simulatedBlockAtTile,
        simulatedTileOfBlock,
        simulatedSlotOfBlock,
      );

      if (!source) {
        continue;
      }

      if (source.fromTile) {
        const sourceBlock = source.block;
        const occupant = simulatedBlockAtTile.get(targetTile) || null;

        operations.push({
          boardBlock: sourceBlock,
          trayBlock: null,
          fromTile: source.fromTile,
          fromSlot: null,
          targetTile,
          displacedBlock: occupant,
        });

        simulatedBlockAtTile.set(targetTile, sourceBlock);
        simulatedTileOfBlock.set(sourceBlock, targetTile);

        if (occupant) {
          simulatedBlockAtTile.set(source.fromTile, occupant);
          simulatedTileOfBlock.set(occupant, source.fromTile);
        } else {
          simulatedBlockAtTile.set(source.fromTile, null);
          simulatedTileOfBlock.delete(sourceBlock);
          simulatedTileOfBlock.set(sourceBlock, targetTile);
        }

        continue;
      }

      if (source.fromSlot) {
        const trayBlock = source.block;
        const occupant = simulatedBlockAtTile.get(targetTile) || null;

        /**
         * 下面槽位的钻石只能和上方错误钻石交换。
         * 如果目标格是空的，直接放上去会减少下面槽位数量，所以跳过。
         */
        if (!occupant || occupant.color === targetTile.color) {
          continue;
        }

        operations.push({
          boardBlock: null,
          trayBlock,
          fromTile: null,
          fromSlot: source.fromSlot,
          targetTile,
          displacedBlock: occupant,
        });

        simulatedBlockAtTile.set(targetTile, trayBlock);
        simulatedTileOfBlock.set(trayBlock, targetTile);
        simulatedSlotOfBlock.delete(trayBlock);

        simulatedSlotOfBlock.set(occupant, source.fromSlot);
        simulatedTileOfBlock.delete(occupant);
      }
    }

    return operations;
  }

  /**
   * 获取磁铁优先整理的目标格子。
   * 只挑选“当前未归位”的上方格子。
   */
  private getMagnetTargetTiles(simulatedBlockAtTile: Map<TileState, BlockState | null>): TileState[] {
    const result: TileState[] = [];

    for (const row of this.tiles) {
      for (const tile of row) {
        if (!tile || tile.color <= 0) {
          continue;
        }

        const block = simulatedBlockAtTile.get(tile) || null;

        if (block && block.color === tile.color) {
          continue;
        }

        result.push(tile);
      }
    }

    result.sort((a, b) => {
      const aPriority = this.getBoardTileAutoSortPriority(a);
      const bPriority = this.getBoardTileAutoSortPriority(b);

      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }

      const aBlock = simulatedBlockAtTile.get(a) || null;
      const bBlock = simulatedBlockAtTile.get(b) || null;

      /**
       * 被错误钻石占着的位置优先处理。
       * 这样磁铁更像“帮上方棋盘排序 12 个”。
       */
      const aOccupiedWrong = aBlock && aBlock.color !== a.color ? 0 : 1;
      const bOccupiedWrong = bBlock && bBlock.color !== b.color ? 0 : 1;

      if (aOccupiedWrong !== bOccupiedWrong) {
        return aOccupiedWrong - bOccupiedWrong;
      }

      if (a.row !== b.row) {
        return a.row - b.row;
      }

      return a.col - b.col;
    });

    return result;
  }

  /**
   * 给目标格寻找正确颜色的钻石来源。
   *
   * 优先级：
   * 1. 上方棋盘中的同色错误位置钻石。
   * 2. 下面槽位中的同色钻石，但只有目标格被错误钻石占着时才允许使用。
   */
  private findMagnetSourceForTarget(
    targetTile: TileState,
    simulatedBlockAtTile: Map<TileState, BlockState | null>,
    simulatedTileOfBlock: Map<BlockState, TileState>,
    simulatedSlotOfBlock: Map<BlockState, TraySlotState>,
  ): { block: BlockState; fromTile: TileState | null; fromSlot: TraySlotState | null } | null {
    let boardCandidate: { block: BlockState; fromTile: TileState } | null = null;

    for (const [tile, block] of simulatedBlockAtTile.entries()) {
      if (!block || tile === targetTile) {
        continue;
      }

      if (block.color !== targetTile.color) {
        continue;
      }

      /**
       * 已经正确归位的钻石不动。
       */
      if (tile.color === block.color) {
        continue;
      }

      boardCandidate = { block, fromTile: tile };
      break;
    }

    if (boardCandidate) {
      return {
        block: boardCandidate.block,
        fromTile: boardCandidate.fromTile,
        fromSlot: null,
      };
    }

    const targetOccupant = simulatedBlockAtTile.get(targetTile) || null;

    /**
     * 如果目标格是空的，不能从槽位拿钻石上去，否则会减少槽位上的钻石数量。
     */
    if (!targetOccupant || targetOccupant.color === targetTile.color) {
      return null;
    }

    let trayCandidate: { block: BlockState; fromSlot: TraySlotState } | null = null;

    for (const [block, slot] of simulatedSlotOfBlock.entries()) {
      if (!block || !slot || block.color !== targetTile.color) {
        continue;
      }

      trayCandidate = { block, fromSlot: slot };
      break;
    }

    if (!trayCandidate) {
      return null;
    }

    return {
      block: trayCandidate.block,
      fromTile: null,
      fromSlot: trayCandidate.fromSlot,
    };
  }

  /**
   * 应用上方棋盘内的磁铁整理。
   */
  private applyMagnetBoardOperation(
    block: BlockState | null,
    fromTile: TileState,
    targetTile: TileState,
    delay: number,
  ) {
    if (!block || !fromTile || !targetTile || fromTile === targetTile) {
      return;
    }

    const occupant = targetTile.block;

    if (occupant && occupant !== block) {
      /** 上方棋盘内交换。 */
      fromTile.block = occupant;
      targetTile.block = block;

      occupant.location = "board";
      occupant.row = fromTile.row;
      occupant.col = fromTile.col;
      occupant.slot = null;

      block.location = "board";
      block.row = targetTile.row;
      block.col = targetTile.col;
      block.slot = null;

      this.updateCollapse(block, false);
      this.updateCollapse(occupant, false);

      block.node.setSiblingIndex(9999);
      occupant.node.setSiblingIndex(9998);

      this.moveNode(block.node, this.getNodePositionInBlockRoot(targetTile.node), 0.24, delay, () =>
        this.updateCollapse(block, true),
      );
      this.moveNode(occupant.node, this.getNodePositionInBlockRoot(fromTile.node), 0.24, delay, () =>
        this.updateCollapse(occupant, true),
      );
      return;
    }

    /** 目标格为空，上方棋盘内移动。 */
    fromTile.block = null;
    this.moveBlockToTile(block, targetTile, delay);
  }

  /**
   * 应用下面槽位和上方棋盘的交换。
   *
   * trayBlock 上去归位，displacedBlock 下来占用原来的 fromSlot。
   * 这样槽位上的钻石数量保持不变。
   */
  private applyMagnetTraySwapOperation(
    trayBlock: BlockState | null,
    fromSlot: TraySlotState,
    targetTile: TileState,
    displacedBlock: BlockState,
    delay: number,
  ) {
    if (!trayBlock || !fromSlot || !targetTile || !displacedBlock) {
      return;
    }

    if (targetTile.block !== displacedBlock) {
      return;
    }

    fromSlot.block = displacedBlock;
    targetTile.block = trayBlock;

    displacedBlock.location = "tray";
    displacedBlock.row = -1;
    displacedBlock.col = -1;
    displacedBlock.slot = fromSlot;

    trayBlock.location = "board";
    trayBlock.row = targetTile.row;
    trayBlock.col = targetTile.col;
    trayBlock.slot = null;

    this.changeParentKeepWorldPosition(displacedBlock.node, this.trayRoot);
    this.changeParentKeepWorldPosition(trayBlock.node, this.blockRoot);

    this.updateCollapse(displacedBlock, false);
    this.updateCollapse(trayBlock, false);

    displacedBlock.node.setSiblingIndex(9998);
    trayBlock.node.setSiblingIndex(9999);

    this.moveNode(displacedBlock.node, this.getNodePositionInTrayRoot(fromSlot.node), 0.24, delay);
    this.moveNode(trayBlock.node, this.getNodePositionInBlockRoot(targetTile.node), 0.24, delay, () =>
      this.updateCollapse(trayBlock, true),
    );
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

    this.changeParentKeepWorldPosition(occupant.node, this.trayRoot);

    this.updateCollapse(occupant, false);
    occupant.node.setSiblingIndex(9999);
    this.moveNode(occupant.node, this.getNodePositionInTrayRoot(targetSlot.node), 0.22, delay);
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
    if (this.levelCompletionHandled || !this.levelData || this.blocks.length === 0) return;
    const complete = this.blocks.every((block) => block.location === "board" && block.collapsed);
    if (!complete) return;

    this.clearTutorialPresentation();
    this.levelCompletionHandled = true;
    this.timerRunning = false;
    this.inputLocked = true;
    this.resetCountdownWarning();
    if (this.messageLabel) this.messageLabel.node.active = false;

    if (this.feedRevisitChallenge) {
      // 每次真实挑战只发一次奖励；随后把下一次事件排到未来，避免重复出卡。
      const canClaimReward = FeedRevisitService.claimChallengeReward(
        FeedAcquisitionService.getContentId(),
        FeedAcquisitionService.getExtra(),
      );
      this.feedChallengeRewardGranted = canClaimReward;
      if (canClaimReward) {
        const rewardTools: ToolId[] = ["magic", "brush", "magnet"];
        const rewardTool = rewardTools[Math.floor(Math.random() * rewardTools.length)];
        this.feedChallengeRewardTool = rewardTool;
        ToolInventory.add(rewardTool, 1);
        this.refreshToolBadges();
      }
      FeedRevisitService.scheduleNextImportantEvent(FeedAcquisitionService.getContentId());
    } else if (!this.feedMode && this.levelIndex >= LAST_STANDARD_LEVEL) {
      // 正式关卡全部完成后进入重玩循环；立即保存，点击主页或直接退出也不会重复第 222 关。
      sys.localStorage.setItem(STORAGE_LEVEL_KEY, String(REPLAY_START_LEVEL));
    }
    this.openPassPanel();
  }

  private openFailPanel() {
    this.clearTutorialPresentation();
    const manager = UIManager.instance;
    if (!manager) return;

    const data = {
      level: this.levelIndex,
      bonusSeconds: this.currentReviveBonusSeconds,
      onRevive: () =>
        this.showRewardAdThenRun(() => {
          this.remainingTime += Math.max(1, this.currentReviveBonusSeconds);
          this.lastDisplayedSecond = -1;
          this.refreshTimerLabel();
          this.inputLocked = false;
          this.timerRunning = true;
          this.syncCountdownWarningState();
        }, true),
      onHome: () => {
        this.finishFeedExperience();
        void GameSceneBundle.loadScene(GameSceneName.Main);
      },
    };

    manager.open(uiName.failPanel, data, UILayer.Popup);
  }

  private openPassPanel() {
    const manager = UIManager.instance;
    if (!manager) return;

    const isRevisitChallenge = this.feedRevisitChallenge;
    const isReplayEntry = !isRevisitChallenge && this.levelIndex >= LAST_STANDARD_LEVEL;
    const data = {
      level: this.levelIndex,
      title: isRevisitChallenge ? "挑战完成" : undefined,
      levelText: isRevisitChallenge
        ? this.feedChallengeRewardGranted && this.feedChallengeRewardTool
          ? `奖励：${TOOL_DISPLAY_NAMES[this.feedChallengeRewardTool]} ×1`
          : "本期挑战已完成"
        : undefined,
      nextText: isRevisitChallenge ? "继续闯关" : isReplayEntry ? "重玩" : undefined,
      onNext: () => {
        this.finishFeedExperience();
        this.feedRevisitChallenge = false;
        this.levelIndex = isRevisitChallenge
          ? this.getStoredLevelIndex()
          : isReplayEntry
            ? REPLAY_START_LEVEL
            : this.levelIndex + 1;
        void this.loadLevel(this.levelIndex);
      },
      onHome: () => {
        this.finishFeedExperience();
        void GameSceneBundle.loadScene(GameSceneName.Main);
      },
    };

    manager.open(uiName.passPanel, data, UILayer.Popup);
  }

  // =========================================================
  // Beginner guide
  // =========================================================

  private ensureUnlocksForCurrentLevel() {
    if (this.feedRevisitChallenge) {
      // 每日挑战临时开放全部道具，不改动正式关卡的永久解锁和引导进度。
      this.refreshToolBadges();
      return;
    }

    if (this.levelIndex >= 2) {
      TutorialProgress.unlockTrayExpand();
    }

    const tools: ToolId[] = ["magic", "brush", "magnet"];
    for (const tool of tools) {
      if (this.levelIndex < TOOL_UNLOCK_LEVELS[tool]) continue;
      if (ToolInventory.grantUnlockReward(tool, TOOL_UNLOCK_REWARD_AMOUNT)) {
        this.pendingToolRewardAnimations.add(tool);
      } else {
        ToolInventory.unlock(tool);
        if (
          ToolInventory.isUnlockRewardGranted(tool) &&
          !ToolInventory.isUnlockRewardPresented(tool) &&
          !ToolInventory.isGuideDone(tool)
        ) {
          this.pendingToolRewardAnimations.add(tool);
        }
      }
    }
    this.refreshToolBadges();
  }

  private hasPendingTutorialForCurrentLevel(): boolean {
    if (this.feedRevisitChallenge) return false;
    if (this.levelIndex === 1 && !TutorialProgress.isCoreGuideDone()) return true;
    if (this.levelIndex === 2 && !TutorialProgress.isTrayExpandGuideDone()) return true;

    const tools: ToolId[] = ["magic", "brush", "magnet"];
    return tools.some(
      (tool) =>
        this.levelIndex >= TOOL_UNLOCK_LEVELS[tool] &&
        ToolInventory.isUnlocked(tool) &&
        !ToolInventory.isGuideDone(tool),
    );
  }

  private refreshTutorialTimerGate() {
    this.tutorialTimerGateActive = this.hasPendingTutorialForCurrentLevel();
    this.setTimerPanelVisible(!this.tutorialTimerGateActive);
    this.syncCountdownWarningState(false);
  }

  private setTimerPanelVisible(visible: boolean) {
    const timerNode = this.timerLabel?.node;
    if (!timerNode?.isValid) return;
    const timerPanel = timerNode.parent?.name === "TimerPanel" ? timerNode.parent : timerNode;
    if (timerPanel?.isValid) timerPanel.active = visible;
  }

  private tryStartTutorialForCurrentLevel() {
    if (
      !this.node?.isValid ||
      !this.levelData ||
      this.levelCompletionHandled ||
      this.settingsOpen ||
      this.inputLocked ||
      this.feedRevisitChallenge ||
      this.tutorialStep !== "none" ||
      this.tutorialTransitioning
    ) {
      return;
    }

    if (this.feedAcquisition && !this.feedHasStarted) {
      return;
    }

    if (this.levelIndex === 1 && !TutorialProgress.isCoreGuideDone()) {
      this.startCoreTutorial();
      return;
    }

    if (
      this.levelIndex === 2 &&
      !TutorialProgress.isTrayExpandGuideDone() &&
      this.getAllTrayBlocksForClean().length > 0
    ) {
      this.startTrayExpandTutorial();
      return;
    }

    const tools: ToolId[] = ["magic", "brush", "magnet"];
    /**
     * 直接跳关或清空测试存档时，旧教学可能仍未完成。当前关新解锁的道具
     * 必须优先展示，否则第 5 关会先补魔法棒、第 7 关会先补扫把，看起来就像
     * 本关道具引导没有触发。正常顺序游玩时这个排序不会改变已有流程。
     */
    tools.sort((a, b) => {
      const aUnlocksNow = TOOL_UNLOCK_LEVELS[a] === this.levelIndex ? 0 : 1;
      const bUnlocksNow = TOOL_UNLOCK_LEVELS[b] === this.levelIndex ? 0 : 1;
      return aUnlocksNow - bUnlocksNow || TOOL_UNLOCK_LEVELS[a] - TOOL_UNLOCK_LEVELS[b];
    });
    for (const tool of tools) {
      if (
        this.levelIndex < TOOL_UNLOCK_LEVELS[tool] ||
        !ToolInventory.isUnlocked(tool) ||
        ToolInventory.isGuideDone(tool)
      ) {
        continue;
      }

      if (tool === "brush" && !this.hasBrushGuideOpportunity()) {
        /**
         * 扫把只有在托盘里存在可放回的宝石时才能演示实际效果，但首次解锁奖励
         * 不应因此被延后。第五关先展示领取弹窗；领取完成后恢复游戏，等玩家把
         * 宝石放进托盘，moveBoardBlocksToTray 会再次检查并启动按钮教学。
         */
        if (this.pendingToolRewardAnimations.has(tool)) {
          this.startToolButtonTutorial(tool, true);
          return;
        }
        continue;
      }

      this.startToolButtonTutorial(tool);
      return;
    }
  }

  private startCoreTutorial() {
    const candidates = this.blocks
      .filter((block) => block.location === "board" && !block.collapsed)
      .sort((a, b) => a.col - b.col || a.row - b.row);
    const firstSeed = candidates[0];
    if (!firstSeed) {
      this.failOpenCoreTutorial("没有找到第一组可移动宝石");
      return;
    }

    const firstGroup = this.getConnectedBlocks(firstSeed.row, firstSeed.col, firstSeed.color);
    const firstIds = new Set(firstGroup.map((block) => block.id));
    const secondSeed = candidates.find((block) => !firstIds.has(block.id));
    const secondGroup = secondSeed
      ? this.getConnectedBlocks(secondSeed.row, secondSeed.col, secondSeed.color)
      : [];
    const allTiles = this.getAllTiles();
    const secondTargetCount = allTiles.filter((tile) => tile.color === secondSeed?.color).length;
    const firstTargetCount = allTiles.filter((tile) => tile.color === firstSeed.color).length;

    if (
      firstGroup.length <= 0 ||
      secondGroup.length <= 0 ||
      firstGroup.length > TRAY_COLS ||
      firstSeed.color === secondSeed?.color ||
      firstTargetCount < firstGroup.length ||
      secondTargetCount < secondGroup.length
    ) {
      this.failOpenCoreTutorial("第一关数据不符合两组交换教学条件");
      return;
    }

    this.tutorialFirstColor = firstSeed.color;
    this.tutorialSecondColor = secondSeed!.color;
    this.tutorialFirstBlockIds = new Set(firstGroup.map((block) => block.id));
    this.tutorialSecondBlockIds = new Set(secondGroup.map((block) => block.id));
    this.setTutorialStep("core_select_first");
  }

  private failOpenCoreTutorial(reason: string) {
    console.warn(`[gameScene] 跳过第一关新手引导：${reason}`);
    TutorialProgress.completeCoreGuide();
    this.clearTutorialPresentation();
    this.refreshTutorialTimerGate();
  }

  private setTutorialStep(step: TutorialStep) {
    this.beginTutorialStep(step);
    this.showCurrentTutorialStep();
  }

  /** 引导步骤及其奖励/切换动画期间，关卡时间和倒计时警告都暂停。 */
  private beginTutorialStep(step: TutorialStep) {
    this.tutorialStep = step;
    this.tutorialPaused = step !== "none";
    this.tutorialTransitioning = false;
    if (step !== "none") {
      this.disableMapInputForTutorial();
      this.syncCountdownWarningState(false);
    }
  }

  private showCurrentTutorialStep() {
    if (!this.isCoreTutorialStep(this.tutorialStep)) return;

    let targets: Node[] = [];
    let text = "";
    switch (this.tutorialStep) {
      case "core_select_first":
        targets = this.blocks
          .filter(
            (block) =>
              block.location === "board" &&
              !block.collapsed &&
              this.tutorialFirstBlockIds.has(block.id),
          )
          .map((block) => block.node);
        text = "点击这组同色宝石，一次可以拿起整组";
        break;
      case "core_store_first":
        targets = this.traySlots
          .filter((slot) => this.isTraySlotActive(slot) && !slot.block)
          .slice(0, 1)
          .map((slot) => slot.node);
        text = "点击下方空格，先把宝石暂存在托盘";
        break;
      case "core_select_second":
        targets = this.blocks
          .filter(
            (block) =>
              block.location === "board" &&
              !block.collapsed &&
              this.tutorialSecondBlockIds.has(block.id),
          )
          .map((block) => block.node);
        text = "再点击另一组同色宝石";
        break;
      case "core_place_second":
        targets = this.getAllTiles()
          .filter((tile) => !tile.block && tile.color === this.tutorialSecondColor)
          .map((tile) => tile.node);
        text = "点击相同颜色的空位，把宝石放回去";
        break;
      case "core_select_tray":
        targets = this.blocks
          .filter((block) => block.location === "tray" && this.tutorialFirstBlockIds.has(block.id))
          .map((block) => block.node);
        text = "托盘里的宝石也能再次选中";
        break;
      case "core_place_last":
        targets = this.getAllTiles()
          .filter((tile) => !tile.block && tile.color === this.tutorialFirstColor)
          .map((tile) => tile.node);
        text = "把最后一组放回对应颜色，完成关卡";
        break;
      default:
        return;
    }

    const proxy = this.createTutorialTargetProxy(targets);
    const guideRoot = this.getGuideRoot();
    if (!proxy || !guideRoot) {
      this.failOpenCoreTutorial("引导目标节点不存在");
      return;
    }

    const expectedStep = this.tutorialStep;
    const visualToken = ++this.tutorialVisualToken;
    void GuideOverlay.showClick({
      root: guideRoot,
      target: proxy,
      name: GUIDE_ROOT_NAME,
      text,
      holePadding: new Vec2(12, 12),
      touchPadding: new Vec2(8, 8),
      fingerOffset: new Vec2(2, -2),
      onTargetTap: () => this.performCoreTutorialAction(expectedStep),
    })
      .then((guide) => {
        if (!guide && this.tutorialVisualToken === visualToken && this.tutorialStep === expectedStep) {
          this.failOpenCoreTutorial("引导视觉层创建失败");
        }
      })
      .catch((err) => {
        console.warn("[gameScene] 第一关引导视觉异常", err);
        if (this.tutorialVisualToken === visualToken && this.tutorialStep === expectedStep) {
          this.failOpenCoreTutorial("引导视觉层运行异常");
        }
      });
  }

  /**
   * 引导遮罩在独立的最高层 Canvas 中，不能稳定地把触摸穿透给场景节点。
   * 因此由引导目标区域接收点击，再调用与真实节点完全相同的业务入口。
   */
  private performCoreTutorialAction(expectedStep: TutorialStep) {
    if (
      this.tutorialStep !== expectedStep ||
      !this.isCoreTutorialStep(expectedStep) ||
      this.tutorialTransitioning
    ) {
      return;
    }

    if (expectedStep === "core_select_first") {
      const block = this.blocks.find(
        (item) =>
          item.location === "board" &&
          !item.collapsed &&
          this.tutorialFirstBlockIds.has(item.id),
      );
      if (block) this.onBlockClicked(block);
      return;
    }

    if (expectedStep === "core_store_first") {
      const slot = this.traySlots.find(
        (item) => this.isTraySlotActive(item) && !item.block,
      );
      if (slot) this.onTraySlotClicked(slot);
      return;
    }

    if (expectedStep === "core_select_second") {
      const block = this.blocks.find(
        (item) =>
          item.location === "board" &&
          !item.collapsed &&
          this.tutorialSecondBlockIds.has(item.id),
      );
      if (block) this.onBlockClicked(block);
      return;
    }

    if (expectedStep === "core_place_second") {
      const tile = this.findTutorialPlacementTile(this.tutorialSecondColor);
      if (tile) this.onTileClicked(tile);
      return;
    }

    if (expectedStep === "core_select_tray") {
      const block = this.blocks.find(
        (item) =>
          item.location === "tray" && this.tutorialFirstBlockIds.has(item.id),
      );
      if (block) this.onBlockClicked(block);
      return;
    }

    if (expectedStep === "core_place_last") {
      const tile = this.findTutorialPlacementTile(this.tutorialFirstColor);
      if (tile) this.onTileClicked(tile);
    }
  }

  private findTutorialPlacementTile(color: number): TileState | null {
    const candidates = this.getAllTiles().filter(
      (tile) => !tile.block && tile.color === color,
    );
    const selectedCount = this.selectedBlocks.filter(
      (block) => block.color === color,
    ).length;
    if (selectedCount <= 1) return candidates[0] ?? null;

    return (
      candidates.find(
        (tile) =>
          this.getConnectedEmptyTiles(tile.row, tile.col, color).length >=
          selectedCount,
      ) ??
      candidates[0] ??
      null
    );
  }

  private isCoreTutorialStep(step: TutorialStep): boolean {
    return step.startsWith("core_");
  }

  private getAllTiles(): TileState[] {
    const result: TileState[] = [];
    for (const row of this.tiles) {
      result.push(...row);
    }
    return result;
  }

  private isTutorialBlockAllowed(block: BlockState): boolean {
    if (this.tutorialStep === "none") return true;
    if (this.tutorialTransitioning || !block) return false;

    if (this.tutorialStep === "core_select_first") {
      return block.location === "board" && !block.collapsed && this.tutorialFirstBlockIds.has(block.id);
    }
    if (this.tutorialStep === "core_select_second") {
      return block.location === "board" && !block.collapsed && this.tutorialSecondBlockIds.has(block.id);
    }
    if (this.tutorialStep === "core_select_tray") {
      return block.location === "tray" && this.tutorialFirstBlockIds.has(block.id);
    }
    return false;
  }

  private isTutorialTraySlotAllowed(slot: TraySlotState): boolean {
    if (this.tutorialStep === "none") return true;
    if (this.tutorialTransitioning) return false;
    return this.tutorialStep === "core_store_first" && this.isTraySlotActive(slot) && !slot.block;
  }

  private isTutorialTileAllowed(tile: TileState): boolean {
    if (this.tutorialStep === "none") return true;
    if (this.tutorialTransitioning || !tile || !!tile.block) return false;
    if (this.tutorialStep === "core_place_second") {
      return tile.color === this.tutorialSecondColor;
    }
    if (this.tutorialStep === "core_place_last") {
      return tile.color === this.tutorialFirstColor;
    }
    return false;
  }

  private onTutorialBlockSelectionCompleted(block: BlockState) {
    if (this.tutorialTransitioning) return;

    if (
      this.tutorialStep === "core_select_first" &&
      block.location === "board" &&
      this.selectedBlocks.length > 0 &&
      this.selectedBlocks.every(
        (selected) => selected.location === "board" && this.tutorialFirstBlockIds.has(selected.id),
      )
    ) {
      this.setTutorialStep("core_store_first");
      return;
    }

    if (
      this.tutorialStep === "core_select_second" &&
      block.location === "board" &&
      this.selectedBlocks.length > 0 &&
      this.selectedBlocks.every(
        (selected) => selected.location === "board" && this.tutorialSecondBlockIds.has(selected.id),
      )
    ) {
      this.setTutorialStep("core_place_second");
      return;
    }

    if (
      this.tutorialStep === "core_select_tray" &&
      block.location === "tray" &&
      this.selectedBlocks.length > 0 &&
      this.selectedBlocks.every(
        (selected) => selected.location === "tray" && this.tutorialFirstBlockIds.has(selected.id),
      )
    ) {
      this.setTutorialStep("core_place_last");
    }
  }

  private onTutorialTrayMoveCompleted() {
    if (this.tutorialStep !== "core_store_first") return;
    const firstBlocks = this.blocks.filter((block) => this.tutorialFirstBlockIds.has(block.id));
    if (firstBlocks.length > 0 && firstBlocks.every((block) => block.location === "tray")) {
      this.setTutorialStep("core_select_second");
    }
  }

  private onTutorialTileMoveCompleted() {
    if (this.tutorialStep === "core_place_second") {
      const secondBlocks = this.blocks.filter((block) => this.tutorialSecondBlockIds.has(block.id));
      if (
        secondBlocks.length > 0 &&
        secondBlocks.every((block) => block.location === "board" && block.collapsed)
      ) {
        this.setTutorialStep("core_select_tray");
      }
      return;
    }

    if (this.tutorialStep === "core_place_last") {
      const firstBlocks = this.blocks.filter((block) => this.tutorialFirstBlockIds.has(block.id));
      if (
        firstBlocks.length > 0 &&
        firstBlocks.every((block) => block.location === "board" && block.collapsed)
      ) {
        TutorialProgress.completeCoreGuide();
        this.finishTutorialStep();
      }
    }
  }

  private startTrayExpandTutorial() {
    // 第2关先隐藏“+”，玩家第一次把宝石放入托盘后再显示并聚光。
    this.refreshAddTrayButton();
    if (!this.addTrayBtn?.node?.isValid || !this.addTrayBtn.node.active) {
      TutorialProgress.completeTrayExpandGuide();
      this.refreshTutorialTimerGate();
      return;
    }

    this.beginTutorialStep("tray_expand");
    const guideRoot = this.getGuideRoot();
    if (!guideRoot) {
      TutorialProgress.completeTrayExpandGuide();
      this.finishTutorialStep();
      return;
    }

    const visualToken = ++this.tutorialVisualToken;
    void GuideOverlay.showClick({
      root: guideRoot,
      target: this.addTrayBtn.node,
      name: GUIDE_ROOT_NAME,
      text: "托盘空间不够时可以扩格，本关第一次免费",
      holePadding: new Vec2(22, 18),
      touchPadding: new Vec2(16, 12),
      fingerOffset: new Vec2(8, -5),
      onTargetTap: () => {
        if (this.tutorialStep === "tray_expand") this.onAddTrayClicked();
      },
    })
      .then((guide) => {
        if (
          !guide &&
          this.tutorialVisualToken === visualToken &&
          this.tutorialStep === "tray_expand"
        ) {
          TutorialProgress.completeTrayExpandGuide();
          this.finishTutorialStep();
        }
      })
      .catch((err) => {
        console.warn("[gameScene] 扩格引导视觉异常", err);
        if (this.tutorialVisualToken === visualToken && this.tutorialStep === "tray_expand") {
          TutorialProgress.completeTrayExpandGuide();
          this.finishTutorialStep();
        }
      });
  }

  private isLevel2FreeExpandAvailable(): boolean {
    return (
      this.levelIndex === 2 &&
      !TutorialProgress.isTrayExpandGuideDone() &&
      this.activeTrayRows < MAX_TRAY_ROWS
    );
  }

  private hasBrushGuideOpportunity(): boolean {
    const trayBlocks = this.getAllTrayBlocksForClean();
    return trayBlocks.length > 0 && this.collectTrayAutoSortOperations(trayBlocks).length > 0;
  }

  private startToolButtonTutorial(tool: ToolId, deferButtonGuide = false) {
    const target = this.getToolButton(tool)?.node;
    if (!target?.isValid) {
      this.skipToolTutorial(tool);
      return;
    }

    const step: TutorialStep =
      tool === "magic" ? "magic_button" : tool === "brush" ? "brush_button" : "magnet_button";
    this.beginTutorialStep(step);

    if (this.pendingToolRewardAnimations.has(tool)) {
      this.playToolUnlockReward(tool, target, () => {
        if (deferButtonGuide) {
          this.finishTutorialStep();
          return;
        }
        this.showToolButtonTutorial(tool, target);
      });
      return;
    }
    if (deferButtonGuide) {
      this.finishTutorialStep();
      return;
    }
    this.showToolButtonTutorial(tool, target);
  }

  private showToolButtonTutorial(tool: ToolId, target: Node) {
    if (this.tutorialStep === "none") return;
    if (!target?.isValid) {
      this.skipToolTutorial(tool);
      return;
    }
    this.tutorialTransitioning = false;
    const guideRoot = this.getGuideRoot();
    if (!guideRoot) {
      this.skipToolTutorial(tool);
      return;
    }

    const text =
      tool === "magic"
        ? "点击魔法棒，再拖动3×3选框整理宝石"
        : tool === "brush"
          ? "点击扫把，把托盘中的宝石自动放回去"
          : "点击磁铁，自动整理棋盘中的12颗宝石";
    const expectedStep = this.tutorialStep;
    const visualToken = ++this.tutorialVisualToken;
    void GuideOverlay.showClick({
      root: guideRoot,
      target,
      name: GUIDE_ROOT_NAME,
      text,
      holePadding: new Vec2(20, 22),
      touchPadding: new Vec2(14, 14),
      fingerOffset: new Vec2(10, -8),
      onTargetTap: () => {
        if (this.tutorialStep !== expectedStep) return;
        if (tool === "magic") this.onMagicClicked();
        else if (tool === "brush") this.onBrushClicked();
        else this.onMagnetClicked();
      },
    })
      .then((guide) => {
        if (!guide && this.tutorialVisualToken === visualToken && this.tutorialStep === expectedStep) {
          this.skipToolTutorial(tool);
        }
      })
      .catch((err) => {
        console.warn(`[gameScene] ${TOOL_DISPLAY_NAMES[tool]}按钮引导视觉异常`, err);
        if (this.tutorialVisualToken === visualToken && this.tutorialStep === expectedStep) {
          this.skipToolTutorial(tool);
        }
      });
  }

  private skipToolTutorial(tool: ToolId) {
    if (tool === "magic" && this.magicSelecting) {
      this.magicSelecting = false;
      this.magicUses = ToolInventory.getCount("magic");
      if (this.magicAreaNode?.isValid) this.magicAreaNode.active = false;
      if (this.messageLabel) this.messageLabel.node.active = false;
    }
    ToolInventory.markGuideDone(tool);
    this.pendingToolRewardAnimations.delete(tool);
    this.refreshToolBadges();
    this.finishTutorialStep();
  }

  private isToolActionAllowed(tool: ToolId): boolean {
    if (!this.isToolUnlocked(tool)) {
      this.showFloatingTip(`第${TOOL_UNLOCK_LEVELS[tool]}关解锁${TOOL_DISPLAY_NAMES[tool]}`);
      return false;
    }
    if (this.tutorialTransitioning) return false;
    if (this.tutorialStep === "none") return true;
    return (
      (tool === "magic" && this.tutorialStep === "magic_button") ||
      (tool === "brush" && this.tutorialStep === "brush_button") ||
      (tool === "magnet" && this.tutorialStep === "magnet_button")
    );
  }

  /** 每日复访挑战绕过正式进度锁，但不把临时权限写入 ToolInventory。 */
  private isToolUnlocked(tool: ToolId): boolean {
    return this.feedRevisitChallenge || ToolInventory.isUnlocked(tool);
  }

  private isActiveToolTutorial(tool: ToolId): boolean {
    return (
      (tool === "magic" && (this.tutorialStep === "magic_button" || this.tutorialStep === "magic_drag")) ||
      (tool === "brush" && this.tutorialStep === "brush_button") ||
      (tool === "magnet" && this.tutorialStep === "magnet_button")
    );
  }

  private getToolButton(tool: ToolId): Button | null {
    if (tool === "magic") return this.magicBtn;
    if (tool === "brush") return this.clearBtn;
    return this.magnetBtn;
  }

  private startMagicDragTutorial() {
    if (!this.magicAreaNode?.isValid) {
      this.skipToolTutorial("magic");
      return;
    }

    const target = this.findBestMagicGuideTarget();
    if (!target) {
      this.skipToolTutorial("magic");
      return;
    }

    this.beginTutorialStep("magic_drag");
    this.tutorialMagicTarget = { row: target.row, col: target.col };
    const start = this.findMagicGuideStart(target);
    this.magicAreaStartCenter = { row: start.row, col: start.col };
    this.moveMagicAreaTo(start.row, start.col);
    if (this.messageLabel) this.messageLabel.node.active = false;
    this.showMagicDragTutorial();
  }

  private showMagicDragTutorial() {
    if (
      this.tutorialStep !== "magic_drag" ||
      !this.magicAreaNode?.isValid ||
      !this.tutorialMagicTarget
    ) {
      return;
    }

    const endTile = this.tiles[this.tutorialMagicTarget.row]?.[this.tutorialMagicTarget.col];
    const guideRoot = this.getGuideRoot();
    const interactionTarget = endTile?.node?.isValid
      ? this.createTutorialTargetProxy([this.magicAreaNode, endTile.node])
      : null;
    if (!endTile?.node?.isValid || !guideRoot || !interactionTarget?.isValid) {
      this.skipToolTutorial("magic");
      return;
    }

    const expectedTarget = { ...this.tutorialMagicTarget };
    const visualToken = ++this.tutorialVisualToken;
    void GuideOverlay.showDrag({
      root: guideRoot,
      startTarget: this.magicAreaNode,
      endTarget: endTile.node,
      interactionTarget,
      name: GUIDE_ROOT_NAME,
      text: "按住3×3选框，拖到高亮区域后松手",
      holePadding: new Vec2(12, 12),
      touchPadding: new Vec2(8, 8),
      dragDuration: 0.9,
      onTargetTouchStart: (event) => {
        if (this.tutorialStep === "magic_drag") this.onMagicAreaTouchStart(event);
      },
      onTargetTouchMove: (event) => {
        if (this.tutorialStep === "magic_drag") this.onMagicAreaTouchMove(event);
      },
      onTargetTouchEnd: (event) => {
        if (this.tutorialStep === "magic_drag") this.onMagicAreaTouchEnd(event);
      },
      onTargetTouchCancel: (event) => {
        if (this.tutorialStep === "magic_drag") this.onMagicAreaTouchEnd(event);
      },
    })
      .then((guide) => {
        if (
          !guide &&
          this.tutorialVisualToken === visualToken &&
          this.tutorialStep === "magic_drag" &&
          this.tutorialMagicTarget?.row === expectedTarget.row &&
          this.tutorialMagicTarget?.col === expectedTarget.col
        ) {
          this.skipToolTutorial("magic");
        }
      })
      .catch((err) => {
        console.warn("[gameScene] 魔法棒拖动引导视觉异常", err);
        if (this.tutorialVisualToken === visualToken && this.tutorialStep === "magic_drag") {
          this.skipToolTutorial("magic");
        }
      });
  }

  private findBestMagicGuideTarget(): TileState | null {
    let best: TileState | null = null;
    let bestScore = 0;
    for (const row of this.tiles) {
      for (const tile of row) {
        if (!tile || tile.color <= 0) continue;
        const area = this.getMagicAreaTiles(tile.row, tile.col);
        const wrongCount = area.filter(
          (areaTile) => !areaTile.block || areaTile.block.color !== areaTile.color,
        ).length;
        const score = wrongCount * 100 + area.length;
        if (wrongCount > 0 && score > bestScore) {
          best = tile;
          bestScore = score;
        }
      }
    }
    return best;
  }

  private findMagicGuideStart(target: TileState): TileState {
    let result = target;
    let farthest = -1;
    for (const row of this.tiles) {
      for (const tile of row) {
        if (!tile || tile.color <= 0) continue;
        const dr = tile.row - target.row;
        const dc = tile.col - target.col;
        const distance = dr * dr + dc * dc;
        if (distance > farthest) {
          result = tile;
          farthest = distance;
        }
      }
    }
    return result;
  }

  private completeToolTutorial(tool: ToolId) {
    const matchesStep =
      (tool === "magic" && this.tutorialStep === "magic_drag") ||
      (tool === "brush" && this.tutorialStep === "brush_button") ||
      (tool === "magnet" && this.tutorialStep === "magnet_button");
    if (!matchesStep) return;

    ToolInventory.markGuideDone(tool);
    this.pendingToolRewardAnimations.delete(tool);
    this.tutorialMagicTarget = null;
    this.refreshToolBadges();
    this.finishTutorialStep();
  }

  private finishTutorialStep() {
    this.clearTutorialPresentation();
    this.refreshTutorialTimerGate();
    this.scheduleOnce(() => this.tryStartTutorialForCurrentLevel(), 0.25);
  }

  private playToolUnlockReward(tool: ToolId, target: Node, onFinish: () => void) {
    const guideRoot = this.getGuideRoot();
    const rootTransform = guideRoot?.getComponent(UITransform);
    const targetTransform = target.getComponent(UITransform);
    if (!guideRoot || !rootTransform || !targetTransform) {
      this.pendingToolRewardAnimations.delete(tool);
      onFinish();
      return;
    }

    this.tutorialTransitioning = true;
    GuideOverlay.hide(guideRoot, GUIDE_ROOT_NAME);
    this.destroyToolRewardNode();

    const rootWidth = Math.max(1, rootTransform.width);
    const rootHeight = Math.max(1, rootTransform.height);
    const rewardRoot = this.createNode(GUIDE_REWARD_NAME, guideRoot, rootWidth, rootHeight);
    rewardRoot.setSiblingIndex(guideRoot.children.length - 1);
    rewardRoot.addComponent(BlockInputEvents);
    const shade = rewardRoot.addComponent(Graphics);
    shade.fillColor = new Color(0, 0, 0, 188);
    shade.rect(
      -rootWidth * rootTransform.anchorX,
      -rootHeight * rootTransform.anchorY,
      rootWidth,
      rootHeight,
    );
    shade.fill();

    /**
     * 以 750×1334 为基准做统一缩放，横竖屏或较窄设备只缩小整张卡片，
     * 不单独拉伸宽高。卡片内的图标还会按 SpriteFrame 实际裁剪区域二次等比适配。
     */
    const baseCardWidth = 560;
    const baseCardHeight = 420;
    const layoutScale = Math.max(
      0.01,
      Math.min(1, (rootWidth * 0.9) / baseCardWidth, (rootHeight * 0.84) / baseCardHeight),
    );
    const cardWidth = baseCardWidth * layoutScale;
    const cardHeight = baseCardHeight * layoutScale;
    const card = this.createNode("Card", rewardRoot, cardWidth, cardHeight);
    card.setPosition(0, Math.min(44, rootHeight * 0.035), 0);
    const cardGraphics = card.addComponent(Graphics);
    cardGraphics.fillColor = new Color(249, 244, 255, 255);
    cardGraphics.strokeColor = new Color(128, 87, 174, 255);
    cardGraphics.lineWidth = Math.max(3, 5 * layoutScale);
    cardGraphics.roundRect(
      -cardWidth * 0.5,
      -cardHeight * 0.5,
      cardWidth,
      cardHeight,
      30 * layoutScale,
    );
    cardGraphics.fill();
    cardGraphics.stroke();

    const headerHeight = 68 * layoutScale;
    const header = this.createNode("Header", card, cardWidth - 34 * layoutScale, headerHeight);
    header.setPosition(0, cardHeight * 0.5 - 18 * layoutScale - headerHeight * 0.5, 0);
    const headerGraphics = header.addComponent(Graphics);
    headerGraphics.fillColor = new Color(112, 78, 157, 255);
    headerGraphics.roundRect(
      -(cardWidth - 34 * layoutScale) * 0.5,
      -headerHeight * 0.5,
      cardWidth - 34 * layoutScale,
      headerHeight,
      15 * layoutScale,
    );
    headerGraphics.fill();

    const titleNode = this.createNode("Title", header, cardWidth - 76 * layoutScale, 52 * layoutScale);
    const titleLabel = titleNode.addComponent(Label);
    titleLabel.string = TOOL_DISPLAY_NAMES[tool];
    titleLabel.fontSize = Math.max(22, Math.round(34 * layoutScale));
    titleLabel.lineHeight = Math.max(28, Math.round(43 * layoutScale));
    titleLabel.color = Color.WHITE;
    titleLabel.horizontalAlign = HorizontalTextAlignment.CENTER;
    titleLabel.verticalAlign = VerticalTextAlignment.CENTER;
    titleLabel.overflow = Label.Overflow.SHRINK;

    const iconSource =
      this.findDeepChild(target, "MagicTool")?.getComponent(Sprite) ||
      target.getComponentInChildren(Sprite);
    const iconFrame = iconSource?.spriteFrame || this.lockFrame;
    const iconPlateWidth = 150 * layoutScale;
    const iconPlateHeight = 132 * layoutScale;
    const iconPlate = this.createNode("IconPlate", card, iconPlateWidth, iconPlateHeight);
    iconPlate.setPosition(0, 55 * layoutScale, 0);
    const iconPlateGraphics = iconPlate.addComponent(Graphics);
    iconPlateGraphics.fillColor = new Color(231, 222, 241, 255);
    iconPlateGraphics.strokeColor = new Color(198, 181, 219, 255);
    iconPlateGraphics.lineWidth = Math.max(2, 3 * layoutScale);
    iconPlateGraphics.roundRect(
      -iconPlateWidth * 0.5,
      -iconPlateHeight * 0.5,
      iconPlateWidth,
      iconPlateHeight,
      18 * layoutScale,
    );
    iconPlateGraphics.fill();
    iconPlateGraphics.stroke();

    const cardIcon = this.createNode("RewardIcon", iconPlate, 1, 1);
    this.fitToolRewardIcon(cardIcon, iconFrame, 112 * layoutScale, 104 * layoutScale);

    const descriptionNode = this.createNode(
      "Description",
      card,
      cardWidth - 70 * layoutScale,
      68 * layoutScale,
    );
    descriptionNode.setPosition(0, -49 * layoutScale, 0);
    const descriptionLabel = descriptionNode.addComponent(Label);
    descriptionLabel.string = TOOL_REWARD_DESCRIPTIONS[tool];
    descriptionLabel.fontSize = Math.max(18, Math.round(25 * layoutScale));
    descriptionLabel.lineHeight = Math.max(24, Math.round(33 * layoutScale));
    descriptionLabel.color = new Color(85, 65, 105, 255);
    descriptionLabel.horizontalAlign = HorizontalTextAlignment.CENTER;
    descriptionLabel.verticalAlign = VerticalTextAlignment.CENTER;
    descriptionLabel.overflow = Label.Overflow.SHRINK;
    descriptionLabel.enableWrapText = true;

    const claimWidth = 310 * layoutScale;
    const claimHeight = 74 * layoutScale;
    const claimNode = this.createNode("ClaimButton", card, claimWidth, claimHeight);
    claimNode.setPosition(0, -145 * layoutScale, 0);
    const claimGraphics = claimNode.addComponent(Graphics);
    claimGraphics.fillColor = new Color(67, 190, 91, 255);
    claimGraphics.strokeColor = new Color(221, 255, 206, 255);
    claimGraphics.lineWidth = Math.max(2, 3 * layoutScale);
    claimGraphics.roundRect(
      -claimWidth * 0.5,
      -claimHeight * 0.5,
      claimWidth,
      claimHeight,
      claimHeight * 0.22,
    );
    claimGraphics.fill();
    claimGraphics.stroke();
    const claimButton = claimNode.addComponent(Button);

    const claimLabelNode = this.createNode(
      "Label",
      claimNode,
      claimWidth - 28 * layoutScale,
      claimHeight - 12 * layoutScale,
    );
    const claimLabel = claimLabelNode.addComponent(Label);
    claimLabel.string = `免费获得 ×${TOOL_UNLOCK_REWARD_AMOUNT}`;
    claimLabel.fontSize = Math.max(20, Math.round(29 * layoutScale));
    claimLabel.lineHeight = Math.max(26, Math.round(37 * layoutScale));
    claimLabel.color = Color.WHITE;
    claimLabel.horizontalAlign = HorizontalTextAlignment.CENTER;
    claimLabel.verticalAlign = VerticalTextAlignment.CENTER;
    claimLabel.overflow = Label.Overflow.SHRINK;

    // 奖励已提前安全落盘；弹窗期间先隐藏角标，飞入按钮后再展示最终数量。
    const countBadge = target.getChildByName("CountBadge");
    if (countBadge) countBadge.active = false;

    let claimed = false;
    claimNode.on(Button.EventType.CLICK, () => {
      if (claimed || !rewardRoot.isValid || this.tutorialStep === "none") return;
      claimed = true;
      claimButton.interactable = false;

      const cardIconTransform = cardIcon.getComponent(UITransform);
      const targetIconTransform = iconSource?.node.getComponent(UITransform) || targetTransform;
      if (!cardIconTransform || !targetIconTransform) {
        ToolInventory.markUnlockRewardPresented(tool);
        this.pendingToolRewardAnimations.delete(tool);
        this.refreshToolBadges();
        this.destroyToolRewardNode();
        this.tutorialTransitioning = false;
        onFinish();
        return;
      }

      const startWorld = cardIconTransform.convertToWorldSpaceAR(Vec3.ZERO);
      const startLocal = rootTransform.convertToNodeSpaceAR(startWorld);
      const targetWorld = targetIconTransform.convertToWorldSpaceAR(Vec3.ZERO);
      const targetLocal = rootTransform.convertToNodeSpaceAR(targetWorld);
      const flyingIcon = this.createNode("FlyingRewardIcon", rewardRoot, 1, 1);
      this.fitToolRewardIcon(
        flyingIcon,
        iconFrame,
        cardIconTransform.width,
        cardIconTransform.height,
      );
      flyingIcon.setPosition(startLocal);
      cardIcon.active = false;

      const flyingTransform = flyingIcon.getComponent(UITransform);
      const destinationScale = flyingTransform
        ? Math.max(
            0.12,
            Math.min(
              targetIconTransform.width / Math.max(1, flyingTransform.width),
              targetIconTransform.height / Math.max(1, flyingTransform.height),
            ),
          )
        : 0.45;

      tween(card)
        .to(0.16, { scale: new Vec3(0.86, 0.86, 1) }, { easing: "quadIn" })
        .call(() => {
          if (card.isValid) card.active = false;
        })
        .start();

      flyingIcon.setScale(0.82, 0.82, 1);
      tween(flyingIcon)
        .to(0.12, { scale: new Vec3(1.12, 1.12, 1) }, { easing: "backOut" })
        .to(
          0.46,
          {
            position: targetLocal,
            scale: new Vec3(destinationScale, destinationScale, 1),
          },
          { easing: "quadInOut" },
        )
        .call(() => {
          if (!this.node?.isValid || this.tutorialStep === "none") return;
          ToolInventory.markUnlockRewardPresented(tool);
          this.pendingToolRewardAnimations.delete(tool);
          this.refreshToolBadges();

          const badge = target.getChildByName("CountBadge");
          if (badge?.active) {
            const finalScale = badge.scale.clone();
            badge.setScale(finalScale.x * 0.35, finalScale.y * 0.35, finalScale.z);
            tween(badge)
              .to(0.18, { scale: finalScale }, { easing: "backOut" })
              .start();
          }

          this.destroyToolRewardNode();
          this.tutorialTransitioning = false;
          onFinish();
        })
        .start();
    });

    card.setScale(0.74, 0.74, 1);
    cardIcon.setScale(0.2, 0.2, 1);
    tween(cardIcon)
      .delay(0.1)
      .to(0.24, { scale: Vec3.ONE }, { easing: "backOut" })
      .start();
    tween(card)
      .to(0.24, { scale: new Vec3(1.04, 1.04, 1) }, { easing: "backOut" })
      .to(0.08, { scale: Vec3.ONE }, { easing: "quadOut" })
      .start();
  }

  /** 按图片实际有效区域等比缩放，避免不同道具图标被强制拉成正方形。 */
  private fitToolRewardIcon(
    node: Node,
    frame: SpriteFrame | null,
    maxWidth: number,
    maxHeight: number,
  ): Sprite {
    const transform = node.getComponent(UITransform) || node.addComponent(UITransform);
    const sprite = node.getComponent(Sprite) || node.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.trim = true;
    sprite.spriteFrame = frame;

    const sourceRect = frame?.rect;
    const sourceWidth = Math.max(1, sourceRect?.width || maxWidth);
    const sourceHeight = Math.max(1, sourceRect?.height || maxHeight);
    const scale = Math.min(
      Math.max(1, maxWidth) / sourceWidth,
      Math.max(1, maxHeight) / sourceHeight,
    );
    transform.setContentSize(sourceWidth * scale, sourceHeight * scale);
    return sprite;
  }

  private getGuideRoot(updateLayout = true): Node | null {
    /**
     * 游戏内引导必须和棋盘使用同一个 Canvas 坐标系。
     *
     * UIManager 的 GlobalCanvas 是运行时创建的常驻 Canvas；如果它没有完成
     * Camera / 屏幕原点对齐，引导节点虽然创建成功，实际位置却会偏出画面。
     * 这时教程状态已经暂停计时并限制输入，玩家看到的现象就是整关卡死。
     *
     * gameScene 本身挂在场景 Canvas 上，因此优先直接使用当前节点。只有当前
     * 场景节点不可用时，才退回全局 Guide 层。
     */
    const guideRoot = this.node?.isValid
      ? this.node
      : UIManager.instance?.getLayerNode(UILayer.Guide) || null;
    if (!guideRoot?.isValid) return null;

    const guideWidget = guideRoot.getComponent(Widget);
    if (
      updateLayout &&
      guideWidget?.isValid &&
      guideWidget.node?.isValid &&
      guideWidget.node.parent?.isValid
    ) {
      guideWidget.updateAlignment();
    }
    const guideTransform = guideRoot?.getComponent(UITransform);
    const sceneTransform = this.node?.getComponent(UITransform);
    if (
      guideTransform &&
      sceneTransform &&
      sceneTransform.width > 1 &&
      sceneTransform.height > 1 &&
      (Math.abs(guideTransform.width - sceneTransform.width) > 1 ||
        Math.abs(guideTransform.height - sceneTransform.height) > 1)
    ) {
      guideTransform.setContentSize(sceneTransform.contentSize);
    }
    return guideRoot;
  }

  private createTutorialTargetProxy(nodes: Node[]): Node | null {
    this.destroyTutorialTargetProxy();
    const guideRoot = this.getGuideRoot();
    const rootTransform = guideRoot?.getComponent(UITransform);
    if (!guideRoot || !rootTransform || nodes.length === 0) return null;

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const node of nodes) {
      const transform = node?.getComponent(UITransform);
      if (!transform || !node.isValid) continue;
      const left = -transform.width * transform.anchorX;
      const right = transform.width * (1 - transform.anchorX);
      const bottom = -transform.height * transform.anchorY;
      const top = transform.height * (1 - transform.anchorY);
      const corners = [
        new Vec3(left, bottom, 0),
        new Vec3(right, bottom, 0),
        new Vec3(right, top, 0),
        new Vec3(left, top, 0),
      ];
      for (const corner of corners) {
        const local = rootTransform.convertToNodeSpaceAR(transform.convertToWorldSpaceAR(corner));
        minX = Math.min(minX, local.x);
        minY = Math.min(minY, local.y);
        maxX = Math.max(maxX, local.x);
        maxY = Math.max(maxY, local.y);
      }
    }

    if (!Number.isFinite(minX) || maxX <= minX || maxY <= minY) return null;
    const proxy = this.createNode(GUIDE_PROXY_NAME, guideRoot, maxX - minX, maxY - minY);
    proxy.setPosition((minX + maxX) * 0.5, (minY + maxY) * 0.5, 0);
    this.tutorialTargetProxy = proxy;
    return proxy;
  }

  private destroyTutorialTargetProxy() {
    if (this.tutorialTargetProxy?.isValid) {
      this.tutorialTargetProxy.removeFromParent();
      this.tutorialTargetProxy.destroy();
    }
    this.tutorialTargetProxy = null;
  }

  private destroyToolRewardNode() {
    // 清理可能发生在场景销毁阶段，此时 Widget 的父节点已经为空，不能再刷新布局。
    const root = this.getGuideRoot(false)?.getChildByName(GUIDE_REWARD_NAME);
    if (!root?.isValid) return;
    const stop = (node: Node) => {
      Tween.stopAllByTarget(node);
      node.children.forEach(stop);
    };
    stop(root);
    root.removeFromParent();
    root.destroy();
  }

  private disableMapInputForTutorial() {
    if (!this.mapControl || this.tutorialMapInputState) return;
    this.tutorialMapInputState = {
      pinch: this.mapControl.enablePinchZoom,
      wheel: this.mapControl.enableMouseWheelZoom,
      drag: this.mapControl.enableDrag,
    };
    this.mapControl.enablePinchZoom = false;
    this.mapControl.enableMouseWheelZoom = false;
    this.mapControl.enableDrag = false;
  }

  private restoreMapInputAfterTutorial() {
    if (!this.mapControl || !this.tutorialMapInputState) return;
    this.mapControl.enablePinchZoom = this.tutorialMapInputState.pinch;
    this.mapControl.enableMouseWheelZoom = this.tutorialMapInputState.wheel;
    this.mapControl.enableDrag = this.tutorialMapInputState.drag;
    this.tutorialMapInputState = null;
  }

  private clearTutorialPresentation(resetStep = true) {
    this.tutorialVisualToken++;
    GuideOverlay.hide(undefined, GUIDE_ROOT_NAME);
    this.destroyTutorialTargetProxy();
    this.destroyToolRewardNode();
    this.tutorialPaused = false;
    this.tutorialTransitioning = false;
    this.tutorialMagicTarget = null;
    this.restoreMapInputAfterTutorial();
    if (resetStep) {
      this.tutorialStep = "none";
      this.tutorialFirstColor = 0;
      this.tutorialSecondColor = 0;
      this.tutorialFirstBlockIds.clear();
      this.tutorialSecondBlockIds.clear();
    }
    // 下一帧由倒计时主循环根据设置、广告和前后台状态决定是否恢复。
    this.syncCountdownWarningState(false);
  }

  private onFeedStateChanged = (state: FeedAcquisitionState) => {
    this.applyFeedState(state);
    if (state.entered) {
      this.unbindFeedFallbackTouch();
    } else {
      this.bindFeedFallbackTouch();
    }
  };

  private applyFeedState(state: FeedAcquisitionState) {
    if (!this.feedMode || !this.feedSceneReady) return;

    if (state.exited) {
      if (this.feedHasStarted && !this.feedPauseApplied) {
        this.feedPauseApplied = true;
        this.inputLockedBeforeFeedPause = this.inputLocked;
        this.timerRunningBeforeFeedPause = this.timerRunning;
      }
      this.inputLocked = true;
      this.timerRunning = false;
      PlayData.Instance.ispause = true;
      this.syncCountdownWarningState(false);
      AudioManager.pauseAll();
      return;
    }

    if (!state.entered) {
      this.inputLocked = true;
      this.timerRunning = false;
      PlayData.Instance.ispause = true;
      this.syncCountdownWarningState(false);
      return;
    }

    PlayData.Instance.ispause = false;
    if (!this.feedHasStarted) {
      this.feedHasStarted = true;
      this.feedEnteredAtMs = Date.now();
      this.feedPauseApplied = false;
      this.inputLocked = false;
      this.timerRunning = true;
      this.syncCountdownWarningState();
      this.showFeedAcquisitionGuide();
      // AudioManager.playMusic(soundName.levelBgm);
      return;
    }

    if (this.feedPauseApplied) {
      this.inputLocked = this.inputLockedBeforeFeedPause;
      this.timerRunning = this.timerRunningBeforeFeedPause;
      this.feedPauseApplied = false;
      AudioManager.resumeAll();
    } else {
      this.inputLocked = false;
      this.timerRunning = true;
      // AudioManager.playMusic(soundName.levelBgm);
    }
    this.syncCountdownWarningState();
  }

  private bindFeedFallbackTouch() {
    const state = FeedAcquisitionService.getState();
    if (!this.feedMode || !this.feedSceneReady || state.entered) return;
    this.unbindFeedFallbackTouch();
    this.node.on(Node.EventType.TOUCH_START, this.onFeedFallbackTouch, this, true);
  }

  private onFeedFallbackTouch() {
    this.unbindFeedFallbackTouch();
    FeedAcquisitionService.activateFromFirstTouch();
  }

  private unbindFeedFallbackTouch() {
    this.node?.off(Node.EventType.TOUCH_START, this.onFeedFallbackTouch, this, true);
  }

  private reportFeedSceneReady() {
    if (!this.feedMode || !this.node?.isValid) return;
    FeedAcquisitionService.reportSceneReady();
  }

  private showFeedAcquisitionGuide() {
    if (!this.feedAcquisition || this.feedGuideShown) return;

    this.feedGuideShown = true;
    this.tryStartTutorialForCurrentLevel();
  }

  private finishFeedExperience() {
    if (!this.feedMode) return;

    this.clearTutorialPresentation();
    director.off(Director.EVENT_END_FRAME, this.reportFeedSceneReady, this);
    this.feedMode = false;
    this.feedAcquisition = false;
    this.feedRevisitChallenge = false;
    this.feedSceneReady = false;
    this.feedHasStarted = false;
    this.feedGuideShown = false;
    this.feedEnteredAtMs = 0;
    this.feedPauseApplied = false;
    PlayData.Instance.ispause = false;
    FeedAcquisitionService.removeListener(this.onFeedStateChanged);
    FeedAcquisitionService.completeSession();
    this.unbindFeedFallbackTouch();
  }

  private isFeedExternalUiGuardActive(): boolean {
    if (!this.feedMode) return false;
    if (!this.feedHasStarted || this.feedEnteredAtMs <= 0) return true;
    return Date.now() - this.feedEnteredAtMs < FEED_EXTERNAL_UI_DELAY_MS;
  }

  private showFeedExternalUiGuardTip() {
    this.showFloatingTip("挑战开始 5 秒后可使用");
  }

  private onGameHide() {
    this.appHidden = true;
    this.syncCountdownWarningState(false);
  }

  private onGameShow() {
    this.appHidden = false;
    this.syncCountdownWarningState();
  }

  private onAdPauseChanged(paused: boolean) {
    this.adPaused = paused;
    this.syncCountdownWarningState();
  }

  protected onDestroy() {
    game.off(Game.EVENT_HIDE, this.onGameHide, this);
    game.off(Game.EVENT_SHOW, this.onGameShow, this);
    director.off(SdkUtils.EVENT_AD_PAUSE_CHANGED, this.onAdPauseChanged, this);
    this.resetCountdownWarning();
    this.clearTutorialPresentation();
    director.off(Director.EVENT_END_FRAME, this.reportFeedSceneReady, this);
    FeedAcquisitionService.removeListener(this.onFeedStateChanged);
    this.unbindFeedFallbackTouch();
    this.mapControl?.node?.off(Node.EventType.TOUCH_END, this.onSceneTouchEnd, this);
    if (this.feedMode) {
      FeedAcquisitionService.completeSession();
    }
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
  private changeParentKeepWorldPosition(node: Node, newParent: Node) {
    if (!node || !newParent || node.parent === newParent) {
      return;
    }

    const nodeTransform = node.getComponent(UITransform);
    const parentTransform = newParent.getComponent(UITransform);

    if (!nodeTransform || !parentTransform) {
      node.parent = newParent;
      return;
    }

    const worldPos = nodeTransform.convertToWorldSpaceAR(Vec3.ZERO);

    node.parent = newParent;

    const localPos = parentTransform.convertToNodeSpaceAR(worldPos);
    node.setPosition(localPos);
  }
  private getNodePositionInTrayRoot(node: Node): Vec3 {
    return this.getNodePositionInParent(node, this.trayRoot);
  }

  private getBlockTargetPosition(block: BlockState, targetNode: Node): Vec3 {
    if (block.location === "tray") {
      return this.getNodePositionInTrayRoot(targetNode);
    }

    return this.getNodePositionInBlockRoot(targetNode);
  }
  private getTouchPositionInTileRoot(event: EventTouch): Vec3 | null {
    if (!this.tileRoot) return null;
    const location = event.getUILocation();
    return this.tileRoot.getComponent(UITransform).convertToNodeSpaceAR(new Vec3(location.x, location.y, 0));
  }

  private getMagicAreaParent(): Node {
    /**
     * 魔法框是棋盘选择区域，必须跟着棋盘一起缩放 / 拖动。
     * 它放在 GameRoot 下并位于 BlockRoot 后面：
     * - 仍会跟随棋盘整体缩放 / 拖动。
     * - 不会再被 BlockRoot 中的钻石遮挡。
     */
    return this.root || this.tileRoot || this.node;
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
    const shouldPlayDown = this.shouldPlayMoveSound(node, position);

    tween(node)
      .delay(delay)
      .call(() => {
        if (shouldPlayDown) {
          this.playGemDownSound();
        }
      })
      .to(duration, { position: position.clone() }, { easing: "quadOut" })
      .call(() => onComplete?.())
      .start();
  }

  private showMessage(text: string) {
    if (!this.messageLabel) {
      console.warn(`[gameScene] ${text}`);
      return;
    }
    this.messageLabel.string = text;
    this.messageLabel.node.active = true;
  }

  /** 操作反馈统一走短时飘字，不占用需要持续展示状态的 MessageLabel。 */
  private showFloatingTip(text: string) {
    if (!text) return;
    TipsManager.Instance.show(text);
  }

  /** 游戏倒计时实际是否正在推进；提示音和呼吸动画必须与这个状态完全一致。 */
  private isLevelClockAdvancing(): boolean {
    return (
      !this.appHidden &&
      !this.adPaused &&
      this.timerRunning &&
      !this.inputLocked &&
      !this.tutorialTimerGateActive &&
      !this.tutorialPaused &&
      this.tutorialStep === "none" &&
      !this.tutorialTransitioning &&
      !PlayData.Instance.ispause &&
      !!this.levelData &&
      !this.levelCompletionHandled &&
      this.remainingTime > 0
    );
  }

  /**
   * 最后 30 秒进入警戒状态：循环提示音 + 时间文本呼吸。
   * 临时暂停保留音频进度；离开警戒区、过关、失败或换关时从头停止。
   */
  private syncCountdownWarningState(clockAdvancing = this.isLevelClockAdvancing()) {
    const shouldWarn =
      !!this.levelData &&
      !this.levelCompletionHandled &&
      this.remainingTime > 0 &&
      this.remainingTime <= COUNTDOWN_WARNING_SECONDS;
    const nextState: CountdownWarningState = shouldWarn
      ? clockAdvancing
        ? "playing"
        : "paused"
      : "stopped";

    if (nextState === this.countdownWarningState) return;
    this.countdownWarningState = nextState;

    if (nextState === "playing") {
      void AudioManager.playLoopEffectByName(soundName.countDown);
      this.startTimerBreathing();
      return;
    }

    this.stopTimerBreathing();
    if (nextState === "paused") {
      AudioManager.pauseLoopEffect(soundName.countDown);
    } else {
      AudioManager.stopLoopEffect(soundName.countDown);
    }
  }

  private startTimerBreathing() {
    const timerNode = this.timerLabel?.node;
    if (!timerNode?.isValid) return;

    Tween.stopAllByTarget(timerNode);
    timerNode.setScale(this.timerLabelBaseScale);
    const breathScale = new Vec3(
      this.timerLabelBaseScale.x * COUNTDOWN_BREATH_SCALE,
      this.timerLabelBaseScale.y * COUNTDOWN_BREATH_SCALE,
      this.timerLabelBaseScale.z,
    );
    tween(timerNode)
      .repeatForever(
        tween(timerNode)
          .to(COUNTDOWN_BREATH_HALF_CYCLE, { scale: breathScale }, { easing: "sineInOut" })
          .to(
            COUNTDOWN_BREATH_HALF_CYCLE,
            { scale: this.timerLabelBaseScale.clone() },
            { easing: "sineInOut" },
          ),
      )
      .start();
  }

  private stopTimerBreathing() {
    const timerNode = this.timerLabel?.node;
    if (!timerNode?.isValid) return;
    Tween.stopAllByTarget(timerNode);
    timerNode.setScale(this.timerLabelBaseScale);
  }

  private resetCountdownWarning() {
    this.countdownWarningState = "stopped";
    AudioManager.stopLoopEffect(soundName.countDown);
    this.stopTimerBreathing();
  }

  private refreshTimerLabel() {
    if (!this.timerLabel) return;

    const displaySeconds = Math.max(0, Math.ceil(this.remainingTime));
    if (displaySeconds === this.lastDisplayedSecond) return;
    this.lastDisplayedSecond = displaySeconds;

    const minutes = Math.floor(displaySeconds / 60);
    const seconds = displaySeconds % 60;
    const minuteText = minutes < 10 ? `0${minutes}` : String(minutes);
    const secondText = seconds < 10 ? `0${seconds}` : String(seconds);
    this.timerLabel.string = `${minuteText}:${secondText}`;
    this.timerLabel.color = displaySeconds <= 30 ? new Color(255, 92, 92, 255) : this.timerNormalColor;
  }

  private clearBoard() {
    this.clearTutorialPresentation();
    this.magicSelecting = false;
    if (this.magicAreaNode?.isValid) this.magicAreaNode.destroy();
    this.magicAreaNode = null;
    this.magicAreaStartCenter = null;
    this.boardBaseRoot?.destroyAllChildren();
    this.tileRoot?.destroyAllChildren();
    this.blockRoot?.destroyAllChildren();
    this.activeTrayRows = 1;
    this.clearTraySlots();
    this.tiles = [];
    this.blocks = [];
    this.traySlots = [];
    this.selectedBlocks = [];
    this.blockIdSeed = 0;
    for (const material of this.glowMaterials.values()) {
      material.destroy();
    }
    this.glowMaterials.clear();
    this.glowFlashTokens.clear();
  }

  private clearTraySlots() {
    if (!this.trayRoot) return;

    this.trayRoot.destroyAllChildren();
  }

  private setNodeSize(node: Node, width: number, height: number) {
    if (!node) {
      return;
    }

    let transform = node.getComponent(UITransform);

    if (!transform) {
      transform = node.addComponent(UITransform);
    }

    transform.setContentSize(width, height);
  }

  private createNode(name: string, parent: Node, width: number, height: number): Node {
    const node = new Node(name);
    node.layer = parent.layer;
    parent.addChild(node);
    const transform = node.addComponent(UITransform);
    transform.setContentSize(width, height);
    return node;
  }

  private createSpriteNode(name: string, parent: Node, frame: SpriteFrame | null, width: number, height: number): Node {
    const node = this.createNode(name, parent, width, height);
    const sprite = node.addComponent(Sprite);
    sprite.spriteFrame = frame;
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    node.getComponent(UITransform).setContentSize(width, height);
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

  private createBoardBaseNode(row: number, col: number): Node {
    const size = this.getBoardBaseSize();
    const node = this.createPrefabOrNode(
      this.traySlotPrefab,
      `BoardBase_${row}_${col}`,
      this.boardBaseRoot,
      size,
      size,
    );
    const view = this.findDeepChild(node, "View") || node;
    this.applySprite(view, this.boardBaseFrame, size, size, new Color(255, 255, 255, 95));
    return node;
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
    const pos = this.getNodePositionInTrayRoot(slot.node);
    pos.y += this.selectedTrayLift;
    return pos;
  }

  private getTraySlotSize(): number {
    return Math.min(this.getBoardTileSize(), this.trayMaxWidth / TRAY_COLS);
  }

  private getBoardTileSize(): number {
    return this.cellSize + this.boardTileOverlap;
  }

  private getBoardBaseSize(): number {
    return this.cellStep + this.boardBasePadding;
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

  private findDeepChild(parent: Node | null, name: string): Node | null {
    if (!parent) return null;
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
