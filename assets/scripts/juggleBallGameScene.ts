import {
  _decorator,
  Button,
  Color,
  Component,
  director,
  Director,
  EventTouch,
  game,
  Game,
  Graphics,
  HorizontalTextAlignment,
  input,
  Input,
  Label,
  Node,
  ResolutionPolicy,
  Sprite,
  SpriteFrame,
  tween,
  UIOpacity,
  UITransform,
  Vec3,
  VerticalTextAlignment,
  view,
} from "cc";
import AudioManager from "./framework/AudioManager";
import { GameSceneBundle, GameSceneName } from "./framework/GameSceneBundle";
import { SdkUtils } from "./framework/Platform/sdk/SdkUtils";
import { ResourceManager } from "./framework/ResourceManager";
import { soundName } from "./gamePrefabMgr";
import {
  FeedAcquisitionService,
  FeedAcquisitionState,
} from "./framework/Platform/FeedAcquisitionService";
import { adc } from "./framework/Platform/ADController";

const { ccclass, property } = _decorator;

type JuggleState = "ready" | "playing" | "paused" | "result";

const DESIGN_WIDTH = 750;
const DESIGN_HEIGHT = 1334;
const BALL_RADIUS = 28;
const PADDLE_Y = -390;
const PADDLE_HALF_WIDTH = 112;
const PLAY_LEFT = -342;
const PLAY_RIGHT = 342;
const MISS_Y = -650;
const GRAVITY = -1950;
const PADDLE_HIT_HEIGHT = 54;
const BASE_SPEED_MULTIPLIER = 1.26;
const MIN_HORIZONTAL_SPEED = 175;
const MAX_HORIZONTAL_SPEED = 680;
const RANDOM_LATERAL_IMPULSE = 75;
const VERTICAL_FORCE_VARIATION = 0.04;
const TARGET_SCORE = 30;
const DEG = 180 / Math.PI;

/**
 * 视频参考版的颠球挑战。
 * 核心节点全部放在 BouncingBallGameScene.scene，方便在编辑器中微调排版。
 */
@ccclass("juggleBallGameScene")
export class juggleBallGameScene extends Component {
  @property(Node)
  sceneHeaderPanel: Node | null = null;

  @property(Node)
  sceneGoalPanel: Node | null = null;

  @property(Node)
  scenePaddle: Node | null = null;

  @property(Node)
  sceneBall: Node | null = null;

  @property(Node)
  sceneBallTrail: Node | null = null;

  @property(Node)
  sceneMoveHint: Node | null = null;

  @property(Label)
  sceneLevelLabel: Label | null = null;

  @property(Label)
  sceneGoalLabel: Label | null = null;

  @property(Label)
  sceneChanceLabel: Label | null = null;

  @property(Label)
  sceneScoreLabel: Label | null = null;

  @property(Label)
  sceneStatusLabel: Label | null = null;

  @property(Button)
  sceneBackButton: Button | null = null;

  @property(Button)
  sceneSlowdownButton: Button | null = null;

  @property(Button)
  sceneExtraChanceButton: Button | null = null;

  @property(Node)
  sceneResultOverlay: Node | null = null;

  @property(Node)
  sceneResultPanel: Node | null = null;

  @property(Label)
  sceneResultTitle: Label | null = null;

  @property(Label)
  sceneResultDetail: Label | null = null;

  @property(Button)
  sceneResultActionButton: Button | null = null;

  @property(Label)
  sceneResultActionLabel: Label | null = null;

  @property(Button)
  sceneResultHomeButton: Button | null = null;

  private state: JuggleState = "ready";
  private score = 0;
  private chances = 3;
  private speedMultiplier = BASE_SPEED_MULTIPLIER;
  private ballPosition = new Vec3();
  private ballVelocity = new Vec3();
  private paddleX = 0;
  private targetPaddleX = 0;
  private isDragging = false;
  private adInFlight = false;
  private leaving = false;
  private feedMode = false;
  private feedEntered = false;
  private feedExited = false;
  private feedAudioForeground = false;
  private feedAudioGestureRecovered = false;
  private feedInterstitialScheduled = false;
  private feedExperienceFinished = false;
  private nativeTouchApi: any | null = null;
  private nativeTouchBound = false;

  protected onLoad(): void {
    view.setDesignResolutionSize(DESIGN_WIDTH, DESIGN_HEIGHT, ResolutionPolicy.FIXED_WIDTH);
    FeedAcquisitionService.init();
    this.feedMode = FeedAcquisitionService.isActive();
    this.buildEditorNodesIfNeeded();
    this.bindEvents();
    this.drawSceneArtwork();
    void this.loadArtwork();
    if (this.sceneResultOverlay) this.sceneResultOverlay.active = false;
  }

  protected start(): void {
    AudioManager.setSoundEvent();
    if (this.feedMode) {
      FeedAcquisitionService.addListener(this.onFeedStateChanged);
      this.node.on(Node.EventType.TOUCH_START, this.onFeedFallbackTouch, this, true);
      this.bindNativeFeedTouchFallback();
    } else {
      AudioManager.playMusic(soundName.getUserBgm);
    }
    this.startChallenge();
    if (this.feedMode) {
      director.once(Director.EVENT_END_FRAME, this.reportFeedSceneReady, this);
    }
  }

  protected update(deltaTime: number): void {
    if (this.feedMode && this.feedExited) return;
    const dt = Math.min(0.035, Math.max(0, deltaTime));
    this.updatePaddle(dt);
    if (this.state === "playing") {
      if (this.feedMode && !this.feedEntered) {
        this.updateFeedPreviewBall(dt);
      } else {
        this.updateBall(dt);
      }
    }
  }

  protected onDestroy(): void {
    adc.cancelFeedEntryInterstitial();
    director.off(Director.EVENT_END_FRAME, this.reportFeedSceneReady, this);
    FeedAcquisitionService.removeListener(this.onFeedStateChanged);
    if (this.feedMode && !this.feedExperienceFinished) {
      this.feedExperienceFinished = true;
      FeedAcquisitionService.completeSession();
    }
    game.off(Game.EVENT_HIDE, this.onGameHide, this);
    game.off(Game.EVENT_SHOW, this.onGameShow, this);
    input.off(Input.EventType.TOUCH_START, this.onTouchStart, this);
    input.off(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
    input.off(Input.EventType.TOUCH_END, this.onTouchEnd, this);
    input.off(Input.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
    this.sceneBackButton?.node?.off(Button.EventType.CLICK, this.returnToMain, this);
    this.sceneSlowdownButton?.node?.off(Button.EventType.CLICK, this.onSlowdownPressed, this);
    this.sceneExtraChanceButton?.node?.off(Button.EventType.CLICK, this.onExtraChancePressed, this);
    this.sceneResultActionButton?.node?.off(Button.EventType.CLICK, this.onResultAction, this);
    this.sceneResultHomeButton?.node?.off(Button.EventType.CLICK, this.returnToMain, this);
    this.node?.off(Node.EventType.TOUCH_START, this.onFeedFallbackTouch, this, true);
    this.unbindNativeFeedTouchFallback();
    this.unscheduleAllCallbacks();
  }

  private bindEvents(): void {
    this.sceneBackButton?.node?.on(Button.EventType.CLICK, this.returnToMain, this);
    this.sceneSlowdownButton?.node?.on(Button.EventType.CLICK, this.onSlowdownPressed, this);
    this.sceneExtraChanceButton?.node?.on(Button.EventType.CLICK, this.onExtraChancePressed, this);
    this.sceneResultActionButton?.node?.on(Button.EventType.CLICK, this.onResultAction, this);
    this.sceneResultHomeButton?.node?.on(Button.EventType.CLICK, this.returnToMain, this);
    game.on(Game.EVENT_HIDE, this.onGameHide, this);
    game.on(Game.EVENT_SHOW, this.onGameShow, this);
    input.on(Input.EventType.TOUCH_START, this.onTouchStart, this);
    input.on(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
    input.on(Input.EventType.TOUCH_END, this.onTouchEnd, this);
    input.on(Input.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
  }

  /** 场景初次导入时也能直接运行；所有节点名称与层级保持稳定，方便后续在编辑器中固化和调整。 */
  private buildEditorNodesIfNeeded(): void {
    if (this.scenePaddle?.isValid) return;
    const root = this.node;

    const background = this.createVisualNode("JuggleBackground", root, 0, 0, 750, 1334, true);
    const backgroundGraphics = background.getComponent(Graphics);
    if (backgroundGraphics) {
      backgroundGraphics.fillColor = new Color(45, 194, 242, 255);
      backgroundGraphics.rect(-375, -667, 750, 1334);
      backgroundGraphics.fill();
    }
    background.addComponent(Sprite);

    this.sceneHeaderPanel = this.createVisualNode("HeaderPanel", root, 0, 535, 480, 128, false);
    this.sceneHeaderPanel.addComponent(Sprite);
    this.sceneGoalPanel = this.createVisualNode("GoalPanel", root, -300, 428, 130, 100, true);
    this.sceneLevelLabel = this.createLabel(
      "LevelLabel",
      root,
      0,
      537,
      430,
      70,
      42,
      new Color(82, 48, 28, 255),
      "第1关 乒乓颠球挑战",
    );
    this.sceneGoalLabel = this.createLabel("GoalLabel", root, -300, 428, 118, 88, 35, Color.WHITE, "目标\n30");
    this.sceneChanceLabel = this.createLabel("ChanceLabel", root, 0, 480, 180, 38, 25, new Color(119, 74, 24, 255), "次数：3次");

    const back = this.createVisualNode("BackButton", root, -329, 535, 82, 82, false);
    back.addComponent(Sprite);
    this.sceneBackButton = back.addComponent(Button);
    this.sceneBackButton.transition = Button.Transition.SCALE;
    this.sceneBackButton.zoomScale = 1.06;

    this.sceneScoreLabel = this.createLabel("ScoreLabel", root, 0, 195, 300, 170, 132, new Color(209, 153, 33, 255), "0");
    this.sceneStatusLabel = this.createLabel("StatusLabel", root, 0, 95, 260, 58, 42, new Color(209, 153, 33, 255), "准备");

    this.sceneBallTrail = this.createVisualNode("BallTrail", root, 0, PADDLE_Y + 150, 100, 42, true);
    this.sceneBall = this.createVisualNode("Ball", root, 0, PADDLE_Y + 150, 70, 70, true);
    this.scenePaddle = this.createVisualNode("MushroomPaddle", root, 0, PADDLE_Y, 270, 162, false);
    this.scenePaddle.addComponent(Sprite);
    this.sceneMoveHint = this.createLabel("MoveHint", root, 0, PADDLE_Y + 8, 320, 60, 60, new Color(245, 202, 55, 255), "‹      ›").node;

    this.sceneSlowdownButton = this.createRewardImageButton("SlowdownButton", root, -100, -555, "降速");
    this.sceneExtraChanceButton = this.createRewardImageButton("ExtraChanceButton", root, 100, -555, "次数+3");

    this.sceneResultOverlay = this.createVisualNode("ResultOverlay", root, 0, 0, 750, 1334, true);
    const overlayGraphics = this.sceneResultOverlay.getComponent(Graphics);
    if (overlayGraphics) {
      overlayGraphics.fillColor = new Color(13, 50, 78, 175);
      overlayGraphics.rect(-375, -667, 750, 1334);
      overlayGraphics.fill();
    }
    this.sceneResultPanel = this.createVisualNode("ResultPanel", this.sceneResultOverlay, 0, 0, 536, 440, true);
    this.sceneResultTitle = this.createLabel("ResultTitle", this.sceneResultPanel, 0, 112, 470, 80, 58, new Color(115, 69, 29, 255), "挑战成功");
    this.sceneResultDetail = this.createLabel("ResultDetail", this.sceneResultPanel, 0, 18, 470, 130, 31, new Color(115, 69, 29, 255), "目标达成\n本次颠球：30");
    const resultAction = this.createActionButton("ResultActionButton", this.sceneResultPanel, 128, -142, 180, 86, "再玩一次", 31);
    this.sceneResultActionButton = resultAction.button;
    this.sceneResultActionLabel = resultAction.label;
    this.sceneResultHomeButton = this.createActionButton("ResultHomeButton", this.sceneResultPanel, -128, -142, 180, 86, "返回主页", 31).button;
  }

  private createVisualNode(
    name: string,
    parent: Node,
    x: number,
    y: number,
    width: number,
    height: number,
    withGraphics: boolean,
  ): Node {
    const node = new Node(name);
    node.layer = parent.layer;
    node.parent = parent;
    node.setPosition(x, y, 0);
    node.addComponent(UITransform).setContentSize(width, height);
    if (withGraphics) node.addComponent(Graphics);
    return node;
  }

  private createLabel(
    name: string,
    parent: Node,
    x: number,
    y: number,
    width: number,
    height: number,
    size: number,
    color: Color,
    text: string,
  ): Label {
    const node = this.createVisualNode(name, parent, x, y, width, height, false);
    const label = node.addComponent(Label);
    label.string = text;
    label.fontSize = size;
    label.lineHeight = Math.round(size * 1.08);
    label.color = color;
    label.horizontalAlign = HorizontalTextAlignment.CENTER;
    label.verticalAlign = VerticalTextAlignment.CENTER;
    label.isBold = true;
    return label;
  }

  private createActionButton(
    name: string,
    parent: Node,
    x: number,
    y: number,
    width: number,
    height: number,
    text: string,
    fontSize: number,
  ): { button: Button; label: Label } {
    const node = this.createVisualNode(name, parent, x, y, width, height, true);
    const button = node.addComponent(Button);
    button.transition = Button.Transition.SCALE;
    button.zoomScale = 1.06;
    const label = this.createLabel("Label", node, 0, -4, width - 12, height - 8, fontSize, Color.WHITE, text);
    return { button, label };
  }

  private createRewardImageButton(name: string, parent: Node, x: number, y: number, text: string): Button {
    const node = this.createVisualNode(name, parent, x, y, 128, 128, false);
    node.addComponent(Sprite);
    const button = node.addComponent(Button);
    button.transition = Button.Transition.SCALE;
    button.zoomScale = 1.06;

    const label = this.createLabel("Label", node, 0, -39, 116, 38, 25, Color.WHITE, text);
    label.enableOutline = true;
    label.outlineColor = new Color(91, 54, 29, 255);
    label.outlineWidth = 3;

    const adBadge = this.createVisualNode("AdBadge", node, 44, 43, 18, 20, false);
    adBadge.addComponent(Sprite);
    adBadge.addComponent(UIOpacity).opacity = 150;
    return button;
  }

  private async loadArtwork(): Promise<void> {
    const entries: Array<[Node | null | undefined, string]> = [
      [this.node.getChildByName("JuggleBackground"), "juggleBallGame/sky-background/spriteFrame"],
      [this.sceneHeaderPanel, "juggleBallGame/title-plaque/spriteFrame"],
      [this.sceneBackButton?.node, "juggleBallGame/back-button/spriteFrame"],
      [this.scenePaddle, "juggleBallGame/mushroom-paddle/spriteFrame"],
      [this.sceneSlowdownButton?.node, "juggleBallGame/slowdown-button/spriteFrame"],
      [this.sceneExtraChanceButton?.node, "juggleBallGame/extra-chance-button/spriteFrame"],
      [this.sceneSlowdownButton?.node.getChildByName("AdBadge"), "parkingGame/play-icon-white/spriteFrame"],
      [this.sceneExtraChanceButton?.node.getChildByName("AdBadge"), "parkingGame/play-icon-white/spriteFrame"],
    ];

    await Promise.all(entries.map(([node, path]) => this.loadSprite(node, path)));
  }

  private async loadSprite(node: Node | null | undefined, path: string): Promise<void> {
    const sprite = node?.getComponent(Sprite);
    if (!sprite) return;
    try {
      const frame = await ResourceManager.ins.loadBundleAsset("res", path, SpriteFrame);
      if (!node?.isValid) return;
      sprite.sizeMode = Sprite.SizeMode.CUSTOM;
      sprite.spriteFrame = frame;
    } catch (err) {
      console.warn(`[juggleBallGameScene] 图片加载失败: ${path}`, err);
    }
  }

  private startChallenge(): void {
    this.unschedule(this.launchBall);
    this.score = 0;
    this.chances = 3;
    this.speedMultiplier = BASE_SPEED_MULTIPLIER;
    this.paddleX = 0;
    this.targetPaddleX = 0;
    if (this.sceneResultOverlay) this.sceneResultOverlay.active = false;
    const isFeedPreview = this.feedMode && !this.feedEntered && !this.feedExited;
    if (isFeedPreview) {
      // 推荐流预览直接展示真实下落与回弹；正式进入前保持纯竖直运动，不计分、不扣次数。
      this.state = "playing";
      this.ballPosition.set(0, 230, 0);
      this.ballVelocity.set(0, -260, 0);
    } else {
      this.state = "ready";
      this.ballPosition.set(0, PADDLE_Y + PADDLE_HIT_HEIGHT + BALL_RADIUS + 24, 0);
      this.ballVelocity.set(0, 0, 0);
    }
    this.renderBall();
    this.renderPaddle();
    this.updateLabels(isFeedPreview ? "" : "准备");
    if (!isFeedPreview) {
      this.scheduleOnce(this.launchBall, 0.7);
    }
  }

  private launchBall = (): void => {
    if (this.leaving || this.state !== "ready" || !this.isFeedInteractionEnabled()) return;
    const direction = this.score % 2 === 0 ? 1 : -1;
    this.ballPosition.set(
      this.paddleX + direction * 28,
      PADDLE_Y + PADDLE_HIT_HEIGHT + BALL_RADIUS + 18,
      0,
    );
    this.ballVelocity.set(
      direction * (290 + this.score * 9),
      1260 + Math.min(this.score * 12, 360),
      0,
    );
    this.state = "playing";
    this.updateLabels("");
    this.renderBall();
  };

  private updatePaddle(dt: number): void {
    this.paddleX += (this.targetPaddleX - this.paddleX) * Math.min(1, dt * 17);
    this.renderPaddle();
  }

  private updateBall(dt: number): void {
    const speed = this.speedMultiplier;
    this.ballVelocity.y += GRAVITY * speed * dt;
    this.ballPosition.x += this.ballVelocity.x * speed * dt;
    this.ballPosition.y += this.ballVelocity.y * speed * dt;

    if (this.ballPosition.x <= PLAY_LEFT + BALL_RADIUS) {
      this.ballPosition.x = PLAY_LEFT + BALL_RADIUS;
      this.ballVelocity.x = Math.abs(this.ballVelocity.x);
    } else if (this.ballPosition.x >= PLAY_RIGHT - BALL_RADIUS) {
      this.ballPosition.x = PLAY_RIGHT - BALL_RADIUS;
      this.ballVelocity.x = -Math.abs(this.ballVelocity.x);
    }

    const paddleTop = PADDLE_Y + PADDLE_HIT_HEIGHT;
    const isDescending = this.ballVelocity.y < 0;
    const isAtPaddleHeight =
      this.ballPosition.y - BALL_RADIUS <= paddleTop && this.ballPosition.y > PADDLE_Y - 18;
    const isOnPaddle = Math.abs(this.ballPosition.x - this.paddleX) <= PADDLE_HALF_WIDTH;
    if (isDescending && isAtPaddleHeight && isOnPaddle) {
      this.bounceBall();
    } else if (this.ballPosition.y < MISS_Y) {
      this.handleMiss();
    }

    this.renderBall();
  }

  /** 推荐流卡片预览：使用同一套重力参数真实弹跳，但不产生横向角度或玩法结算。 */
  private updateFeedPreviewBall(dt: number): void {
    const speed = this.speedMultiplier;
    this.ballVelocity.x = 0;
    this.ballPosition.x = this.paddleX;
    this.ballVelocity.y += GRAVITY * speed * dt;
    this.ballPosition.y += this.ballVelocity.y * speed * dt;

    const paddleTop = PADDLE_Y + PADDLE_HIT_HEIGHT;
    const isDescending = this.ballVelocity.y < 0;
    const isAtPaddleHeight =
      this.ballPosition.y - BALL_RADIUS <= paddleTop && this.ballPosition.y > PADDLE_Y - 18;
    if (isDescending && isAtPaddleHeight) {
      this.ballPosition.y = paddleTop + BALL_RADIUS;
      this.ballVelocity.y = 1260;
    } else if (this.ballPosition.y < MISS_Y) {
      // 极端掉帧时直接恢复到预览下落状态，避免卡片里永久丢球。
      this.ballPosition.set(this.paddleX, 230, 0);
      this.ballVelocity.set(0, -260, 0);
    }

    this.renderBall();
  }

  private bounceBall(): void {
    this.score += 1;
    const offset = (this.ballPosition.x - this.paddleX) / PADDLE_HALF_WIDTH;
    const verticalVariation = 1 + (Math.random() * 2 - 1) * VERTICAL_FORCE_VARIATION;
    const riseSpeed = (1260 + Math.min(this.score * 20, 360)) * verticalVariation;
    const lateralImpulse = (Math.random() * 2 - 1) * RANDOM_LATERAL_IMPULSE;
    const previousHorizontalSpeed = this.ballVelocity.x;
    let nextHorizontalSpeed = previousHorizontalSpeed + offset * 360 + lateralImpulse;

    // 只在球拍接触瞬间施加轻微扰动；若横向速度几乎被抵消，保留一个自然的最低侧向速度。
    if (Math.abs(nextHorizontalSpeed) < MIN_HORIZONTAL_SPEED) {
      const preferredDirection =
        Math.abs(offset) > 0.08
          ? Math.sign(offset)
          : Math.sign(previousHorizontalSpeed || lateralImpulse || (Math.random() - 0.5));
      nextHorizontalSpeed = preferredDirection * (MIN_HORIZONTAL_SPEED + Math.random() * 25);
    }

    this.ballPosition.y = PADDLE_Y + PADDLE_HIT_HEIGHT + BALL_RADIUS;
    this.ballVelocity.y = riseSpeed;
    this.ballVelocity.x = Math.max(
      -MAX_HORIZONTAL_SPEED,
      Math.min(MAX_HORIZONTAL_SPEED, nextHorizontalSpeed),
    );
    AudioManager.playEffect(soundName.pingPongHit);
    this.pulsePaddle();
    this.updateLabels("");

    if (this.score >= TARGET_SCORE) {
      this.state = "result";
      this.scheduleOnce(() => this.showResult(true, "目标达成，颠球高手！"), 0.45);
    }
  }

  private handleMiss(): void {
    this.chances -= 1;
    AudioManager.playEffect(soundName.fail);
    if (this.chances <= 0) {
      this.state = "result";
      this.showResult(false, "再接住几次，就能完成挑战！");
      return;
    }

    this.state = "ready";
    this.ballPosition.set(
      this.paddleX,
      PADDLE_Y + PADDLE_HIT_HEIGHT + BALL_RADIUS + 18,
      0,
    );
    this.ballVelocity.set(0, 0, 0);
    this.updateLabels("再来一次");
    this.scheduleOnce(this.launchBall, 0.72);
  }

  private onTouchStart(event: EventTouch): void {
    this.activateFeedFromGesture();
    if (
      !this.isFeedInteractionEnabled() ||
      (this.state !== "ready" && this.state !== "playing") ||
      this.adInFlight
    ) return;
    this.isDragging = true;
    this.movePaddleFromTouch(event);
  }

  private onTouchMove(event: EventTouch): void {
    // 抖音推荐流正式进入时，宿主有可能消费首个 TOUCH_START，
    // Cocos 真机侧只收到后续 TOUCH_MOVE。移动事件也要能够激活 Feed
    // 并补建拖动状态，否则必须切到后台再回来后球拍才可操作。
    this.activateFeedFromGesture();
    if (
      !this.isFeedInteractionEnabled() ||
      (this.state !== "ready" && this.state !== "playing") ||
      this.adInFlight
    ) return;
    if (!this.isDragging) this.isDragging = true;
    this.movePaddleFromTouch(event);
  }

  private onTouchEnd(): void {
    this.isDragging = false;
  }

  private movePaddleFromTouch(event: EventTouch): void {
    const location = event.getUILocation();
    const visibleSize = view.getVisibleSize();
    const normalizedX = visibleSize.width > 0 ? location.x / visibleSize.width : 0.5;
    this.movePaddleFromNormalizedX(normalizedX);
  }

  private movePaddleFromNormalizedX(normalizedX: number): void {
    const x = (normalizedX - 0.5) * DESIGN_WIDTH;
    this.targetPaddleX = Math.max(-252, Math.min(252, x));
  }

  /**
   * 推荐流直玩会异步重绑游戏 Surface，部分真机会令 Cocos 的 input 监听失效，
   * 因此直接监听抖音小游戏原生触摸作为兜底。普通入口不注册这组监听。
   */
  private bindNativeFeedTouchFallback(): void {
    if (!this.feedMode || this.nativeTouchBound) return;
    try {
      const api = typeof tt !== "undefined" ? tt : null;
      if (
        !api ||
        typeof api.onTouchStart !== "function" ||
        typeof api.onTouchMove !== "function" ||
        typeof api.onTouchEnd !== "function"
      ) {
        return;
      }
      api.onTouchStart(this.onNativeTouchStart);
      api.onTouchMove(this.onNativeTouchMove);
      api.onTouchEnd(this.onNativeTouchEnd);
      if (typeof api.onTouchCancel === "function") {
        api.onTouchCancel(this.onNativeTouchEnd);
      }
      this.nativeTouchApi = api;
      this.nativeTouchBound = true;
      console.log("[juggleBallGameScene] 推荐流原生触摸兜底已启用");
    } catch (err) {
      console.warn("[juggleBallGameScene] 推荐流原生触摸兜底注册失败", err);
    }
  }

  private unbindNativeFeedTouchFallback(): void {
    if (!this.nativeTouchBound || !this.nativeTouchApi) return;
    const api = this.nativeTouchApi;
    try {
      api.offTouchStart?.(this.onNativeTouchStart);
      api.offTouchMove?.(this.onNativeTouchMove);
      api.offTouchEnd?.(this.onNativeTouchEnd);
      api.offTouchCancel?.(this.onNativeTouchEnd);
    } catch (err) {
      console.warn("[juggleBallGameScene] 推荐流原生触摸兜底解绑失败", err);
    }
    this.nativeTouchApi = null;
    this.nativeTouchBound = false;
  }

  private readonly onNativeTouchStart = (event: any): void => {
    const wasEntered = FeedAcquisitionService.getState().entered;
    this.activateFeedFromGesture();
    if (
      !this.isFeedInteractionEnabled() ||
      (this.state !== "ready" && this.state !== "playing") ||
      this.adInFlight
    ) return;
    this.isDragging = true;
    // 点击“立即去玩”本身只负责进入，避免把入口按钮的横坐标当成拖球拍操作。
    if (wasEntered) this.movePaddleFromNativeTouch(event);
  };

  private readonly onNativeTouchMove = (event: any): void => {
    this.activateFeedFromGesture();
    if (
      !this.isFeedInteractionEnabled() ||
      (this.state !== "ready" && this.state !== "playing") ||
      this.adInFlight
    ) return;
    this.isDragging = true;
    this.movePaddleFromNativeTouch(event);
  };

  private readonly onNativeTouchEnd = (): void => {
    this.isDragging = false;
  };

  private movePaddleFromNativeTouch(event: any): void {
    const touch = event?.touches?.[0] ?? event?.changedTouches?.[0];
    const rawX = Number(touch?.clientX ?? touch?.pageX ?? touch?.x);
    if (!Number.isFinite(rawX)) return;

    let windowWidth = 0;
    try {
      const systemInfo = this.nativeTouchApi?.getSystemInfoSync?.();
      windowWidth = Number(systemInfo?.windowWidth ?? systemInfo?.screenWidth ?? 0);
    } catch {
      // 系统信息不可用时使用 Cocos 当前可见宽度。
    }
    if (!(windowWidth > 0)) windowWidth = view.getVisibleSize().width;
    if (!(windowWidth > 0)) return;
    const normalizedX = Math.max(0, Math.min(1, rawX / windowWidth));
    this.movePaddleFromNormalizedX(normalizedX);
  }

  private async onSlowdownPressed(): Promise<void> {
    await this.runRewardAction(this.sceneSlowdownButton, () => {
      this.speedMultiplier *= 0.72;
      this.showDouyinToast("球速已降低");
    });
  }

  private async onExtraChancePressed(): Promise<void> {
    await this.runRewardAction(this.sceneExtraChanceButton, () => {
      this.chances += 3;
      this.updateLabels("");
      this.showDouyinToast("次数 +3");
    });
  }

  private async runRewardAction(button: Button | null, onRewarded: () => void): Promise<void> {
    if (
      !this.isFeedInteractionEnabled() ||
      this.state !== "playing" ||
      this.adInFlight ||
      !button?.interactable
    ) return;
    AudioManager.playEffect(soundName.buttonClick);
    this.adInFlight = true;
    this.state = "paused";
    button.interactable = false;
    const rewarded = await SdkUtils.showRewardedVideo();
    if (!this.node?.isValid || this.leaving) return;

    this.adInFlight = false;
    button.interactable = true;
    if (rewarded) {
      onRewarded();
      if (this.state === "paused") this.state = "playing";
      return;
    }
    this.state = "playing";
    this.showDouyinToast("完整看完广告才能获得奖励");
  }

  private showResult(success: boolean, detail: string): void {
    if (this.leaving) return;
    this.state = "result";
    if (this.sceneResultOverlay) this.sceneResultOverlay.active = true;
    if (this.sceneResultPanel) {
      this.sceneResultPanel.setScale(0.7, 0.7, 1);
      tween(this.sceneResultPanel)
        .to(0.22, { scale: new Vec3(1.05, 1.05, 1) }, { easing: "backOut" })
        .to(0.08, { scale: Vec3.ONE })
        .start();
    }
    if (this.sceneResultTitle) this.sceneResultTitle.string = success ? "挑战成功" : "挑战结束";
    if (this.sceneResultDetail) this.sceneResultDetail.string = `${detail}\n本次颠球：${this.score}`;
    if (this.sceneResultActionLabel) this.sceneResultActionLabel.string = success ? "再玩一次" : "重新挑战";
  }

  private onResultAction(): void {
    AudioManager.playEffect(soundName.buttonClick);
    this.startChallenge();
  }

  private returnToMain(): void {
    if (this.leaving) return;
    this.leaving = true;
    this.finishFeedExperience();
    AudioManager.playDefaultBgm();
    AudioManager.playEffect(soundName.buttonClick);
    void GameSceneBundle.loadScene(GameSceneName.Main).catch((err) => {
      console.error("[juggleBallGameScene] 返回主页失败", err);
      this.leaving = false;
    });
  }

  private updateLabels(status: string): void {
    if (this.sceneLevelLabel) this.sceneLevelLabel.string = "第1关 乒乓颠球挑战";
    if (this.sceneGoalLabel) this.sceneGoalLabel.string = `目标\n${TARGET_SCORE}`;
    if (this.sceneChanceLabel) this.sceneChanceLabel.string = `次数：${this.chances}次`;
    if (this.sceneScoreLabel) this.sceneScoreLabel.string = String(this.score);
    if (this.sceneStatusLabel) this.sceneStatusLabel.string = status;
    if (this.sceneMoveHint) this.sceneMoveHint.active = this.score < 2 && this.state === "playing";
  }

  private renderPaddle(): void {
    if (this.scenePaddle?.isValid) this.scenePaddle.setPosition(this.paddleX, PADDLE_Y, 0);
    if (this.sceneMoveHint?.isValid) this.sceneMoveHint.setPosition(this.paddleX, PADDLE_Y + 8, 0);
  }

  private renderBall(): void {
    if (this.sceneBall?.isValid) this.sceneBall.setPosition(this.ballPosition);
    if (this.sceneBallTrail?.isValid) {
      this.sceneBallTrail.setPosition(this.ballPosition);
      this.sceneBallTrail.active = this.state === "playing";
      const velocityAngle = Math.atan2(this.ballVelocity.y, this.ballVelocity.x) * DEG;
      this.sceneBallTrail.angle = velocityAngle + 180;
    }
  }

  private pulsePaddle(): void {
    if (!this.scenePaddle?.isValid) return;
    tween(this.scenePaddle)
      .to(0.06, { scale: new Vec3(1.08, 0.91, 1) })
      .to(0.1, { scale: Vec3.ONE })
      .start();
  }

  private drawSceneArtwork(): void {
    this.drawResultOverlay(this.getGraphics(this.sceneResultOverlay));
    this.drawGoalPanel(this.getGraphics(this.sceneGoalPanel));
    this.drawBall(this.getGraphics(this.sceneBall));
    this.drawTrail(this.getGraphics(this.sceneBallTrail));

    this.drawButton(this.getGraphics(this.sceneResultActionButton?.node), new Color(255, 194, 53, 255));
    this.drawButton(this.getGraphics(this.sceneResultHomeButton?.node), new Color(255, 194, 53, 255));
    this.drawResultPanel(this.getGraphics(this.sceneResultPanel));
  }

  private getGraphics(node: Node | null | undefined): Graphics | null {
    if (!node?.isValid) return null;
    return node.getComponent(Graphics) ?? node.addComponent(Graphics);
  }

  private drawResultOverlay(graphics: Graphics | null): void {
    if (!graphics) return;
    graphics.clear();
    graphics.fillColor = new Color(13, 50, 78, 175);
    graphics.rect(-375, -667, 750, 1334);
    graphics.fill();
  }

  private drawGoalPanel(graphics: Graphics | null): void {
    if (!graphics) return;
    graphics.clear();
    graphics.fillColor = new Color(94, 222, 244, 255);
    graphics.strokeColor = new Color(31, 104, 138, 255);
    graphics.lineWidth = 6;
    graphics.roundRect(-65, -50, 130, 100, 18);
    graphics.fill();
    graphics.stroke();
  }

  private drawBall(graphics: Graphics | null): void {
    if (!graphics) return;
    graphics.clear();
    graphics.fillColor = new Color(25, 41, 57, 255);
    graphics.circle(0, 0, BALL_RADIUS);
    graphics.fill();
    graphics.fillColor = new Color(53, 189, 249, 255);
    graphics.circle(0, 0, BALL_RADIUS - 6);
    graphics.fill();
    graphics.fillColor = Color.WHITE;
    graphics.circle(-8, 10, 7);
    graphics.fill();
  }

  private drawTrail(graphics: Graphics | null): void {
    if (!graphics) return;
    graphics.clear();
    graphics.fillColor = new Color(255, 255, 255, 145);
    graphics.moveTo(3, -13);
    graphics.lineTo(3, 13);
    graphics.lineTo(78, 0);
    graphics.close();
    graphics.fill();
  }

  private drawButton(graphics: Graphics | null, color: Color): void {
    if (!graphics) return;
    graphics.clear();
    graphics.fillColor = new Color(117, 75, 32, 255);
    graphics.roundRect(-72, -47, 144, 94, 21);
    graphics.fill();
    graphics.fillColor = color;
    graphics.roundRect(-68, -43, 136, 84, 18);
    graphics.fill();
    graphics.fillColor = new Color(255, 234, 137, 255);
    graphics.roundRect(-59, 8, 118, 25, 11);
    graphics.fill();
  }

  private drawResultPanel(graphics: Graphics | null): void {
    if (!graphics) return;
    graphics.clear();
    graphics.fillColor = new Color(111, 70, 33, 255);
    graphics.roundRect(-268, -220, 536, 440, 42);
    graphics.fill();
    graphics.fillColor = new Color(255, 235, 155, 255);
    graphics.roundRect(-257, -209, 514, 418, 34);
    graphics.fill();
  }

  private readonly onFeedFallbackTouch = (): void => {
    this.activateFeedFromGesture();
  };

  private readonly onFeedStateChanged = (state: FeedAcquisitionState): void => {
    this.feedMode = state.active;
    this.feedEntered = state.entered;
    this.feedExited = state.exited;

    if (!state.active) {
      AudioManager.playMusic(soundName.getUserBgm);
      return;
    }

    if (state.exited) {
      this.isDragging = false;
      adc.cancelFeedEntryInterstitial();
      this.feedInterstitialScheduled = false;
      this.feedAudioForeground = false;
      this.feedAudioGestureRecovered = false;
      AudioManager.pauseBgmForVideo();
      return;
    }

    if (!state.entered) return;
    if (!this.feedInterstitialScheduled) {
      this.feedInterstitialScheduled = true;
      adc.scheduleFeedEntryInterstitial(() => {
        const current = FeedAcquisitionService.getState();
        return !!this.node?.isValid && current.active && current.entered && !current.exited;
      });
    }

    if (!this.feedAudioForeground) {
      this.feedAudioForeground = true;
      AudioManager.restartMusic(soundName.getUserBgm);
    } else {
      AudioManager.playMusic(soundName.getUserBgm);
    }

    if (this.state === "ready") {
      this.unschedule(this.launchBall);
      this.scheduleOnce(this.launchBall, 0.25);
    }
  };

  private activateFeedFromGesture(): void {
    if (FeedAcquisitionService.isActive()) {
      FeedAcquisitionService.activateFromFirstTouch();
    }
    const state = FeedAcquisitionService.getState();
    if (state.active && (!state.entered || state.exited)) return;

    if (state.active && !this.feedAudioGestureRecovered) {
      this.feedAudioGestureRecovered = true;
      AudioManager.restartMusic(soundName.getUserBgm);
    } else if (!state.active) {
      AudioManager.playMusic(soundName.getUserBgm);
    }
  }

  private isFeedInteractionEnabled(): boolean {
    return !this.feedMode || (this.feedEntered && !this.feedExited);
  }

  private reportFeedSceneReady(): void {
    if (this.node?.isValid && FeedAcquisitionService.isActive()) {
      FeedAcquisitionService.reportSceneReady();
    }
  }

  private finishFeedExperience(): void {
    if (!this.feedMode || this.feedExperienceFinished) return;
    this.feedExperienceFinished = true;
    adc.cancelFeedEntryInterstitial();
    director.off(Director.EVENT_END_FRAME, this.reportFeedSceneReady, this);
    this.node?.off(Node.EventType.TOUCH_START, this.onFeedFallbackTouch, this, true);
    this.unbindNativeFeedTouchFallback();
    FeedAcquisitionService.removeListener(this.onFeedStateChanged);
    FeedAcquisitionService.completeSession();
    this.feedMode = false;
  }

  private onGameHide = (): void => {
    this.isDragging = false;
    if (this.feedMode) {
      this.feedAudioForeground = false;
      AudioManager.pauseBgmForVideo();
    }
  };

  private onGameShow = (): void => {
    if (!this.feedMode) return;
    const state = FeedAcquisitionService.getState();
    if (state.exited) return;
    this.feedAudioForeground = true;
    AudioManager.restartMusic(soundName.getUserBgm);
  };

  private showDouyinToast(title: string): void {
    try {
      const api = typeof tt !== "undefined" ? tt : null;
      if (typeof api?.showToast === "function") {
        api.showToast({ title, icon: "none" });
      } else {
        console.log(`[juggleBallGameScene] ${title}`);
      }
    } catch {
      console.log(`[juggleBallGameScene] ${title}`);
    }
  }
}
