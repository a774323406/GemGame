import {
  _decorator,
  Button,
  Component,
  EventTouch,
  game,
  Game,
  input,
  Input,
  Label,
  Node,
  ResolutionPolicy,
  tween,
  Tween,
  UIOpacity,
  UITransform,
  Vec3,
  view,
} from "cc";
import AudioManager from "./framework/AudioManager";
import { GameSceneBundle, GameSceneName } from "./framework/GameSceneBundle";
import {
  FeedAcquisitionService,
  FeedAcquisitionState,
} from "./framework/Platform/FeedAcquisitionService";
import { adc } from "./framework/Platform/ADController";
import { SdkUtils } from "./framework/Platform/sdk/SdkUtils";
import { soundName } from "./gamePrefabMgr";

const { ccclass, property } = _decorator;

const DESIGN_WIDTH = 750;
const DESIGN_HEIGHT = 1334;
const REQUIRED_HITS = 12;
const TARGET_SPEED = 330;
const TARGET_SPACING = 285;
const TARGET_WRAP_LEFT = -465;
const TARGET_Y = -230;
const PROJECTILE_START_X = 0;
const PROJECTILE_START_Y = 245;
const PROJECTILE_INITIAL_VY = -180;
const PROJECTILE_GRAVITY = -1500;
// 笔芯底端恰好接触笔套顶端时，笔芯中心所在的世界坐标。
const PROJECTILE_HIT_Y = 112;
const PROJECTILE_MISS_Y = -760;
const PROJECTILE_MISS_HALF_WIDTH = 500;
const SUCCESS_HALF_WIDTH = 22;
const COLLISION_HALF_WIDTH = 52;
// target-pen.png 左侧包含笔夹，笔套轴线相对整图中心向右偏约 10px。
const PEN_SOCKET_LOCAL_X = 10;
// 目标钢笔中心在 -230，笔芯半高 110：342 可让插入节点与落下节点无缝衔接。
const INSERTED_START_Y = 342;
// 保留约 54px 在笔套外，与参考视频最终露出的长度一致。
const INSERTED_END_Y = 176;
const SLOWDOWN_SPEED_SCALE = 0.62;

type RoundState = "ready" | "playing" | "complete" | "failed" | "leaving";
type ProjectileState = "idle" | "falling" | "deflected";

interface TargetState {
  root: Node;
  insertedRefill: Node;
  baseY: number;
  occupied: boolean;
}

/**
 * 推荐流“插入笔芯”小游戏。
 *
 * 背景、图片、标题、提示、计数、按钮和结果面板都已经放进场景，方便直接在
 * Creator 中调整；脚本只负责移动、投放、命中判定和推荐流生命周期。
 */
@ccclass("penRefillFeedGameScene")
export class penRefillFeedGameScene extends Component {
  @property(Node)
  public sceneBackground: Node | null = null;

  @property(Button)
  public sceneBackButton: Button | null = null;

  @property(Label)
  public sceneTitleLabel: Label | null = null;

  @property(Label)
  public sceneInstructionLabel: Label | null = null;

  @property(Label)
  public sceneRemainingLabel: Label | null = null;

  @property(Label)
  public sceneTimerLabel: Label | null = null;

  @property(Node)
  public sceneReadyHand: Node | null = null;

  @property(Node)
  public sceneProjectileRefill: Node | null = null;

  @property(Label)
  public sceneHintLabel: Label | null = null;

  @property([Node])
  public sceneTargetRoots: Node[] = [];

  @property(Node)
  public sceneResultOverlay: Node | null = null;

  @property(Node)
  public sceneResultPanel: Node | null = null;

  @property(Label)
  public sceneResultTitle: Label | null = null;

  @property(Label)
  public sceneResultDetail: Label | null = null;

  @property(Button)
  public sceneRetryButton: Button | null = null;

  @property(Button)
  public sceneNextButton: Button | null = null;

  @property(Button)
  public sceneSlowdownButton: Button | null = null;

  private roundState: RoundState = "ready";
  private targets: TargetState[] = [];
  private projectileState: ProjectileState = "idle";
  private projectileVelocity = new Vec3();
  private projectileAngularVelocity = 0;
  private projectileChecked = false;
  private successfulHits = 0;
  private targetSpeedScale = 1;
  private slowdownUsed = false;
  private adInFlight = false;
  private feedMode = false;
  private feedEntered = false;
  private feedExited = false;
  private feedAudioForeground = false;
  private feedInterstitialScheduled = false;
  private feedExperienceFinished = false;

  protected onLoad(): void {
    view.setDesignResolutionSize(DESIGN_WIDTH, DESIGN_HEIGHT, ResolutionPolicy.FIXED_WIDTH);
    adc.cancelFeedEntryInterstitial();
    FeedAcquisitionService.init();
    this.feedMode = FeedAcquisitionService.isActive();
    const feedState = FeedAcquisitionService.getState();
    this.feedEntered = !this.feedMode || feedState.entered;
    this.feedExited = this.feedMode && feedState.exited;

    this.bindSceneNodes();
    this.resetRound();
    this.bindEvents();
  }

  protected start(): void {
    AudioManager.setSoundEvent();
    if (this.feedMode) {
      FeedAcquisitionService.addListener(this.onFeedStateChanged);
      void this.reportFeedSceneReady();
    } else {
      AudioManager.playMusic(soundName.getUserBgm);
    }
  }

  protected update(deltaTime: number): void {
    if (this.roundState === "leaving" || this.feedExited) return;
    if (this.adInFlight) return;
    if (this.sceneResultOverlay?.active) return;
    const dt = Math.min(0.04, Math.max(0, deltaTime));
    this.updateTargets(dt);

    if (this.roundState !== "playing") return;
    if (this.projectileState !== "idle") this.updateProjectile(dt);
  }

  protected onDestroy(): void {
    adc.cancelFeedEntryInterstitial();
    FeedAcquisitionService.removeListener(this.onFeedStateChanged);
    if (this.feedMode && !this.feedExperienceFinished) {
      this.feedExperienceFinished = true;
      FeedAcquisitionService.completeSession();
    }
    game.off(Game.EVENT_HIDE, this.onGameHide, this);
    game.off(Game.EVENT_SHOW, this.onGameShow, this);
    input.off(Input.EventType.TOUCH_START, this.onGlobalTouchStart, this);
    input.off(Input.EventType.TOUCH_END, this.onGlobalTouchEnd, this);
    input.off(Input.EventType.TOUCH_CANCEL, this.onGlobalTouchCancel, this);
    this.sceneBackButton?.node?.off(Button.EventType.CLICK, this.returnToMain, this);
    this.sceneRetryButton?.node?.off(Button.EventType.CLICK, this.retryRound, this);
    this.sceneNextButton?.node?.off(Button.EventType.CLICK, this.goToMainGame, this);
    this.sceneSlowdownButton?.node?.off(Button.EventType.CLICK, this.onSlowdownPressed, this);
    this.unscheduleAllCallbacks();
  }

  private bindSceneNodes(): void {
    const roots = this.sceneTargetRoots.filter((node) => node?.isValid);
    this.targets = roots.map((root) => {
      const insertedRefill = root.getChildByName("InsertedRefill");
      if (!insertedRefill) {
        throw new Error(`[penRefillFeedGameScene] ${root.name} 缺少 InsertedRefill 节点`);
      }
      return {
        root,
        insertedRefill,
        baseY: root.position.y,
        occupied: false,
      };
    });

    if (
      !this.sceneBackground?.isValid ||
      !this.sceneBackButton?.node?.isValid ||
      !this.sceneRemainingLabel?.isValid ||
      !this.sceneTimerLabel?.isValid ||
      !this.sceneReadyHand?.isValid ||
      !this.sceneProjectileRefill?.isValid ||
      !this.sceneHintLabel?.isValid ||
      !this.sceneResultOverlay?.isValid ||
      !this.sceneResultPanel?.isValid ||
      !this.sceneResultTitle?.isValid ||
      !this.sceneResultDetail?.isValid ||
      !this.sceneRetryButton?.node?.isValid ||
      !this.sceneNextButton?.node?.isValid ||
      !this.sceneSlowdownButton?.node?.isValid ||
      this.targets.length === 0
    ) {
      throw new Error("[penRefillFeedGameScene] 场景节点绑定不完整，请在 Creator 属性面板检查引用");
    }
  }

  private bindEvents(): void {
    this.sceneBackButton?.node?.on(Button.EventType.CLICK, this.returnToMain, this);
    this.sceneRetryButton?.node?.on(Button.EventType.CLICK, this.retryRound, this);
    this.sceneNextButton?.node?.on(Button.EventType.CLICK, this.goToMainGame, this);
    this.sceneSlowdownButton?.node?.on(Button.EventType.CLICK, this.onSlowdownPressed, this);
    game.on(Game.EVENT_HIDE, this.onGameHide, this);
    game.on(Game.EVENT_SHOW, this.onGameShow, this);
    input.on(Input.EventType.TOUCH_START, this.onGlobalTouchStart, this);
    input.on(Input.EventType.TOUCH_END, this.onGlobalTouchEnd, this);
    input.on(Input.EventType.TOUCH_CANCEL, this.onGlobalTouchCancel, this);
  }

  private resetRound(): void {
    Tween.stopAllByTarget(this.sceneResultPanel);
    const retryOpacity = this.sceneRetryButton.node.getComponent(UIOpacity);
    const nextOpacity = this.sceneNextButton.node.getComponent(UIOpacity);
    if (retryOpacity) {
      Tween.stopAllByTarget(retryOpacity);
      retryOpacity.opacity = 255;
    }
    if (nextOpacity) {
      Tween.stopAllByTarget(nextOpacity);
      nextOpacity.opacity = 255;
    }
    for (const target of this.targets) Tween.stopAllByTarget(target.root);

    this.roundState = "ready";
    this.projectileState = "idle";
    this.projectileVelocity.set(0, 0, 0);
    this.projectileAngularVelocity = 0;
    this.projectileChecked = false;
    this.successfulHits = 0;
    this.targetSpeedScale = 1;
    this.slowdownUsed = false;
    this.adInFlight = false;
    this.sceneProjectileRefill.active = false;
    this.sceneProjectileRefill.setPosition(PROJECTILE_START_X, PROJECTILE_START_Y, 0);
    this.sceneProjectileRefill.angle = 0;
    this.sceneResultOverlay.active = false;
    this.sceneResultPanel.setScale(Vec3.ONE);
    this.sceneRetryButton.node.active = false;
    this.sceneNextButton.node.active = false;
    this.sceneSlowdownButton.node.active = true;
    this.sceneSlowdownButton.interactable = true;
    this.sceneRemainingLabel.string = `还需要放入${REQUIRED_HITS}个`;
    this.sceneHintLabel.string = "点击屏幕开始";

    const startX = -285;
    for (let index = 0; index < this.targets.length; index++) {
      const target = this.targets[index];
      target.root.setPosition(startX + index * TARGET_SPACING, TARGET_Y, 0);
      target.root.setScale(Vec3.ONE);
      target.baseY = TARGET_Y;
      this.resetTargetInsertion(target);
    }
  }

  private updateTargets(deltaTime: number): void {
    if (this.targets.length === 0) return;
    let furthestX = Math.max(...this.targets.map((target) => target.root.position.x));
    for (const target of this.targets) {
      const nextX = target.root.position.x - TARGET_SPEED * this.targetSpeedScale * deltaTime;
      if (nextX < TARGET_WRAP_LEFT) {
        const wrappedX = furthestX + TARGET_SPACING;
        this.resetTargetInsertion(target);
        target.root.setPosition(wrappedX, target.baseY, 0);
        furthestX = wrappedX;
      } else {
        target.root.setPosition(nextX, target.baseY, 0);
      }
    }
  }

  private updateProjectile(deltaTime: number): void {
    const projectile = this.sceneProjectileRefill;
    this.projectileVelocity.y += PROJECTILE_GRAVITY * deltaTime;
    const nextX = projectile.position.x + this.projectileVelocity.x * deltaTime;
    const nextY = projectile.position.y + this.projectileVelocity.y * deltaTime;
    projectile.setPosition(nextX, nextY, 0);
    if (this.projectileState === "deflected") {
      projectile.angle += this.projectileAngularVelocity * deltaTime;
    }

    if (this.projectileState === "falling" && !this.projectileChecked && nextY <= PROJECTILE_HIT_Y) {
      this.projectileChecked = true;
      const target = this.findCollidingTarget();
      if (target) {
        // 低帧率下也把接触点固定在笔套口，避免一帧跨过碰撞面后才出现反弹/插入。
        projectile.setPosition(nextX, PROJECTILE_HIT_Y, 0);
        const socketWorldX = target.root.position.x + PEN_SOCKET_LOCAL_X;
        const offset = projectile.position.x - socketWorldX;
        if (!target.occupied && Math.abs(offset) <= SUCCESS_HALF_WIDTH) {
          this.completeHit(target, offset);
          return;
        }
        this.deflectProjectile(offset);
      }
    }

    if (nextY <= PROJECTILE_MISS_Y || Math.abs(nextX) >= PROJECTILE_MISS_HALF_WIDTH) {
      this.finishProjectile();
      if (this.sceneHintLabel?.isValid && this.roundState === "playing") {
        this.sceneHintLabel.string = "差一点，再看准时机";
      }
    }
  }

  private findCollidingTarget(): TargetState | null {
    let result: TargetState | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const target of this.targets) {
      const socketWorldX = target.root.position.x + PEN_SOCKET_LOCAL_X;
      const distance = Math.abs(socketWorldX - PROJECTILE_START_X);
      if (distance <= COLLISION_HALF_WIDTH && distance < bestDistance) {
        result = target;
        bestDistance = distance;
      }
    }
    return result;
  }

  private completeHit(target: TargetState, impactOffsetX: number): void {
    this.finishProjectile();
    this.successfulHits += 1;
    target.occupied = true;
    Tween.stopAllByTarget(target.insertedRefill);
    target.insertedRefill.active = true;
    // 先保持落点的世界坐标，再在插入过程中自动归中，避免命中瞬间横向跳变。
    target.insertedRefill.setPosition(PEN_SOCKET_LOCAL_X + impactOffsetX, INSERTED_START_Y, 0);
    target.insertedRefill.angle = 0;
    tween(target.insertedRefill)
      .to(0.24, { position: new Vec3(PEN_SOCKET_LOCAL_X, INSERTED_END_Y, 0) }, { easing: "quadIn" })
      .start();
    AudioManager.playEffect(soundName.down);

    const remaining = Math.max(0, REQUIRED_HITS - this.successfulHits);
    this.sceneRemainingLabel.string = `还需要放入${remaining}个`;
    this.sceneHintLabel.string = `插入成功 ${this.successfulHits}/${REQUIRED_HITS}`;
    if (remaining === 0) this.completeRound();
  }

  private finishProjectile(): void {
    this.projectileState = "idle";
    this.projectileVelocity.set(0, 0, 0);
    this.projectileAngularVelocity = 0;
    this.projectileChecked = false;
    this.sceneProjectileRefill.active = false;
    this.sceneProjectileRefill.setPosition(PROJECTILE_START_X, PROJECTILE_START_Y, 0);
    this.sceneProjectileRefill.angle = 0;
  }

  /** 擦到笔身/已有笔芯时，保留重力并施加侧向冲量和旋转，模拟原视频的撞飞效果。 */
  private deflectProjectile(offset: number): void {
    const direction = Math.sign(offset || 1);
    this.projectileState = "deflected";
    this.projectileVelocity.x = direction * (380 + Math.abs(offset) * 4);
    this.projectileVelocity.y = -180;
    this.projectileAngularVelocity = direction * 420;
    AudioManager.playEffect(soundName.fail);
    if (this.sceneHintLabel?.isValid) this.sceneHintLabel.string = "撞偏了，再对准一点";
  }

  private resetTargetInsertion(target: TargetState): void {
    target.occupied = false;
    Tween.stopAllByTarget(target.insertedRefill);
    target.insertedRefill.active = false;
    target.insertedRefill.setPosition(PEN_SOCKET_LOCAL_X, INSERTED_START_Y, 0);
    target.insertedRefill.angle = 0;
  }

  private onGlobalTouchStart = (): void => {
    if (this.roundState === "complete" || this.roundState === "failed" || this.roundState === "leaving") return;
    if (FeedAcquisitionService.isActive()) FeedAcquisitionService.activateFromFirstTouch();
  };

  private onGlobalTouchEnd = (event: EventTouch): void => {
    if (!this.isInteractionEnabled()) return;
    const touchedNode = event.target as Node | null;
    if (
      this.isNodeInside(touchedNode, this.sceneBackButton?.node) ||
      this.isTouchInsideNode(event, this.sceneBackButton?.node) ||
      this.isNodeInside(touchedNode, this.sceneRetryButton?.node) ||
      this.isTouchInsideNode(event, this.sceneRetryButton?.node) ||
      this.isNodeInside(touchedNode, this.sceneNextButton?.node) ||
      this.isTouchInsideNode(event, this.sceneNextButton?.node) ||
      this.isNodeInside(touchedNode, this.sceneSlowdownButton?.node) ||
      this.isTouchInsideNode(event, this.sceneSlowdownButton?.node)
    ) {
      return;
    }
    if (this.roundState === "complete" || this.roundState === "failed" || this.roundState === "leaving") return;
    if (this.projectileState !== "idle" || this.adInFlight) return;

    if (this.roundState === "ready") {
      this.roundState = "playing";
      this.sceneHintLabel.string = "看准笔帽中心再点";
    }
    AudioManager.playEffect(soundName.up);
    this.projectileState = "falling";
    this.projectileVelocity.set(0, PROJECTILE_INITIAL_VY, 0);
    this.projectileAngularVelocity = 0;
    this.projectileChecked = false;
    this.sceneProjectileRefill.active = true;
    this.sceneProjectileRefill.setPosition(PROJECTILE_START_X, PROJECTILE_START_Y, 0);
    this.sceneProjectileRefill.angle = 0;
  };

  private onGlobalTouchCancel = (): void => {};

  private onSlowdownPressed = async (): Promise<void> => {
    const button = this.sceneSlowdownButton;
    if (
      !this.isInteractionEnabled() ||
      (this.roundState !== "ready" && this.roundState !== "playing") ||
      this.adInFlight ||
      this.slowdownUsed ||
      !button?.interactable ||
      SdkUtils.isRewardedVideoBusy()
    ) return;

    AudioManager.playEffect(soundName.buttonClick);
    this.adInFlight = true;
    button.interactable = false;
    const rewarded = await SdkUtils.showRewardedVideo();
    if (!this.node?.isValid) return;

    this.adInFlight = false;
    if (!rewarded) {
      if (button.isValid) button.interactable = true;
      this.showDouyinToast("完整看完广告才能获得降速");
      return;
    }

    this.slowdownUsed = true;
    this.targetSpeedScale = SLOWDOWN_SPEED_SCALE;
    this.showDouyinToast("钢笔速度已降低");
  };

  private completeRound(): void {
    if (this.roundState !== "playing") return;
    this.roundState = "complete";
    this.finishProjectile();
    this.scheduleOnce(() => {
      this.showResult("挑战成功！", "12根笔芯全部插好了", true);
    }, 0.4);
  }

  private showResult(title: string, detail: string, success: boolean): void {
    if (!this.sceneResultOverlay?.isValid || !this.sceneResultPanel?.isValid) return;
    this.sceneResultTitle.string = title;
    this.sceneResultDetail.string = detail;
    this.sceneRetryButton.node.active = !success;
    this.sceneNextButton.node.active = success;
    this.sceneResultOverlay.active = true;
    Tween.stopAllByTarget(this.sceneResultPanel);
    this.sceneResultPanel.setScale(0.92, 0.92, 1);
    tween(this.sceneResultPanel)
      .to(0.24, { scale: Vec3.ONE }, { easing: "backOut" })
      .start();

    const shownButton = success ? this.sceneNextButton : this.sceneRetryButton;
    const opacity = shownButton.node.getComponent(UIOpacity);
    if (!opacity?.isValid) return;
    // 入场后保持完全不透明，避免文字随呼吸闪烁持续变淡。
    Tween.stopAllByTarget(opacity);
    opacity.opacity = 0;
    tween(opacity)
      .to(0.22, { opacity: 255 }, { easing: "quadOut" })
      .start();
  }

  private retryRound = (): void => {
    if (this.roundState !== "failed") return;
    this.resetRound();
  };

  private goToMainGame = (): void => {
    if (this.roundState !== "complete" || this.adInFlight) return;
    this.roundState = "leaving";
    this.sceneNextButton.interactable = false;
    this.finishFeedExperience();
    AudioManager.playDefaultBgm();
    void GameSceneBundle.loadScene(GameSceneName.Game).catch((err) => {
      console.error("[penRefillFeedGameScene] 下一关加载失败", err);
      this.roundState = "complete";
      if (this.sceneNextButton?.node?.isValid) this.sceneNextButton.interactable = true;
    });
  };

  private returnToMain = (): void => {
    if (this.roundState === "leaving" || this.adInFlight) return;
    this.roundState = "leaving";
    this.finishFeedExperience();
    AudioManager.playDefaultBgm();
    AudioManager.playEffect(soundName.buttonClick);
    void GameSceneBundle.loadScene(GameSceneName.Main).catch((err) => {
      console.error("[penRefillFeedGameScene] 返回主页失败", err);
      this.roundState = "ready";
    });
  };

  private async reportFeedSceneReady(): Promise<void> {
    await FeedAcquisitionService.reportSceneReadyAfterStableRender({
      owner: this.node,
      requiredVisibleNodes: [
        this.sceneBackground,
        this.sceneReadyHand,
        ...this.targets.map((target) => target.root),
      ],
      isReady: () => this.roundState !== "leaving" && !this.feedExited,
      stableFrameCount: 3,
      surfaceDelayMs: 180,
    });
  }

  private readonly onFeedStateChanged = (state: FeedAcquisitionState): void => {
    this.feedMode = state.active;
    this.feedEntered = !state.active || (state.entered && !state.exited);
    this.feedExited = state.active && state.exited;
    if (this.feedExited) {
      adc.cancelFeedEntryInterstitial();
      this.feedInterstitialScheduled = false;
      this.feedAudioForeground = false;
      AudioManager.pauseBgmForVideo();
    } else if (!state.active) {
      AudioManager.playMusic(soundName.getUserBgm);
    } else if (state.entered) {
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
      }
    }
  };

  private readonly onGameShow = (): void => {
    if (!this.feedMode || this.feedExited) return;
    this.feedAudioForeground = true;
    AudioManager.restartMusic(soundName.getUserBgm);
  };

  private readonly onGameHide = (): void => {
    if (!this.feedMode) return;
    this.feedAudioForeground = false;
    AudioManager.pauseBgmForVideo();
  };

  private isInteractionEnabled(): boolean {
    return !this.feedMode || (this.feedEntered && !this.feedExited);
  }

  private finishFeedExperience(): void {
    if (!this.feedMode || this.feedExperienceFinished) return;
    this.feedExperienceFinished = true;
    adc.cancelFeedEntryInterstitial();
    FeedAcquisitionService.removeListener(this.onFeedStateChanged);
    FeedAcquisitionService.completeSession();
  }

  private isNodeInside(node: Node | null, ancestor: Node | null): boolean {
    if (!node || !ancestor) return false;
    let current: Node | null = node;
    while (current) {
      if (current === ancestor) return true;
      current = current.parent;
    }
    return false;
  }

  private isTouchInsideNode(event: EventTouch, node: Node | null): boolean {
    const transform = node?.getComponent(UITransform);
    if (!node?.activeInHierarchy || !transform) return false;
    return transform.hitTest(event.getUILocation());
  }

  private showDouyinToast(title: string): void {
    try {
      const api = typeof tt !== "undefined" ? tt : null;
      if (typeof api?.showToast === "function") {
        api.showToast({ title, icon: "none" });
      } else {
        console.log(`[penRefillFeedGameScene] ${title}`);
      }
    } catch {
      console.log(`[penRefillFeedGameScene] ${title}`);
    }
  }
}
