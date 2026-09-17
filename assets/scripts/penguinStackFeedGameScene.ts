import {
  _decorator,
  Button,
  Color,
  Component,
  EventTouch,
  game,
  Game,
  input,
  Input,
  Label,
  Node,
  ResolutionPolicy,
  UIOpacity,
  UITransform,
  Vec3,
  view,
} from "cc";
import AudioManager from "./framework/AudioManager";
import { GameSceneBundle, GameSceneName } from "./framework/GameSceneBundle";
import { adc } from "./framework/Platform/ADController";
import {
  FeedAcquisitionService,
  FeedAcquisitionState,
} from "./framework/Platform/FeedAcquisitionService";
import { SdkUtils } from "./framework/Platform/sdk/SdkUtils";
import { soundName } from "./gamePrefabMgr";
import { PenguinStackRound, penguinStackSink, sweptPenguinContact } from "./penguinStackRules";

const { ccclass, property } = _decorator;
const DESIGN_WIDTH = 750;
const PLAY_LEFT = -305;
const PLAY_RIGHT = 305;
const DROP_TOP = 390;
const MISS_BOTTOM = -720;
const WHALE_Y = -455;
const TOWER_Y = -375;
const STACK_SPACING = 52;
const MAX_VISIBLE_STACK = 10;
const WHALE_HIDDEN_AT = 14;
const FALLING_HALF_WIDTH = 98;
const FALLING_HALF_HEIGHT = 49;
const STACK_HALF_WIDTH = 94;
const STACK_HALF_HEIGHT = 47;
const WHALE_HALF_WIDTH = 220;
const WHALE_HALF_HEIGHT = 110;
type RewardKind = "life" | "slow";

interface FallingPenguin {
  node: Node;
  active: boolean;
  x: number;
  y: number;
  speed: number;
  drift: number;
  phase: number;
}

/**
 * 视频参考版“企鹅叠叠乐”。
 * 背景、固定 UI、企鹅池和堆叠槽全部预先序列化在场景，便于在 Creator 里直接调整。
 */
@ccclass("penguinStackFeedGameScene")
export class penguinStackFeedGameScene extends Component {
  @property({ tooltip: "第一阶段接住数量" }) public stageOneTarget = 10;
  @property({ tooltip: "最终通关数量" }) public finalTarget = 200;
  @property({ tooltip: "初始生命" }) public initialLives = 3;
  @property({ tooltip: "第一阶段掉落速度" }) public stageOneFallSpeed = 310;
  @property({ tooltip: "第二阶段初始掉落速度" }) public stageTwoFallSpeed = 440;
  @property({ tooltip: "第一阶段生成间隔" }) public stageOneSpawnInterval = 0.72;
  @property({ tooltip: "第二阶段生成间隔" }) public stageTwoSpawnInterval = 0.34;

  @property(Node) public sceneBackground: Node = null;
  @property(Node) public playfield: Node = null;
  @property(Node) public whale: Node = null;
  @property(Node) public towerRoot: Node = null;
  @property([Node]) public stackPenguins: Node[] = [];
  @property([Node]) public fallingPenguins: Node[] = [];
  @property([Node]) public heartNodes: Node[] = [];
  @property(Label) public goalLabel: Label = null;
  @property(Label) public caughtLabel: Label = null;
  @property(Label) public stageOneLabel: Label = null;
  @property(Label) public stageTwoLabel: Label = null;
  @property(Node) public guideNode: Node = null;
  @property(Label) public feedbackLabel: Label = null;
  @property(Button) public backButton: Button = null;
  @property(Button) public lifeButton: Button = null;
  @property(Button) public slowButton: Button = null;
  @property(Node) public surgeOverlay: Node = null;
  @property(Node) public surgePanel: Node = null;
  @property(Node) public resultOverlay: Node = null;
  @property(Node) public resultPanel: Node = null;
  @property(Label) public resultTitle: Label = null;
  @property(Label) public resultDetail: Label = null;
  @property(Node) public successCat: Node = null;
  @property(Node) public failCat: Node = null;
  @property(Button) public retryButton: Button = null;
  @property(Button) public nextButton: Button = null;
  @property(Button) public reviveButton: Button = null;
  @property(Button) public shareButton: Button = null;

  private round = new PenguinStackRound();
  private falling: FallingPenguin[] = [];
  private bindings: Array<[Button, () => void]> = [];
  private gameStarted = false;
  private dragging = false;
  private dragStartInputX = 0;
  private dragStartWhaleX = 0;
  private targetWhaleX = 0;
  private whaleX = 0;
  private whaleVelocity = 0;
  private catcherSink = 0;
  private swayTime = 0;
  private stackOffsets = Array(MAX_VISIBLE_STACK).fill(0) as number[];
  private stackOffsetVelocities = Array(MAX_VISIBLE_STACK).fill(0) as number[];
  private spawnTimer = 0;
  private previewTime = 0;
  private feedPreviewVisible = false;
  private feedPreviewPenguinPosition = new Vec3();
  private slowRemaining = 0;
  private surgeRemaining = 0;
  private resultDelay = 0;
  private feedbackRemaining = 0;
  private whaleBounce = 0;
  private screenShake = 0;
  private roundSerial = 0;
  private disposed = false;
  private leaving = false;
  private appHidden = false;
  private adInFlight = false;
  private shareInFlight = false;
  private feedMode = false;
  private feedEntered = false;
  private feedExited = false;
  private feedFinished = false;
  private feedAudioForeground = false;
  private feedAudioGestureRecovered = false;
  private interstitialScheduled = false;
  private nativeTouchApi: any | null = null;
  private nativeTouchBound = false;
  private originalPanelScale = new Vec3(1, 1, 1);
  private originalSurgeScale = new Vec3(1, 1, 1);

  protected onLoad(): void {
    view.setDesignResolutionSize(DESIGN_WIDTH, 1334, ResolutionPolicy.FIXED_WIDTH);
    adc.cancelFeedEntryInterstitial();
    this.validateBindings();
    FeedAcquisitionService.init();
    const state = FeedAcquisitionService.getState();
    this.feedMode = state.active;
    this.feedEntered = !state.active || state.entered;
    this.feedExited = state.active && state.exited;
    this.originalPanelScale.set(this.resultPanel.scale);
    this.originalSurgeScale.set(this.surgePanel.scale);
    this.feedPreviewPenguinPosition.set(this.fallingPenguins[0].position);
    this.falling = this.fallingPenguins.map(node => ({
      node, active: false, x: 0, y: DROP_TOP, speed: 0, drift: 0, phase: 0,
    }));
    const buttonBindings: Array<[Button, () => void]> = [
      [this.backButton, this.returnHome],
      [this.lifeButton, this.onAddLife],
      [this.slowButton, this.onSlowdown],
      [this.retryButton, this.retryRound],
      [this.nextButton, this.goToMainGame],
      [this.reviveButton, this.onRevive],
      [this.shareButton, this.onShare],
    ];
    // 编辑器删除 UI 节点后可能暂时保留 node=null 的组件引用，不能让整个场景初始化中断。
    this.bindings = buttonBindings.filter(([button]) => !!button?.node?.isValid);
    for (const [button, callback] of this.bindings) {
      button.node.on(Button.EventType.CLICK, callback, this);
    }
    input.on(Input.EventType.TOUCH_START, this.onTouchStart, this);
    input.on(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
    input.on(Input.EventType.TOUCH_END, this.onTouchEnd, this);
    input.on(Input.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
    game.on(Game.EVENT_HIDE, this.onHide, this);
    game.on(Game.EVENT_SHOW, this.onShow, this);
    this.resetRound();
  }

  protected start(): void {
    AudioManager.setSoundEvent();
    // 真机可能只把触摸派发到 UI 节点，Canvas 捕获与全局 input 双通道兜底。
    this.node.on(Node.EventType.TOUCH_START, this.onTouchStart, this, true);
    this.node.on(Node.EventType.TOUCH_MOVE, this.onTouchMove, this, true);
    this.node.on(Node.EventType.TOUCH_END, this.onTouchEnd, this, true);
    this.node.on(Node.EventType.TOUCH_CANCEL, this.onTouchEnd, this, true);
    this.bindNativeTouchFallback();
    if (this.feedMode) {
      FeedAcquisitionService.addListener(this.onFeedStateChanged);
      void FeedAcquisitionService.reportSceneReadyAfterStableRender({
        owner: this.node,
        // 对象池中的企鹅会按需显隐，不能要求它们全部可见才能上报就绪。
        requiredVisibleNodes: [this.sceneBackground, this.whale],
        isReady: () => !this.disposed && !this.leaving && !this.feedExited,
        stableFrameCount: 3,
        surfaceDelayMs: 180,
      }).catch(error => console.error("[penguinStackFeedGameScene] 推荐流就绪上报异常", error));
    } else {
      AudioManager.playMusic(soundName.getUserBgm);
    }
  }

  protected update(deltaTime: number): void {
    if (this.disposed || this.leaving || this.appHidden || this.feedExited ||
      this.adInFlight || this.shareInFlight || SdkUtils.isRewardedVideoBusy()) return;
    // 推荐流卡片保持静态，只有正式进入后才更新物体和游戏时间。
    if (!this.isFeedInteractionEnabled()) return;
    const dt = Math.max(0, Math.min(0.06, deltaTime));
    this.previewTime += dt;
    this.updateFeedback(dt);

    this.updateWhale(dt);
    this.updateTower(dt);
    if (!this.gameStarted) return;

    if (this.round.status === "stage-break") {
      this.surgeRemaining = Math.max(0, this.surgeRemaining - dt);
      this.animateSurge();
      if (this.surgeRemaining <= 0) this.finishStageBreak();
      return;
    }

    if (this.round.status === "playing") {
      this.slowRemaining = Math.max(0, this.slowRemaining - dt);
      this.updateFalling(dt);
      this.spawnTimer -= dt;
      while (this.spawnTimer <= 0 && this.spawnOne()) {
        this.spawnTimer += this.currentSpawnInterval();
      }
      this.refreshButtons();
      return;
    }

    if (!this.resultOverlay.active) {
      this.resultDelay = Math.max(0, this.resultDelay - dt);
      if (this.resultDelay <= 0) this.showResult();
    }
  }

  protected onDestroy(): void {
    this.disposed = true;
    this.roundSerial += 1;
    this.unscheduleAllCallbacks();
    input.off(Input.EventType.TOUCH_START, this.onTouchStart, this);
    input.off(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
    input.off(Input.EventType.TOUCH_END, this.onTouchEnd, this);
    input.off(Input.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
    game.off(Game.EVENT_HIDE, this.onHide, this);
    game.off(Game.EVENT_SHOW, this.onShow, this);
    for (const [button, callback] of this.bindings) {
      const node = button?.node;
      if (node?.isValid) node.off(Button.EventType.CLICK, callback, this);
    }
    this.node?.off(Node.EventType.TOUCH_START, this.onTouchStart, this, true);
    this.node?.off(Node.EventType.TOUCH_MOVE, this.onTouchMove, this, true);
    this.node?.off(Node.EventType.TOUCH_END, this.onTouchEnd, this, true);
    this.node?.off(Node.EventType.TOUCH_CANCEL, this.onTouchEnd, this, true);
    this.bindings = [];
    this.unbindNativeTouchFallback();
    this.finishFeed();
  }

  private validateBindings(): void {
    const required = [
      "sceneBackground", "playfield", "whale", "towerRoot", "goalLabel", "caughtLabel",
      "stageOneLabel", "stageTwoLabel", "guideNode", "feedbackLabel", "backButton",
      "lifeButton", "slowButton", "surgeOverlay", "surgePanel",
      "resultOverlay", "resultPanel", "resultTitle", "resultDetail", "successCat", "failCat",
      "retryButton", "nextButton", "reviveButton",
    ];
    const missing = required.filter(key => !this[key]);
    if (this.stackPenguins.length !== MAX_VISIBLE_STACK || this.stackPenguins.some(node => !node)) {
      missing.push(`stackPenguins (${MAX_VISIBLE_STACK})`);
    }
    if (this.fallingPenguins.length < 5 || this.fallingPenguins.some(node => !node)) {
      missing.push("fallingPenguins (>=5)");
    }
    if (this.heartNodes.length !== this.initialLives || this.heartNodes.some(node => !node)) {
      missing.push(`heartNodes (${this.initialLives})`);
    }
    if (missing.length) throw new Error(`[penguinStackFeedGameScene] 场景绑定不完整: ${missing.join(", ")}`);
  }

  private resetRound = (): void => {
    if (this.disposed || this.leaving || this.adInFlight || this.shareInFlight) return;
    this.roundSerial += 1;
    this.round.reset(this.stageOneTarget, this.finalTarget, this.initialLives);
    this.feedPreviewVisible = false;
    this.previewTime = 0;
    this.gameStarted = false;
    this.dragging = false;
    this.dragStartInputX = this.dragStartWhaleX = 0;
    this.whaleX = this.targetWhaleX = 0;
    this.whaleVelocity = 0;
    this.catcherSink = 0;
    this.stackOffsets.fill(0);
    this.stackOffsetVelocities.fill(0);
    this.swayTime = this.spawnTimer = this.slowRemaining = this.surgeRemaining = 0;
    this.resultDelay = this.feedbackRemaining = this.whaleBounce = this.screenShake = 0;
    this.clearFalling();
    this.stackPenguins.forEach(node => node.active = false);
    this.whale.setPosition(0, WHALE_Y, 0);
    this.whale.angle = 0;
    this.towerRoot.setPosition(0, TOWER_Y, 0);
    this.towerRoot.angle = 0;
    this.guideNode.active = true;
    this.feedbackLabel.node.active = false;
    this.surgeOverlay.active = false;
    this.resultOverlay.active = false;
    this.resultPanel.setScale(this.originalPanelScale);
    this.resultPanel.getComponent(UIOpacity).opacity = 255;
    this.refreshHud();
    this.refreshButtons();
  };

  private retryRound = (): void => {
    AudioManager.playEffect(soundName.buttonClick);
    this.resetRound();
  };

  private startGameplay(): void {
    if (this.gameStarted || this.round.status !== "playing") return;
    this.gameStarted = true;
    this.guideNode.active = false;
    this.clearFalling();
    this.stackPenguins.forEach(node => node.active = false);
    this.spawnTimer = 0.12;
    this.setFeedback("接住企鹅！", new Color(255, 92, 164));
  }

  private onTouchStart = (event: EventTouch): void => {
    this.activateFeedFromGesture();
    if (!this.isFeedInteractionEnabled() || this.round.status !== "playing" ||
      this.adInFlight || this.shareInFlight || this.resultOverlay.active) return;
    if (this.isButtonTouch(event)) return;
    this.startGameplay();
    this.beginDrag(this.normalizedTouchX(event));
  };

  private onTouchMove = (event: EventTouch): void => {
    this.activateFeedFromGesture();
    if (!this.isFeedInteractionEnabled() || this.round.status !== "playing" ||
      this.adInFlight || this.shareInFlight || this.resultOverlay.active) return;
    this.startGameplay();
    this.continueDrag(this.normalizedTouchX(event));
  };

  private onTouchEnd = (): void => { this.dragging = false; };

  private normalizedTouchX(event: EventTouch): number {
    const location = event.getUILocation();
    const visible = view.getVisibleSize();
    return visible.width > 0 ? location.x / visible.width : 0.5;
  }

  private normalizedToDesignX(normalizedX: number): number {
    return (Math.max(0, Math.min(1, normalizedX)) - 0.5) * DESIGN_WIDTH;
  }

  private beginDrag(normalizedX: number): void {
    this.dragging = true;
    this.dragStartInputX = this.normalizedToDesignX(normalizedX);
    this.dragStartWhaleX = this.targetWhaleX;
  }

  private continueDrag(normalizedX: number): void {
    const inputX = this.normalizedToDesignX(normalizedX);
    if (!this.dragging) {
      // 首个 TOUCH_START 被宿主吞掉时，第一帧 TOUCH_MOVE 就恢复到手指位置。
      const recoveredX = Math.max(PLAY_LEFT, Math.min(PLAY_RIGHT, inputX));
      this.dragging = true;
      this.dragStartInputX = inputX;
      this.dragStartWhaleX = recoveredX;
      this.targetWhaleX = recoveredX;
      return;
    }
    const draggedX = this.dragStartWhaleX + (inputX - this.dragStartInputX) * 1.12;
    this.targetWhaleX = Math.max(PLAY_LEFT, Math.min(PLAY_RIGHT, draggedX));
  }

  private showFeedPreview(): void {
    if (this.feedPreviewVisible || this.disposed || this.leaving || this.adInFlight || this.shareInFlight) return;
    this.resetRound();
    this.feedPreviewVisible = true;
    // 复用第一只企鹅及它在编辑器中的位置，仅展示图片，不加入下落模拟。
    const penguin = this.fallingPenguins[0];
    penguin.setPosition(this.feedPreviewPenguinPosition);
    penguin.angle = 0;
    penguin.active = true;
  }

  private updateWhale(dt: number, forcedCount = -1): void {
    const count = forcedCount >= 0 ? forcedCount : this.round.caught;
    const wantedSink = penguinStackSink(count, this.whaleHiddenSink(),
      WHALE_HIDDEN_AT, STACK_SPACING);
    this.catcherSink += (wantedSink - this.catcherSink) * Math.min(1, dt * 3.6);
    const previousX = this.whaleX;
    const followRate = this.dragging ? 23 : 14;
    this.whaleX += (this.targetWhaleX - this.whaleX) * Math.min(1, dt * followRate);
    const measuredVelocity = dt > 0 ? (this.whaleX - previousX) / dt : 0;
    this.whaleVelocity += (measuredVelocity - this.whaleVelocity) * Math.min(1, dt * 12);
    if (!this.dragging && Math.abs(this.targetWhaleX - this.whaleX) < 0.2) {
      this.whaleVelocity *= Math.max(0, 1 - dt * 8);
    }
    this.whaleBounce = Math.max(0, this.whaleBounce - dt);
    this.screenShake = Math.max(0, this.screenShake - dt);
    const bounce = this.whaleBounce > 0 ? Math.sin(this.whaleBounce / 0.22 * Math.PI) * 10 : 0;
    const shake = this.screenShake > 0 ? Math.sin(this.screenShake * 80) * 8 : 0;
    this.whale.setPosition(this.whaleX + shake, WHALE_Y - this.catcherSink + bounce, 0);
    const targetAngle = Math.max(-3.2, Math.min(3.2, -this.whaleVelocity * 0.003));
    this.whale.angle += (targetAngle - this.whale.angle) * Math.min(1, dt * 10);
  }

  private updateTower(dt: number, forcedCount = -1): void {
    const totalCount = forcedCount >= 0 ? forcedCount : this.round.caught;
    const count = Math.min(MAX_VISIBLE_STACK, totalCount);
    const hiddenBelow = Math.max(0, totalCount - MAX_VISIBLE_STACK);
    this.swayTime += dt * (1.72 + count * 0.075);
    this.towerRoot.setPosition(this.whaleX, TOWER_Y - this.catcherSink, 0);
    this.towerRoot.angle = 0;

    const dragError = this.targetWhaleX - this.whaleX;
    for (let i = 0; i < this.stackPenguins.length; i++) {
      const node = this.stackPenguins[i];
      if (!node.active || i >= count) {
        this.stackOffsets[i] = 0;
        this.stackOffsetVelocities[i] = 0;
        continue;
      }
      const layer = (i + 1) / Math.max(1, count);
      const layerCurve = Math.pow(layer, 1.22);
      const naturalAmplitude = 3 + layer * (14 + count);
      const natural = Math.sin(this.swayTime - i * 0.13) * naturalAmplitude;
      const inertialLean = -(this.whaleVelocity * 0.036 + dragError * 0.72) * layerCurve;
      const maxOffset = 36 + i * 12;
      const wantedOffset = Math.max(-maxOffset, Math.min(maxOffset, natural + inertialLean));
      const stiffness = 78 - layer * 22;
      const damping = 9.4 - layer * 1.7;
      this.stackOffsetVelocities[i] += (wantedOffset - this.stackOffsets[i]) * stiffness * dt;
      this.stackOffsetVelocities[i] *= Math.exp(-damping * dt);
      this.stackOffsets[i] += this.stackOffsetVelocities[i] * dt;

      const belowOffset = i > 0 ? this.stackOffsets[i - 1] : 0;
      const baseX = this.stackBaseX(i);
      node.setPosition(baseX + this.stackOffsets[i],
        28 + (hiddenBelow + i) * STACK_SPACING, 0);
      const restingAngle = (i % 4 - 1.5) * 0.7;
      const targetAngle = Math.max(-14, Math.min(14,
        restingAngle - (this.stackOffsets[i] - belowOffset) * 0.2 -
        this.whaleVelocity * 0.0012 * layer));
      node.angle += (targetAngle - node.angle) * Math.min(1, dt * (9 - layer * 2));
    }
  }

  private whaleHiddenSink(): number {
    const visibleHeight = view.getVisibleSize().height;
    // Keep the lowest visible penguin tucked behind the bottom controls like the reference.
    return Math.max(0, WHALE_Y + visibleHeight * 0.5 + WHALE_HALF_HEIGHT + 116);
  }

  private missBottomY(): number {
    const belowScreen = -view.getVisibleSize().height * 0.5 - FALLING_HALF_HEIGHT - 36;
    return Math.max(MISS_BOTTOM - this.catcherSink, belowScreen);
  }

  private currentSpawnInterval(): number {
    if (this.round.stage === 1) return this.stageOneSpawnInterval;
    const ramp = Math.min(0.08, this.round.caught * 0.00045);
    return Math.max(0.26, this.stageTwoSpawnInterval - ramp);
  }

  private currentFallSpeed(): number {
    const base = this.round.stage === 1 ? this.stageOneFallSpeed : this.stageTwoFallSpeed;
    const ramp = this.round.stage === 1 ? 0 : Math.min(170, this.round.caught * 0.9);
    return base + ramp;
  }

  private spawnOne(): boolean {
    const item = this.falling.find(entry => !entry.active);
    if (!item) return false;
    item.active = true;
    item.x = PLAY_LEFT + 20 + Math.random() * (PLAY_RIGHT - PLAY_LEFT - 40);
    item.y = DROP_TOP + Math.random() * 45;
    item.speed = this.currentFallSpeed() * (0.92 + Math.random() * 0.18);
    item.drift = (Math.random() * 2 - 1) * 24;
    item.phase = Math.random() * Math.PI * 2;
    item.node.active = true;
    item.node.setPosition(item.x, item.y, 0);
    return true;
  }

  private updateFalling(dt: number): void {
    const speedScale = this.slowRemaining > 0 ? 0.58 : 1;

    for (const item of this.falling) {
      if (!item.active) continue;
      const previousY = item.y;
      item.y -= item.speed * speedScale * dt;
      item.x += item.drift * dt + Math.sin(this.previewTime * 2.4 + item.phase) * 8 * dt;
      item.node.setPosition(item.x, item.y, 0);
      item.node.angle = Math.sin(this.previewTime * 3 + item.phase) * 3.5;

      const catchDistance = this.catchContactDistance(item, previousY);
      if (catchDistance !== null) {
        this.catchPenguin(item, catchDistance);
        continue;
      }
      if (item.y <= this.missBottomY()) this.missPenguin(item);
    }
  }

  /**
   * The reference game accepts any visible edge contact. Test a swept vertical area so a fast
   * falling penguin cannot tunnel through the whale or through an already leaning stack.
   */
  private catchContactDistance(item: FallingPenguin, previousY: number): number | null {
    const visible = Math.min(MAX_VISIBLE_STACK, this.round.caught);
    const topX = visible > 0
      ? this.whaleX + this.stackPenguins[visible - 1].position.x
      : this.whaleX;
    const overlaps = (x: number, y: number, halfWidth: number, halfHeight: number): boolean =>
      sweptPenguinContact(item.x, item.y, previousY, FALLING_HALF_WIDTH,
        FALLING_HALF_HEIGHT, x, y, halfWidth, halfHeight);

    for (let i = visible - 1; i >= 0; i--) {
      const node = this.stackPenguins[i];
      const x = this.whaleX + node.position.x;
      const y = TOWER_Y - this.catcherSink + node.position.y;
      if (overlaps(x, y, STACK_HALF_WIDTH, STACK_HALF_HEIGHT)) {
        return Math.abs(item.x - topX);
      }
    }
    if (overlaps(this.whaleX, WHALE_Y - this.catcherSink, WHALE_HALF_WIDTH, WHALE_HALF_HEIGHT)) {
      return Math.abs(item.x - topX);
    }
    return null;
  }

  private catchPenguin(item: FallingPenguin, contactDistance = 0): void {
    this.releaseFalling(item);
    const result = this.round.catchPenguin();
    if (!result) return;
    this.whaleBounce = 0.22;
    AudioManager.playEffect(soundName.pingPongHit);
    this.renderStack();
    if (contactDistance <= 48) {
      this.setFeedback("完美！", new Color(255, 83, 161));
    } else if (contactDistance <= 112) {
      this.setFeedback("好身手！", new Color(70, 170, 238));
    } else {
      this.setFeedback("擦边接住！", new Color(77, 202, 151));
    }
    this.refreshHud();

    if (result.stageChanged) {
      this.clearFalling();
      this.spawnTimer = 0.2;
      this.surgeRemaining = 1.35;
      this.surgeOverlay.active = true;
      this.surgePanel.setScale(0.72, 0.72, 1);
      this.surgePanel.getComponent(UIOpacity).opacity = 0;
      AudioManager.playEffect(soundName.down);
    } else if (result.completed) {
      this.clearFalling();
      this.resultDelay = 0.38;
    }
  }

  private missPenguin(item: FallingPenguin): void {
    this.releaseFalling(item);
    if (!this.round.missPenguin()) return;
    this.screenShake = 0.24;
    this.setFeedback("太偏了！", new Color(242, 133, 49));
    AudioManager.playEffect(soundName.fail);
    this.refreshHud();
    if (this.round.status === "failed") {
      this.clearFalling();
      this.resultDelay = 0.38;
    }
  }

  private releaseFalling(item: FallingPenguin): void {
    item.active = false;
    item.node.active = false;
  }

  private clearFalling(): void {
    for (const item of this.falling) this.releaseFalling(item);
  }

  private renderStack(): void {
    const visible = Math.min(MAX_VISIBLE_STACK, this.round.caught);
    const hiddenBelow = Math.max(0, this.round.caught - MAX_VISIBLE_STACK);
    for (let i = 0; i < this.stackPenguins.length; i++) {
      const node = this.stackPenguins[i];
      const wasActive = node.active;
      node.active = i < visible;
      if (!node.active) continue;
      if (!wasActive) {
        this.stackOffsets[i] = i > 0 ? this.stackOffsets[i - 1] : 0;
        this.stackOffsetVelocities[i] = i > 0 ? this.stackOffsetVelocities[i - 1] * 0.7 : 0;
      }
      node.setPosition(this.stackBaseX(i) + this.stackOffsets[i],
        28 + (hiddenBelow + i) * STACK_SPACING, 0);
      if (!wasActive) node.angle = (i % 4 - 1.5) * 0.7;
    }
  }

  private stackBaseX(index: number): number {
    const layeredOffsets = [-10, 7, -6, 10, -8, 5, -11, 8, -4, 6];
    return layeredOffsets[index % layeredOffsets.length];
  }

  private animateSurge(): void {
    const elapsed = 1.35 - this.surgeRemaining;
    const t = Math.min(1, elapsed / 0.28);
    const eased = 1 - Math.pow(1 - t, 3);
    const pulse = 1 + Math.sin(elapsed * 18) * 0.035 * (1 - t);
    this.surgePanel.setScale(
      this.originalSurgeScale.x * (0.72 + eased * 0.28) * pulse,
      this.originalSurgeScale.y * (0.72 + eased * 0.28) * pulse,
      1,
    );
    this.surgePanel.getComponent(UIOpacity).opacity = Math.round(255 * t);
  }

  private finishStageBreak(): void {
    this.surgeOverlay.active = false;
    this.surgePanel.setScale(this.originalSurgeScale);
    this.round.continueAfterStageBreak();
    this.gameStarted = false;
    this.dragging = false;
    this.dragStartInputX = this.dragStartWhaleX = 0;
    this.whaleX = this.targetWhaleX = 0;
    this.whaleVelocity = 0;
    this.catcherSink = 0;
    this.swayTime = 0;
    this.stackOffsets.fill(0);
    this.stackOffsetVelocities.fill(0);
    this.clearFalling();
    this.stackPenguins.forEach(node => node.active = false);
    this.whale.setPosition(0, WHALE_Y, 0);
    this.whale.angle = 0;
    this.towerRoot.setPosition(0, TOWER_Y, 0);
    this.towerRoot.angle = 0;
    this.guideNode.active = true;
    this.feedbackLabel.node.active = false;
    this.feedbackRemaining = 0;
    this.spawnTimer = 0;
    this.refreshHud();
    this.refreshButtons();
  }

  private refreshHud(): void {
    this.goalLabel.string = `用鲸鱼接住${this.round.target}只企鹅`;
    this.caughtLabel.string = `已接住${this.round.caught}只企鹅`;
    this.heartNodes.forEach((node, index) => node.active = index < this.round.lives);
    this.stageOneLabel.color = this.round.stage === 1
      ? new Color(219, 80, 229) : new Color(105, 101, 107);
    this.stageTwoLabel.color = this.round.stage === 2
      ? new Color(219, 80, 229) : new Color(105, 101, 107);
  }

  private refreshButtons(): void {
    const enabled = !this.disposed && !this.leaving && !this.adInFlight && !this.shareInFlight;
    for (const button of [this.backButton, this.retryButton, this.nextButton,
      this.reviveButton, this.shareButton]) {
      if (button?.node?.isValid) button.interactable = enabled;
    }
    const rewardEnabled = enabled && this.gameStarted && this.round.status === "playing" &&
      this.isFeedInteractionEnabled();
    for (const button of [this.lifeButton, this.slowButton]) {
      if (button?.node?.isValid) button.interactable = rewardEnabled;
    }
  }

  private setFeedback(text: string, color: Color): void {
    this.feedbackLabel.string = text;
    this.feedbackLabel.color = color;
    this.feedbackLabel.node.active = true;
    this.feedbackLabel.node.getComponent(UIOpacity).opacity = 255;
    this.feedbackRemaining = 0.68;
  }

  private updateFeedback(dt: number): void {
    if (this.feedbackRemaining <= 0) return;
    this.feedbackRemaining = Math.max(0, this.feedbackRemaining - dt);
    this.feedbackLabel.node.active = this.feedbackRemaining > 0;
    const opacity = this.feedbackLabel.node.getComponent(UIOpacity);
    opacity.opacity = Math.round(255 * Math.min(1, this.feedbackRemaining / 0.22));
  }

  private showResult(): void {
    const success = this.round.status === "success";
    this.resultTitle.string = success ? "恭喜过关！" : "失败";
    this.resultTitle.color = success ? new Color(213, 82, 105) : new Color(79, 70, 103);
    this.resultDetail.string = success
      ? `企鹅全部接住，挑战成功！\n共接住 ${this.round.caught} 只企鹅`
      : `左右滑动接住动物\n本局接住 ${this.round.caught} 只企鹅`;
    this.successCat.active = success;
    this.failCat.active = !success;
    this.nextButton.node.active = success;
    this.reviveButton.node.active = !success;
    this.resultOverlay.active = true;
    this.resultPanel.setScale(this.originalPanelScale);
    this.resultPanel.getComponent(UIOpacity).opacity = 255;
    this.refreshButtons();
    if (success) AudioManager.playEffect(soundName.down);
    if (success) this.finishFeed();
  }

  private onAddLife = (): void => {
    if (this.round.lives >= this.initialLives) {
      AudioManager.playEffect(soundName.buttonClick);
      this.toast("生命值已满");
      return;
    }
    void this.requestReward("life");
  };
  private onSlowdown = (): void => { void this.requestReward("slow"); };

  private async requestReward(kind: RewardKind): Promise<void> {
    if (!this.gameStarted || !this.isFeedInteractionEnabled() || this.round.status !== "playing" ||
      this.adInFlight || this.shareInFlight || this.resultOverlay.active) return;
    AudioManager.playEffect(soundName.buttonClick);
    const serial = this.roundSerial;
    this.adInFlight = true;
    this.refreshButtons();
    let rewarded = false;
    try {
      rewarded = await SdkUtils.showRewardedVideo();
    } catch (error) {
      console.warn("[penguinStackFeedGameScene] 激励视频失败", error);
    }
    if (this.disposed || !this.node?.isValid || this.leaving || serial !== this.roundSerial) return;
    this.adInFlight = false;
    if (!rewarded) {
      this.toast("完整看完广告才能获得奖励");
      this.refreshButtons();
      return;
    }
    if (kind === "life") {
      this.round.addLife(1);
      this.setFeedback("生命 +1", new Color(255, 81, 104));
    } else {
      this.slowRemaining = Math.max(this.slowRemaining, 12);
      this.setFeedback("企鹅减速 12 秒", new Color(80, 202, 154));
    }
    this.refreshHud();
    this.refreshButtons();
  }

  private onRevive = (): void => { void this.reviveAfterAd(); };

  private async reviveAfterAd(): Promise<void> {
    if (this.round.status !== "failed" || this.adInFlight || this.shareInFlight) return;
    AudioManager.playEffect(soundName.buttonClick);
    const serial = this.roundSerial;
    this.adInFlight = true;
    this.refreshButtons();
    let rewarded = false;
    try { rewarded = await SdkUtils.showRewardedVideo(); }
    catch (error) { console.warn("[penguinStackFeedGameScene] 复活广告失败", error); }
    if (this.disposed || !this.node?.isValid || this.leaving || serial !== this.roundSerial) return;
    this.adInFlight = false;
    if (!rewarded || !this.round.revive()) {
      if (!rewarded) this.toast("完整看完广告才能复活");
      this.refreshButtons();
      return;
    }
    this.resultOverlay.active = false;
    this.spawnTimer = 0.24;
    this.slowRemaining = Math.max(this.slowRemaining, 2);
    this.setFeedback("复活成功！", new Color(255, 83, 161));
    this.refreshHud();
    this.refreshButtons();
  }

  private onShare = (): void => { void this.shareForHelp(); };

  private async shareForHelp(): Promise<void> {
    if (this.shareInFlight || this.adInFlight || this.leaving) return;
    AudioManager.playEffect(soundName.buttonClick);
    this.shareInFlight = true;
    this.refreshButtons();
    const shared = await SdkUtils.share({ title: "企鹅叠叠乐，看看你能接住多少只！" });
    if (this.disposed || !this.node?.isValid || this.leaving) return;
    this.shareInFlight = false;
    if (!shared) this.toast("分享未完成");
    this.refreshButtons();
  }

  private returnHome = (): void => {
    AudioManager.playEffect(soundName.buttonClick);
    void this.navigate(GameSceneName.Main);
  };

  private goToMainGame = (): void => {
    if (this.round.status !== "success") return;
    AudioManager.playEffect(soundName.buttonClick);
    void this.navigate(GameSceneName.Game);
  };

  private async navigate(scene: GameSceneName): Promise<void> {
    if (this.disposed || this.leaving || this.adInFlight || this.shareInFlight) return;
    this.leaving = true;
    this.refreshButtons();
    this.finishFeed();
    this.feedMode = false;
    this.feedEntered = true;
    this.feedExited = false;
    AudioManager.playDefaultBgm();
    try {
      await GameSceneBundle.loadScene(scene);
    } catch (error) {
      if (this.disposed || !this.node?.isValid) return;
      this.leaving = false;
      this.refreshButtons();
      AudioManager.playMusic(soundName.getUserBgm);
      this.toast("场景加载失败，请重试");
      console.error("[penguinStackFeedGameScene] 切换场景失败", error);
    }
  }

  private isButtonTouch(event: EventTouch): boolean {
    return this.bindings.some(([button]) => {
      const node = button?.node;
      return !!node?.isValid && node.activeInHierarchy &&
        !!node.getComponent(UITransform)?.hitTest(event.getLocation(), event.windowId);
    });
  }

  private readonly onFeedStateChanged = (state: FeedAcquisitionState): void => {
    if (this.disposed || this.leaving) return;
    this.feedMode = state.active;
    this.feedEntered = !state.active || state.entered;
    this.feedExited = state.active && state.exited;
    if (state.active && (!state.entered || state.exited)) {
      this.showFeedPreview();
    } else if (this.feedPreviewVisible) {
      // 从卡片正式进入时清空展示企鹅，鲸鱼、计数、生命和掉落计时全部从头开始。
      this.resetRound();
    }
    // 展示阶段也播放 BGM，玩法交互和插屏仍等待正式进入。
    if (!this.appHidden && !this.adInFlight && !this.shareInFlight && !SdkUtils.isRewardedVideoBusy()) {
      if (!this.feedAudioForeground) {
        this.feedAudioForeground = true;
        AudioManager.restartMusic(soundName.getUserBgm);
      } else AudioManager.playMusic(soundName.getUserBgm);
    }
    if (this.feedExited || (state.active && !state.entered)) {
      adc.cancelFeedEntryInterstitial();
      this.interstitialScheduled = false;
      this.dragging = false;
      this.feedAudioGestureRecovered = false;
    } else if (!state.active) {
      adc.cancelFeedEntryInterstitial();
      this.interstitialScheduled = false;
    } else {
      if (state.active && state.entered && !this.interstitialScheduled) {
        this.interstitialScheduled = true;
        adc.scheduleFeedEntryInterstitial(() => {
          const current = FeedAcquisitionService.getState();
          return !this.disposed && !this.leaving && !this.feedFinished &&
            !!this.node?.isValid && current.active && current.entered && !current.exited;
        });
      }
    }
    this.refreshButtons();
  };

  private activateFeedFromGesture(): void {
    if (FeedAcquisitionService.isActive()) FeedAcquisitionService.activateFromFirstTouch();
    const state = FeedAcquisitionService.getState();
    if (state.active && (!state.entered || state.exited)) return;
    if (state.active && !this.feedAudioGestureRecovered) {
      this.feedAudioGestureRecovered = true;
      AudioManager.restartMusic(soundName.getUserBgm);
    }
  }

  private isFeedInteractionEnabled(): boolean {
    return !this.feedMode || (this.feedEntered && !this.feedExited);
  }

  private finishFeed(): void {
    adc.cancelFeedEntryInterstitial();
    this.interstitialScheduled = false;
    FeedAcquisitionService.removeListener(this.onFeedStateChanged);
    if (!this.feedMode || this.feedFinished) return;
    this.feedFinished = true;
    FeedAcquisitionService.completeSession();
  }

  private onHide = (): void => {
    this.appHidden = true;
    this.dragging = false;
    this.feedAudioForeground = false;
    AudioManager.pauseBgmForVideo();
  };

  private onShow = (): void => {
    this.appHidden = false;
    if (!this.disposed && !this.leaving && !this.adInFlight && !this.shareInFlight && !SdkUtils.isRewardedVideoBusy()) {
      this.feedAudioForeground = true;
      AudioManager.restartMusic(soundName.getUserBgm);
    }
    this.refreshButtons();
  };

  private bindNativeTouchFallback(): void {
    if (this.nativeTouchBound) return;
    try {
      const api = typeof tt !== "undefined" ? tt : null;
      if (!api || typeof api.onTouchStart !== "function" ||
        typeof api.onTouchMove !== "function" || typeof api.onTouchEnd !== "function") return;
      api.onTouchStart(this.onNativeTouchStart);
      api.onTouchMove(this.onNativeTouchMove);
      api.onTouchEnd(this.onNativeTouchEnd);
      api.onTouchCancel?.(this.onNativeTouchEnd);
      this.nativeTouchApi = api;
      this.nativeTouchBound = true;
      console.log("[penguinStackFeedGameScene] 真机原生触摸兜底已启用");
    } catch (error) {
      console.warn("[penguinStackFeedGameScene] 真机原生触摸兜底注册失败", error);
    }
  }

  private unbindNativeTouchFallback(): void {
    if (!this.nativeTouchBound || !this.nativeTouchApi) return;
    const api = this.nativeTouchApi;
    try {
      api.offTouchStart?.(this.onNativeTouchStart);
      api.offTouchMove?.(this.onNativeTouchMove);
      api.offTouchEnd?.(this.onNativeTouchEnd);
      api.offTouchCancel?.(this.onNativeTouchEnd);
    } catch (error) {
      console.warn("[penguinStackFeedGameScene] 真机原生触摸兜底解绑失败", error);
    }
    this.nativeTouchApi = null;
    this.nativeTouchBound = false;
  }

  private readonly onNativeTouchStart = (event: any): void => {
    const feedState = FeedAcquisitionService.getState();
    const enteringFeed = feedState.active && !feedState.entered;
    this.activateFeedFromGesture();
    if (!this.isFeedInteractionEnabled() || this.round.status !== "playing" ||
      this.adInFlight || this.shareInFlight || this.resultOverlay.active) return;
    this.startGameplay();
    // 推荐流“立即去玩”的点击只负责进入；普通入口与已进入状态立即开始拖动。
    if (!enteringFeed) this.beginNativeDrag(event);
  };

  private readonly onNativeTouchMove = (event: any): void => {
    this.activateFeedFromGesture();
    if (!this.isFeedInteractionEnabled() || this.round.status !== "playing" ||
      this.adInFlight || this.shareInFlight || this.resultOverlay.active) return;
    this.startGameplay();
    this.continueNativeDrag(event);
  };

  private readonly onNativeTouchEnd = (): void => { this.dragging = false; };

  private nativeNormalizedTouchX(event: any): number | null {
    const touch = event?.touches?.[0] ?? event?.changedTouches?.[0];
    const rawX = Number(touch?.clientX ?? touch?.pageX ?? touch?.x);
    if (!Number.isFinite(rawX)) return null;
    let width = 0;
    try {
      const info = this.nativeTouchApi?.getSystemInfoSync?.();
      width = Number(info?.windowWidth ?? info?.screenWidth ?? 0);
    } catch {
      // Fall back to the Cocos visible area below.
    }
    if (!(width > 0)) width = view.getVisibleSize().width;
    return width > 0 ? rawX / width : null;
  }

  private beginNativeDrag(event: any): void {
    const normalizedX = this.nativeNormalizedTouchX(event);
    if (normalizedX !== null) this.beginDrag(normalizedX);
  }

  private continueNativeDrag(event: any): void {
    const normalizedX = this.nativeNormalizedTouchX(event);
    if (normalizedX !== null) this.continueDrag(normalizedX);
  }

  private toast(title: string): void {
    try {
      if (typeof tt !== "undefined" && typeof tt.showToast === "function") {
        tt.showToast({ title, icon: "none" });
      } else {
        console.log(`[penguinStackFeedGameScene] ${title}`);
      }
    } catch {
      console.log(`[penguinStackFeedGameScene] ${title}`);
    }
  }
}
