import {
  _decorator,
  Button,
  Component,
  EventTouch,
  game,
  Game,
  input,
  Input,
  instantiate,
  Label,
  Node,
  ResolutionPolicy,
  sp,
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
import {
  AD_RING_COUNT,
  CatchablePose,
  TARGET_GOOSE_COUNT,
  WhiteGooseRound,
  isCatchSuccessful,
} from "./whiteGooseRoundRules";

const { ccclass, property } = _decorator;
const DESIGN_WIDTH = 750;
const DESIGN_HEIGHT = 1624;
const GOOSE_WALK_SPEED = 150;
const GOOSE_LEFT_EDGE = -310;
const GOOSE_RIGHT_EDGE = 310;
const CATCH_ANIMATION_FALLBACK_SECONDS = 2.8;
const RING_SKINS = ["lan", "huang", "hong"] as const;
const GOOSE_CALLS = [
  soundName.whiteGooseCall1,
  soundName.whiteGooseCall2,
  soundName.whiteGooseCall3,
] as const;

type GooseState = {
  slot: Node;
  skeleton: sp.Skeleton;
  hitArea: Node;
  active: boolean;
  walking: boolean;
  pose: CatchablePose;
  direction: -1 | 1;
  walkRemaining: number;
  baseX: number;
  motionLocked: boolean;
};

type ScenePhase = "preview" | "playing" | "throwing" | "result" | "leaving";

@ccclass("whiteGooseFeedGameScene")
export class whiteGooseFeedGameScene extends Component {
  @property(Node)
  public sceneBackground: Node | null = null;

  @property(Button)
  public sceneBackButton: Button | null = null;

  @property(Button)
  public sceneAddRingsButton: Button | null = null;

  @property(Label)
  public sceneCaughtLabel: Label | null = null;

  @property(Label)
  public sceneRingLabel: Label | null = null;

  @property(Node)
  public sceneFieldTouchArea: Node | null = null;

  @property(Node)
  public sceneGooseSlots: Node | null = null;

  @property([sp.Skeleton])
  public sceneGooseSkeletons: sp.Skeleton[] = [];

  @property([Node])
  public sceneGooseHitAreas: Node[] = [];

  @property(Node)
  public sceneThrowingHand: Node | null = null;

  @property(sp.Skeleton)
  public sceneHandSkeleton: sp.Skeleton | null = null;

  @property(Node)
  public sceneThrownRingLayer: Node | null = null;

  @property([Node])
  public sceneRingTemplates: Node[] = [];

  @property(Node)
  public sceneForeground: Node | null = null;

  @property(Node)
  public sceneResultOverlay: Node | null = null;

  @property(Node)
  public sceneResultPanel: Node | null = null;

  @property(Label)
  public sceneResultSuccessTitle: Label | null = null;

  @property(Label)
  public sceneResultFailureTitle: Label | null = null;

  @property(Label)
  public sceneResultProgress: Label | null = null;

  @property(Label)
  public sceneResultDetail: Label | null = null;

  @property(Node)
  public sceneSuccessActions: Node | null = null;

  @property(Node)
  public sceneFailureActions: Node | null = null;

  @property(Button)
  public sceneReplayButton: Button | null = null;

  @property(Button)
  public sceneRestartButton: Button | null = null;

  @property(Button)
  public sceneHomeButton: Button | null = null;

  @property(Button)
  public sceneReviveButton: Button | null = null;

  private round = new WhiteGooseRound();
  private phase: ScenePhase = "preview";
  private roundSerial = 0;
  private adInFlight = false;
  private feedMode = false;
  private feedEntered = false;
  private feedExited = false;
  private feedAudioForeground = false;
  private feedInterstitialScheduled = false;
  private feedExperienceFinished = false;
  private appHidden = false;
  private gooseStates: GooseState[] = [];
  private gooseTouchHandlers: Array<(event: EventTouch) => void> = [];
  private handSkeleton: sp.Skeleton | null = null;

  protected onLoad(): void {
    view.setDesignResolutionSize(DESIGN_WIDTH, DESIGN_HEIGHT, ResolutionPolicy.FIXED_WIDTH);
    adc.cancelFeedEntryInterstitial();
    FeedAcquisitionService.init();
    const state = FeedAcquisitionService.getState();
    this.feedMode = FeedAcquisitionService.isActive();
    this.feedEntered = !this.feedMode || state.entered;
    this.feedExited = this.feedMode && state.exited;
    this.validateSceneBindings();
    this.createGooseStates();
    this.handSkeleton = this.sceneHandSkeleton;
    this.bindEvents();
    this.resetRound(!this.feedMode || this.feedEntered);
  }

  protected start(): void {
    AudioManager.setSoundEvent();
    if (this.feedMode) {
      FeedAcquisitionService.addListener(this.onFeedStateChanged);
      void this.reportFeedSceneReady();
      if (this.feedEntered && !this.feedExited) this.startFeedAudio(false);
    } else {
      this.phase = "playing";
      AudioManager.playMusic(soundName.whiteGooseBgm);
    }
  }

  protected update(deltaTime: number): void {
    if ((this.phase !== "playing" && this.phase !== "throwing") || this.adInFlight || this.feedExited) return;
    this.updateGooseMotion(Math.min(0.04, Math.max(0, deltaTime)));
  }

  protected onDestroy(): void {
    this.phase = "leaving";
    this.roundSerial += 1;
    this.unscheduleAllCallbacks();
    adc.cancelFeedEntryInterstitial();
    FeedAcquisitionService.removeListener(this.onFeedStateChanged);
    if (this.feedMode && !this.feedExperienceFinished) {
      this.feedExperienceFinished = true;
      FeedAcquisitionService.completeSession();
    }
    input.off(Input.EventType.TOUCH_START, this.onGlobalTouchStart, this);
    game.off(Game.EVENT_HIDE, this.onGameHide, this);
    game.off(Game.EVENT_SHOW, this.onGameShow, this);
    const fieldTouchArea = this.sceneFieldTouchArea;
    if (fieldTouchArea?.isValid) {
      fieldTouchArea.off(Node.EventType.TOUCH_START, this.onFieldTouch, this);
    }
    for (let index = 0; index < this.gooseStates.length; index += 1) {
      const state = this.gooseStates[index];
      const handler = this.gooseTouchHandlers[index];
      if (state?.hitArea?.isValid && handler) {
        state.hitArea.off(Node.EventType.TOUCH_START, handler, this);
      }
    }
    const backNode = this.sceneBackButton?.node;
    const addRingsNode = this.sceneAddRingsButton?.node;
    const replayNode = this.sceneReplayButton?.node;
    const restartNode = this.sceneRestartButton?.node;
    const homeNode = this.sceneHomeButton?.node;
    const reviveNode = this.sceneReviveButton?.node;
    if (backNode?.isValid) backNode.off(Button.EventType.CLICK, this.returnToMain, this);
    if (addRingsNode?.isValid) addRingsNode.off(Button.EventType.CLICK, this.onAddRingsPressed, this);
    if (replayNode?.isValid) replayNode.off(Button.EventType.CLICK, this.onReplayPressed, this);
    if (restartNode?.isValid) restartNode.off(Button.EventType.CLICK, this.onReplayPressed, this);
    if (homeNode?.isValid) homeNode.off(Button.EventType.CLICK, this.returnToMain, this);
    if (reviveNode?.isValid) reviveNode.off(Button.EventType.CLICK, this.onRevivePressed, this);
    this.stopSceneTweensAndSpineListeners();
  }

  private validateSceneBindings(): void {
    const required: Array<[string, unknown]> = [
      ["sceneBackground", this.sceneBackground],
      ["sceneBackButton", this.sceneBackButton],
      ["sceneAddRingsButton", this.sceneAddRingsButton],
      ["sceneCaughtLabel", this.sceneCaughtLabel],
      ["sceneRingLabel", this.sceneRingLabel],
      ["sceneFieldTouchArea", this.sceneFieldTouchArea],
      ["sceneGooseSlots", this.sceneGooseSlots],
      ["sceneThrowingHand", this.sceneThrowingHand],
      ["sceneHandSkeleton", this.sceneHandSkeleton],
      ["sceneThrownRingLayer", this.sceneThrownRingLayer],
      ["sceneForeground", this.sceneForeground],
      ["sceneResultOverlay", this.sceneResultOverlay],
      ["sceneResultPanel", this.sceneResultPanel],
      ["sceneResultSuccessTitle", this.sceneResultSuccessTitle],
      ["sceneResultFailureTitle", this.sceneResultFailureTitle],
      ["sceneResultProgress", this.sceneResultProgress],
      ["sceneResultDetail", this.sceneResultDetail],
      ["sceneSuccessActions", this.sceneSuccessActions],
      ["sceneFailureActions", this.sceneFailureActions],
      ["sceneReplayButton", this.sceneReplayButton],
      ["sceneRestartButton", this.sceneRestartButton],
      ["sceneHomeButton", this.sceneHomeButton],
      ["sceneReviveButton", this.sceneReviveButton],
    ];
    if (this.sceneGooseSkeletons.length !== 10) required.push(["sceneGooseSkeletons[10]", null]);
    if (this.sceneGooseHitAreas.length !== 10) required.push(["sceneGooseHitAreas[10]", null]);
    if (this.sceneRingTemplates.length !== 3) required.push(["sceneRingTemplates[3]", null]);
    const missing = required.filter(([, value]) => !value).map(([name]) => name);
    if (missing.length > 0) {
      throw new Error(`[whiteGooseFeedGameScene] 场景节点绑定不完整: ${missing.join(", ")}`);
    }
  }

  private createGooseStates(): void {
    const slots = this.sceneGooseSlots.children;
    this.gooseStates = this.sceneGooseSkeletons.map((skeleton, index) => ({
      slot: slots[index],
      skeleton,
      hitArea: this.sceneGooseHitAreas[index],
      active: false,
      walking: true,
      pose: "s1" as CatchablePose,
      direction: 1 as const,
      walkRemaining: 0,
      baseX: slots[index].position.x,
      motionLocked: false,
    }));
  }

  private bindEvents(): void {
    input.on(Input.EventType.TOUCH_START, this.onGlobalTouchStart, this);
    game.on(Game.EVENT_HIDE, this.onGameHide, this);
    game.on(Game.EVENT_SHOW, this.onGameShow, this);
    this.sceneFieldTouchArea.on(Node.EventType.TOUCH_START, this.onFieldTouch, this);
    this.gooseTouchHandlers = this.gooseStates.map((state, index) => {
      const handler = (event: EventTouch) => this.onGooseTouch(event, index);
      state.hitArea.on(Node.EventType.TOUCH_START, handler, this);
      return handler;
    });
    this.sceneBackButton.node.on(Button.EventType.CLICK, this.returnToMain, this);
    this.sceneAddRingsButton.node.on(Button.EventType.CLICK, this.onAddRingsPressed, this);
    this.sceneReplayButton.node.on(Button.EventType.CLICK, this.onReplayPressed, this);
    this.sceneRestartButton.node.on(Button.EventType.CLICK, this.onReplayPressed, this);
    this.sceneHomeButton.node.on(Button.EventType.CLICK, this.returnToMain, this);
    this.sceneReviveButton.node.on(Button.EventType.CLICK, this.onRevivePressed, this);
  }

  private resetRound(startPlaying = true): void {
    if (this.phase === "leaving") return;
    this.roundSerial += 1;
    this.adInFlight = false;
    this.unscheduleAllCallbacks();
    this.stopSceneTweensAndSpineListeners();
    const snapshot = this.round.reset();
    this.activateRoundSlots(snapshot.activeSlots);
    this.phase = startPlaying ? "playing" : "preview";
    if (this.sceneResultOverlay?.isValid) this.sceneResultOverlay.active = false;
    if (this.sceneResultSuccessTitle?.node?.isValid) this.sceneResultSuccessTitle.node.active = false;
    if (this.sceneResultFailureTitle?.node?.isValid) this.sceneResultFailureTitle.node.active = false;
    if (this.sceneSuccessActions?.isValid) this.sceneSuccessActions.active = false;
    if (this.sceneFailureActions?.isValid) this.sceneFailureActions.active = false;
    this.setHandIdle();
    this.refreshHud();
  }

  private activateRoundSlots(activeSlots: readonly number[]): void {
    const selected = new Set(activeSlots);
    for (let index = 0; index < this.gooseStates.length; index += 1) {
      const goose = this.gooseStates[index];
      const active = selected.has(index);
      goose.active = active;
      goose.walking = true;
      goose.pose = "s1";
      goose.motionLocked = false;
      goose.direction = Math.random() < 0.5 ? -1 : 1;
      goose.walkRemaining = 3 + Math.random() * 2;
      if (!goose.slot?.isValid) continue;
      goose.slot.active = active;
      goose.slot.setPosition(goose.baseX, goose.slot.position.y, goose.slot.position.z);
      goose.slot.setScale(goose.direction, 1, 1);
      if (!active || !goose.skeleton?.isValid) continue;
      goose.skeleton.setCompleteListener(null);
      try {
        goose.skeleton.setSkin("default");
        goose.skeleton.setAnimation(0, "zou", true);
      } catch (error) {
        console.warn("[whiteGooseFeedGameScene] 大鹅走动动画不可用", error);
      }
    }
  }

  private updateGooseMotion(deltaTime: number): void {
    for (const goose of this.gooseStates) {
      if (!goose.active || goose.motionLocked || !goose.slot?.isValid) continue;
      goose.walkRemaining -= deltaTime;
      if (goose.walking) {
        let x = goose.slot.position.x + goose.direction * GOOSE_WALK_SPEED * deltaTime;
        if (x <= GOOSE_LEFT_EDGE || x >= GOOSE_RIGHT_EDGE) {
          x = Math.min(GOOSE_RIGHT_EDGE, Math.max(GOOSE_LEFT_EDGE, x));
          goose.direction = goose.direction === 1 ? -1 : 1;
          goose.slot.setScale(goose.direction, 1, 1);
        }
        goose.slot.setPosition(x, goose.slot.position.y, goose.slot.position.z);
        if (goose.walkRemaining <= 0) this.enterRandomPose(goose);
      } else if (goose.walkRemaining <= 0) {
        if (Math.random() < 0.28) this.startWalking(goose);
        else this.enterRandomPose(goose);
      }
    }
  }

  private startWalking(goose: GooseState): void {
    goose.walking = true;
    goose.pose = "s1";
    goose.walkRemaining = 3 + Math.random() * 2;
    try {
      goose.skeleton.setCompleteListener(null);
      goose.skeleton.setAnimation(0, "zou", true);
    } catch (error) {
      console.warn("[whiteGooseFeedGameScene] 无法恢复大鹅走动动画", error);
    }
  }

  private enterRandomPose(goose: GooseState): void {
    const poses: CatchablePose[] = ["s1", "s2", "s3", "s4"];
    goose.walking = false;
    goose.pose = poses[Math.floor(Math.random() * poses.length)];
    goose.walkRemaining = 2.6 + Math.random() * 2.2;
    const animation = goose.pose;
    try {
      goose.skeleton.setCompleteListener(null);
      goose.skeleton.setAnimation(0, animation, true);
    } catch (error) {
      console.warn(`[whiteGooseFeedGameScene] 大鹅姿势动画不可用: ${animation}`, error);
      try { goose.skeleton.setAnimation(0, goose.pose, true); } catch { /* 静态保底。 */ }
    }
  }

  private onGooseTouch(event: EventTouch, gooseIndex: number): void {
    event.propagationStopped = true;
    const goose = this.gooseStates[gooseIndex];
    if (!goose?.active || this.phase !== "playing" || !this.isInteractionEnabled()) return;
    const world = goose.slot.getWorldPosition(new Vec3());
    const transform = this.sceneThrownRingLayer?.getComponent(UITransform);
    const landing = transform?.convertToNodeSpaceAR(world, new Vec3()) ?? world;
    this.beginThrow(goose, landing);
  }

  private onFieldTouch(event: EventTouch): void {
    if (this.phase !== "playing" || !this.isInteractionEnabled()) return;
    const ui = event.getUILocation();
    const transform = this.sceneThrownRingLayer?.getComponent(UITransform);
    const landing = transform?.convertToNodeSpaceAR(new Vec3(ui.x, ui.y, 0), new Vec3())
      ?? new Vec3(ui.x, ui.y, 0);
    this.beginThrow(null, landing);
  }

  private beginThrow(target: GooseState | null, landing: Vec3): void {
    if (this.phase !== "playing" || this.adInFlight || !this.round.beginThrow()) return;
    this.phase = "throwing";
    this.refreshHud();
    const serial = this.roundSerial;
    const ringColor = Math.floor(Math.random() * this.sceneRingTemplates.length);
    const hand = this.handSkeleton ?? this.sceneHandSkeleton;
    if (!hand?.isValid) {
      this.launchRing(target, landing, serial, ringColor);
      return;
    }
    try {
      hand.setSkin(RING_SKINS[ringColor]);
      hand.setAnimation(0, "reng", false);
      let launched = false;
      const launch = (): void => {
        if (launched) return;
        launched = true;
        if (hand.isValid) hand.setCompleteListener(null);
        this.launchRing(target, landing, serial, ringColor);
      };
      hand.setCompleteListener((entry) => {
        const name = entry?.animation?.name ?? "";
        if (!name || name === "reng") launch();
      });
      this.scheduleOnce(launch, 0.62);
    } catch (error) {
      console.warn("[whiteGooseFeedGameScene] 投圈手动画不可用", error);
      this.launchRing(target, landing, serial, ringColor);
    }
  }

  private launchRing(
    target: GooseState | null,
    landing: Vec3,
    serial: number,
    ringColor: number,
  ): void {
    if (!this.isCurrentRound(serial) || this.phase !== "throwing") return;
    const template = this.sceneRingTemplates[ringColor];
    if (!template?.isValid || !this.sceneThrownRingLayer?.isValid) {
      this.resolveThrow(target, null, ringColor, serial);
      return;
    }
    const ring = instantiate(template);
    ring.active = true;
    this.sceneThrownRingLayer.addChild(ring);
    const layerTransform = this.sceneThrownRingLayer.getComponent(UITransform);
    const handWorld = this.sceneThrowingHand?.getWorldPosition(new Vec3()) ?? new Vec3(-100, -680, 0);
    const start = layerTransform?.convertToNodeSpaceAR(handWorld, new Vec3()) ?? handWorld;
    ring.setPosition(start);
    ring.setScale(0.92, 0.92, 1);
    const destination = target
      ? new Vec3(landing.x + 10, landing.y + 104, 0)
      : landing.clone();
    const distance = Vec3.distance(start, destination);
    const duration = Math.min(0.65, Math.max(0.28, distance / 1050));
    const scale = target ? 0.8 : 0.56;
    tween(ring)
      .to(duration, {
        position: destination,
        scale: new Vec3(scale, scale, 1),
      }, { easing: "sineOut" })
      .call(() => this.resolveThrow(target, ring, ringColor, serial))
      .start();
  }

  private resolveThrow(
    target: GooseState | null,
    ring: Node | null,
    ringColor: number,
    serial: number,
  ): void {
    if (!this.isCurrentRound(serial) || this.phase !== "throwing") {
      if (ring?.isValid) ring.destroy();
      return;
    }
    const caught = !!target?.active && isCatchSuccessful(target.pose, target.walking, Math.random());
    if (caught && target) {
      if (ring?.isValid) ring.destroy();
      AudioManager.playEffect(GOOSE_CALLS[Math.floor(Math.random() * GOOSE_CALLS.length)]);
      this.playCaughtAnimation(target, ringColor, serial);
      return;
    }
    this.playDodgeAnimation(target, serial);
    if (!ring?.isValid) {
      this.finalizeResolvedThrow(false, serial);
      return;
    }
    const offset = new Vec3(-85 + Math.random() * 170, -30 + Math.random() * 80, 0);
    tween(ring)
      .by(0.26, { position: offset, scale: new Vec3(-0.12, -0.12, 0) }, { easing: "quadOut" })
      .call(() => {
        if (ring.isValid) ring.destroy();
        this.finalizeResolvedThrow(false, serial);
      })
      .start();
  }

  private playCaughtAnimation(goose: GooseState, ringColor: number, serial: number): void {
    goose.motionLocked = true;
    let completed = false;
    const finish = (): void => {
      if (completed) return;
      completed = true;
      if (!this.isCurrentRound(serial)) return;
      if (goose.skeleton?.isValid) goose.skeleton.setCompleteListener(null);
      goose.active = false;
      if (goose.slot?.isValid) goose.slot.active = false;
      this.finalizeResolvedThrow(true, serial);
    };
    try {
      goose.skeleton.setSkin(RING_SKINS[ringColor]);
      const animation = `${goose.pose}_tao`;
      goose.skeleton.setAnimation(0, animation, false);
      goose.skeleton.setCompleteListener((entry) => {
        if ((entry?.animation?.name ?? "") === animation) finish();
      });
      this.scheduleOnce(finish, CATCH_ANIMATION_FALLBACK_SECONDS);
    } catch (error) {
      console.warn("[whiteGooseFeedGameScene] 大鹅套中动画不可用", error);
      finish();
    }
  }

  private playDodgeAnimation(goose: GooseState | null, serial: number): void {
    if (!goose?.active || goose.walking || goose.pose === "s1") return;
    const dodge = `${goose.pose}_duo`;
    goose.motionLocked = true;
    try {
      goose.skeleton.setAnimation(0, dodge, false);
      goose.skeleton.setCompleteListener((entry) => {
        if (!this.isCurrentRound(serial) || (entry?.animation?.name ?? "") !== dodge) return;
        goose.skeleton.setCompleteListener(null);
        goose.motionLocked = false;
        if (goose.active) goose.skeleton.setAnimation(0, goose.pose, true);
      });
    } catch {
      goose.motionLocked = false;
      // 缺失闪避动画时保持当前姿势，不影响回合继续。
    }
  }

  private finalizeResolvedThrow(caught: boolean, serial: number): void {
    if (!this.isCurrentRound(serial) || this.phase !== "throwing") return;
    const snapshot = this.round.resolveThrow(caught);
    this.refreshHud();
    if (snapshot.status === "won") this.finishRound(true);
    else if (snapshot.status === "lost") this.finishRound(false);
    else {
      this.phase = "playing";
      this.setHandIdle();
    }
  }

  private setHandIdle(): void {
    const hand = this.handSkeleton ?? this.sceneHandSkeleton;
    if (!hand?.isValid) return;
    try {
      const color = Math.floor(Math.random() * RING_SKINS.length);
      hand.setCompleteListener(null);
      hand.setSkin(RING_SKINS[color]);
      hand.setAnimation(0, "idle", true);
    } catch (error) {
      console.warn("[whiteGooseFeedGameScene] 投圈手待机动画不可用", error);
    }
  }

  private refreshHud(): void {
    const snapshot = this.round.snapshot;
    if (this.sceneCaughtLabel?.isValid) {
      this.sceneCaughtLabel.string = `已套中 ${snapshot.caughtCount}/${TARGET_GOOSE_COUNT}`;
    }
    if (this.sceneRingLabel?.isValid) {
      this.sceneRingLabel.string = `套圈 ${snapshot.ringsRemaining}/${snapshot.ringLimit}`;
    }
    const enabled = !this.adInFlight && this.phase !== "leaving";
    if (this.sceneBackButton?.node?.isValid) this.sceneBackButton.interactable = enabled;
    if (this.sceneAddRingsButton?.node?.isValid) {
      this.sceneAddRingsButton.interactable = enabled && this.phase === "playing";
    }
    if (this.sceneReplayButton?.node?.isValid) this.sceneReplayButton.interactable = enabled;
    if (this.sceneRestartButton?.node?.isValid) this.sceneRestartButton.interactable = enabled;
    if (this.sceneHomeButton?.node?.isValid) this.sceneHomeButton.interactable = enabled;
    if (this.sceneReviveButton?.node?.isValid) {
      this.sceneReviveButton.interactable = enabled && snapshot.status === "lost";
    }
  }

  private finishRound(success: boolean): void {
    if (this.phase === "result" || this.phase === "leaving") return;
    this.phase = "result";
    const snapshot = this.round.snapshot;
    if (this.sceneResultSuccessTitle?.node?.isValid) this.sceneResultSuccessTitle.node.active = success;
    if (this.sceneResultFailureTitle?.node?.isValid) this.sceneResultFailureTitle.node.active = !success;
    if (this.sceneSuccessActions?.isValid) this.sceneSuccessActions.active = success;
    if (this.sceneFailureActions?.isValid) this.sceneFailureActions.active = !success;
    if (this.sceneResultProgress?.isValid) {
      this.sceneResultProgress.string = `已套中 ${snapshot.caughtCount}/${TARGET_GOOSE_COUNT}`;
    }
    if (this.sceneResultDetail?.isValid) {
      this.sceneResultDetail.string = success
        ? "7只大鹅全部套中！"
        : `还差 ${TARGET_GOOSE_COUNT - snapshot.caughtCount} 只，增加套圈可保留进度继续挑战`;
    }
    if (this.sceneResultOverlay?.isValid) this.sceneResultOverlay.active = true;
    if (this.sceneResultPanel?.isValid) {
      Tween.stopAllByTarget(this.sceneResultPanel);
      this.sceneResultPanel.setScale(0.88, 0.88, 1);
      tween(this.sceneResultPanel).to(0.25, { scale: Vec3.ONE }, { easing: "backOut" }).start();
    }
    this.refreshHud();
  }

  private onAddRingsPressed = (): void => {
    if (this.phase !== "playing") return;
    void this.watchAdForRings(false);
  };

  private onRevivePressed = (): void => {
    if (this.phase !== "result" || this.round.snapshot.status !== "lost") return;
    void this.watchAdForRings(true);
  };

  private async watchAdForRings(revive: boolean): Promise<void> {
    if (this.adInFlight || SdkUtils.isFullscreenAdBusy()) return;
    const serial = this.roundSerial;
    this.adInFlight = true;
    this.refreshHud();
    let rewarded = false;
    try {
      rewarded = await SdkUtils.showRewardedVideo();
    } catch (error) {
      console.warn("[whiteGooseFeedGameScene] 激励视频失败", error);
    }
    if (!this.node?.isValid || this.phase === "leaving" || serial !== this.roundSerial) return;
    this.adInFlight = false;
    if (!rewarded) {
      this.refreshHud();
      this.showToast("完整看完广告才能增加套圈");
      return;
    }
    if (!this.round.grantRings(AD_RING_COUNT)) {
      this.refreshHud();
      return;
    }
    if (revive) {
      this.phase = "playing";
      if (this.sceneResultOverlay?.isValid) this.sceneResultOverlay.active = false;
      if (this.sceneResultSuccessTitle?.node?.isValid) this.sceneResultSuccessTitle.node.active = false;
      if (this.sceneResultFailureTitle?.node?.isValid) this.sceneResultFailureTitle.node.active = false;
      if (this.sceneSuccessActions?.isValid) this.sceneSuccessActions.active = false;
      if (this.sceneFailureActions?.isValid) this.sceneFailureActions.active = false;
      this.setHandIdle();
    }
    this.refreshHud();
    this.showToast("已增加5个套圈");
  }

  private onReplayPressed = (): void => {
    if (this.adInFlight || this.phase === "leaving") return;
    this.resetRound(true);
  };

  private returnToMain = (): void => {
    if (this.adInFlight || this.phase === "leaving") return;
    const previous = this.phase;
    this.phase = "leaving";
    this.finishFeedExperience();
    AudioManager.playDefaultBgm();
    void GameSceneBundle.loadScene(GameSceneName.Main).catch((error) => {
      console.error("[whiteGooseFeedGameScene] 返回主页失败", error);
      if (!this.node?.isValid) return;
      this.phase = previous;
      this.refreshHud();
    });
  };

  private stopSceneTweensAndSpineListeners(): void {
    const nodes = [
      this.sceneThrowingHand,
      this.sceneThrownRingLayer,
      this.sceneResultPanel,
      ...this.gooseStates.map(state => state.slot),
    ];
    for (const node of nodes) {
      if (!node?.isValid) continue;
      Tween.stopAllByTarget(node);
      const opacity = node.getComponent(UIOpacity);
      if (opacity?.isValid) Tween.stopAllByTarget(opacity);
    }
    if (this.handSkeleton?.isValid) this.handSkeleton.setCompleteListener(null);
    if (this.sceneHandSkeleton?.isValid && this.sceneHandSkeleton !== this.handSkeleton) {
      this.sceneHandSkeleton.setCompleteListener(null);
    }
    for (const goose of this.gooseStates) {
      if (goose.skeleton?.isValid) goose.skeleton.setCompleteListener(null);
    }
    if (this.sceneThrownRingLayer?.isValid) {
      for (const ring of [...this.sceneThrownRingLayer.children]) {
        if (!ring?.isValid) continue;
        Tween.stopAllByTarget(ring);
        ring.destroy();
      }
    }
  }

  private async reportFeedSceneReady(): Promise<void> {
    await FeedAcquisitionService.reportSceneReadyAfterStableRender({
      owner: this.node,
      requiredVisibleNodes: [
        this.sceneBackground,
        this.sceneGooseSlots,
        this.sceneThrowingHand,
        this.sceneForeground,
      ],
      isReady: () => this.phase !== "leaving" && !this.feedExited,
      stableFrameCount: 3,
      surfaceDelayMs: 180,
    });
  }

  private readonly onFeedStateChanged = (state: FeedAcquisitionState): void => {
    const firstRealEntry = state.active && state.entered && !state.exited && !this.feedEntered;
    this.feedMode = state.active;
    this.feedEntered = !state.active || (state.entered && !state.exited);
    this.feedExited = state.active && state.exited;
    if (firstRealEntry) this.resetRound(true);
    if (this.feedExited) {
      adc.cancelFeedEntryInterstitial();
      this.feedInterstitialScheduled = false;
      return;
    }
    if (state.active && state.entered) {
      this.startFeedAudio(!this.feedAudioForeground);
      if (!this.feedInterstitialScheduled) {
        this.feedInterstitialScheduled = true;
        adc.scheduleFeedEntryInterstitial(() => {
          const current = FeedAcquisitionService.getState();
          return !!this.node?.isValid && this.phase !== "leaving" &&
            !this.feedExperienceFinished && current.active && current.entered && !current.exited;
        });
      }
    }
    this.refreshHud();
  };

  private readonly onGlobalTouchStart = (): void => {
    if (this.feedMode && !this.feedEntered && !this.feedExited && this.phase !== "leaving") {
      FeedAcquisitionService.activateFromFirstTouch();
    }
  };

  private readonly onGameShow = (): void => {
    this.appHidden = false;
    if (!this.feedMode || this.adInFlight || SdkUtils.isRewardedVideoBusy()) return;
    this.startFeedAudio(true);
  };

  private readonly onGameHide = (): void => {
    this.appHidden = true;
    if (!this.feedMode) return;
    this.feedAudioForeground = false;
    AudioManager.pauseBgmForVideo();
  };

  private startFeedAudio(restart: boolean): void {
    if (this.appHidden || this.adInFlight || SdkUtils.isRewardedVideoBusy()) return;
    this.feedAudioForeground = true;
    if (restart) AudioManager.restartMusic(soundName.whiteGooseBgm);
    else AudioManager.playMusic(soundName.whiteGooseBgm);
  }

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

  private isCurrentRound(serial: number): boolean {
    return serial === this.roundSerial && this.phase !== "leaving" && !!this.node?.isValid;
  }

  private showToast(title: string): void {
    try {
      const api = typeof tt !== "undefined" ? tt : null;
      if (typeof api?.showToast === "function") api.showToast({ title, icon: "none" });
      else console.log(`[whiteGooseFeedGameScene] ${title}`);
    } catch {
      console.log(`[whiteGooseFeedGameScene] ${title}`);
    }
  }
}
