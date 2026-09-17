import {
  _decorator,
  Button,
  Component,
  director,
  EventTouch,
  game,
  Game,
  input,
  Input,
  Label,
  Node,
  ResolutionPolicy,
  Sprite,
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
const INITIAL_HAMMER_COUNT = 20;
const AD_HAMMER_COUNT = 5;
const REVIVE_HAMMER_COUNT = 10;
const REQUIRED_NAILS = 5;
const HITS_PER_NAIL = 3;
const TARGET_MIN_SCALE = 0.51;
const TARGET_MAX_SCALE = 0.95;
const TARGET_SUCCESS_MIN = 0.55;
const TARGET_SUCCESS_MAX = 0.75;
const TARGET_PULSE_SPEED = 4.8;
const NAIL_START_Y = 16;

type RoundState = "playing" | "complete" | "leaving";
type StrikeResult = "hit" | "bent" | "blank";

/**
 * 推荐流“砸钉子”小游戏。
 *
 * 美术、HUD、按钮和结算面板都放在 NailHammerFeedGameScene 场景里，方便直接
 * 在 Creator 中调整；脚本负责准星节奏、落锤判定、限次挑战和推荐流生命周期。
 */
@ccclass("nailHammerFeedGameScene")
export class nailHammerFeedGameScene extends Component {
  @property(Node)
  public sceneBackground: Node | null = null;

  @property(Button)
  public sceneBackButton: Button | null = null;

  @property(Button)
  public sceneAddHammersButton: Button | null = null;

  @property(Label)
  public sceneCompletedNailsLabel: Label | null = null;

  @property(Label)
  public sceneHammerCountLabel: Label | null = null;

  @property(Node)
  public sceneBoss: Node | null = null;

  @property(Node)
  public sceneWoodBack: Node | null = null;

  @property(Node)
  public sceneWoodFront: Node | null = null;

  @property(Node)
  public sceneNailRoot: Node | null = null;

  @property(Node)
  public sceneStraightNail: Node | null = null;

  @property(Node)
  public sceneBentNail: Node | null = null;

  @property(Node)
  public sceneNailFrontRoot: Node | null = null;

  @property(Sprite)
  public sceneStraightNailFront: Sprite | null = null;

  @property(Sprite)
  public sceneBentNailFront: Sprite | null = null;

  @property(Node)
  public sceneHammerRoot: Node | null = null;

  @property(Node)
  public sceneHammerReady: Node | null = null;

  @property(Node)
  public sceneHammerStrike: Node | null = null;

  @property(Node)
  public sceneSightScaleNode: Node | null = null;

  @property(Node)
  public sceneTargetNormal: Node | null = null;

  @property(Node)
  public sceneTargetSuccess: Node | null = null;

  @property(Node)
  public sceneSpeechBubble: Node | null = null;

  @property(Label)
  public sceneSpeechLabel: Label | null = null;

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
  public sceneNextButton: Button | null = null;

  @property(Button)
  public sceneRestartButton: Button | null = null;

  @property(Button)
  public sceneResultHomeButton: Button | null = null;

  @property(Button)
  public sceneReviveButton: Button | null = null;

  private roundState: RoundState = "playing";
  private resultSucceeded = false;
  private hammerCount = 0;
  private hammerLimit = INITIAL_HAMMER_COUNT;
  private adInFlight = false;
  private appHidden = false;
  private roundSerial = 0;
  private nailHitCount = 0;
  private nailNeedsReplacement = false;
  private completedNails = 0;
  private targetPhase = 0;
  private targetScale = TARGET_MAX_SCALE;
  private inputLocked = false;
  private feedbackSerial = 0;
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
    const feedState = FeedAcquisitionService.getState();
    this.feedMode = FeedAcquisitionService.isActive();
    this.feedEntered = !this.feedMode || feedState.entered;
    this.feedExited = this.feedMode && feedState.exited;

    this.validateSceneBindings();
    this.bindEvents();
    this.resetRound();
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
    this.syncNailFrontLayer();
    if (this.roundState !== "playing" || this.adInFlight || this.feedExited || this.sceneResultOverlay?.active) return;

    const dt = Math.min(0.04, Math.max(0, deltaTime));
    this.updateTargetPulse(dt);
  }

  protected onDestroy(): void {
    this.roundState = "leaving";
    this.roundSerial++;
    this.inputLocked = true;
    this.unscheduleAllCallbacks();
    adc.cancelFeedEntryInterstitial();
    FeedAcquisitionService.removeListener(this.onFeedStateChanged);
    if (this.feedMode && !this.feedExperienceFinished) {
      this.feedExperienceFinished = true;
      FeedAcquisitionService.completeSession();
    }
    game.off(Game.EVENT_HIDE, this.onGameHide, this);
    game.off(Game.EVENT_SHOW, this.onGameShow, this);
    input.off(Input.EventType.TOUCH_START, this.onGlobalTouchStart, this);
    const backNode = this.sceneBackButton?.node;
    const replayNode = this.sceneReplayButton?.node;
    const nextNode = this.sceneNextButton?.node;
    const restartNode = this.sceneRestartButton?.node;
    const homeNode = this.sceneResultHomeButton?.node;
    const addHammersNode = this.sceneAddHammersButton?.node;
    const reviveNode = this.sceneReviveButton?.node;
    if (backNode?.isValid) backNode.off(Button.EventType.CLICK, this.returnToMain, this);
    if (replayNode?.isValid) replayNode.off(Button.EventType.CLICK, this.resetRound, this);
    if (nextNode?.isValid) nextNode.off(Button.EventType.CLICK, this.goToMainGame, this);
    if (restartNode?.isValid) restartNode.off(Button.EventType.CLICK, this.resetRound, this);
    if (homeNode?.isValid) homeNode.off(Button.EventType.CLICK, this.returnToMain, this);
    if (addHammersNode?.isValid) addHammersNode.off(Button.EventType.CLICK, this.onAddHammersPressed, this);
    if (reviveNode?.isValid) reviveNode.off(Button.EventType.CLICK, this.onRevivePressed, this);
    this.stopSceneTweens();
  }

  private stopSceneTweens(): void {
    for (const node of [
      this.sceneHammerRoot,
      this.sceneNailRoot,
      this.sceneNailFrontRoot,
      this.sceneWoodBack,
      this.sceneWoodFront,
      this.sceneSpeechBubble,
      this.sceneResultPanel,
    ]) {
      // Child nodes can be destroyed before this component; optional chaining
      // alone does not protect getComponent() from a cleared component list.
      if (!node?.isValid) continue;
      Tween.stopAllByTarget(node);
      const opacity = node.getComponent(UIOpacity);
      if (opacity?.isValid) Tween.stopAllByTarget(opacity);
    }
  }

  private validateSceneBindings(): void {
    const required: Array<[string, unknown]> = [
      ["sceneBackground", this.sceneBackground],
      ["sceneBackButton", this.sceneBackButton],
      ["sceneAddHammersButton", this.sceneAddHammersButton],
      ["sceneCompletedNailsLabel", this.sceneCompletedNailsLabel],
      ["sceneHammerCountLabel", this.sceneHammerCountLabel],
      ["sceneBoss", this.sceneBoss],
      ["sceneWoodBack", this.sceneWoodBack],
      ["sceneWoodFront", this.sceneWoodFront],
      ["sceneNailRoot", this.sceneNailRoot],
      ["sceneStraightNail", this.sceneStraightNail],
      ["sceneBentNail", this.sceneBentNail],
      ["sceneNailFrontRoot", this.sceneNailFrontRoot],
      ["sceneStraightNailFront", this.sceneStraightNailFront],
      ["sceneBentNailFront", this.sceneBentNailFront],
      ["sceneHammerRoot", this.sceneHammerRoot],
      ["sceneHammerReady", this.sceneHammerReady],
      ["sceneHammerStrike", this.sceneHammerStrike],
      ["sceneSightScaleNode", this.sceneSightScaleNode],
      ["sceneTargetNormal", this.sceneTargetNormal],
      ["sceneTargetSuccess", this.sceneTargetSuccess],
      ["sceneSpeechBubble", this.sceneSpeechBubble],
      ["sceneSpeechLabel", this.sceneSpeechLabel],
      ["sceneResultOverlay", this.sceneResultOverlay],
      ["sceneResultPanel", this.sceneResultPanel],
      ["sceneResultSuccessTitle", this.sceneResultSuccessTitle],
      ["sceneResultFailureTitle", this.sceneResultFailureTitle],
      ["sceneResultProgress", this.sceneResultProgress],
      ["sceneResultDetail", this.sceneResultDetail],
      ["sceneSuccessActions", this.sceneSuccessActions],
      ["sceneFailureActions", this.sceneFailureActions],
      ["sceneReplayButton", this.sceneReplayButton],
      ["sceneNextButton", this.sceneNextButton],
      ["sceneRestartButton", this.sceneRestartButton],
      ["sceneResultHomeButton", this.sceneResultHomeButton],
      ["sceneReviveButton", this.sceneReviveButton],
    ];
    const missing = required.filter(([, value]) => !value).map(([name]) => name);
    if (missing.length > 0) {
      throw new Error(`[nailHammerFeedGameScene] 场景节点绑定不完整: ${missing.join(", ")}`);
    }
  }

  private bindEvents(): void {
    // Match the source game: judge on press before the sight moves during a tap.
    input.on(Input.EventType.TOUCH_START, this.onGlobalTouchStart, this);
    this.sceneBackButton?.node?.on(Button.EventType.CLICK, this.returnToMain, this);
    this.sceneReplayButton?.node?.on(Button.EventType.CLICK, this.resetRound, this);
    this.sceneNextButton?.node?.on(Button.EventType.CLICK, this.goToMainGame, this);
    this.sceneRestartButton?.node?.on(Button.EventType.CLICK, this.resetRound, this);
    this.sceneResultHomeButton?.node?.on(Button.EventType.CLICK, this.returnToMain, this);
    this.sceneAddHammersButton?.node?.on(Button.EventType.CLICK, this.onAddHammersPressed, this);
    this.sceneReviveButton?.node?.on(Button.EventType.CLICK, this.onRevivePressed, this);
    game.on(Game.EVENT_HIDE, this.onGameHide, this);
    game.on(Game.EVENT_SHOW, this.onGameShow, this);
  }

  private resetRound = (): void => {
    if (this.adInFlight || this.roundState === "leaving") return;
    this.roundSerial++;
    this.unscheduleAllCallbacks();
    this.stopSceneTweens();
    this.roundState = "playing";
    this.resultSucceeded = false;
    this.hammerCount = 0;
    this.hammerLimit = INITIAL_HAMMER_COUNT;
    this.nailHitCount = 0;
    this.nailNeedsReplacement = false;
    this.completedNails = 0;
    this.targetPhase = 0;
    this.targetScale = TARGET_MAX_SCALE;
    this.inputLocked = false;
    this.feedbackSerial++;

    this.sceneResultOverlay.active = false;
    this.sceneResultSuccessTitle.node.active = false;
    this.sceneResultFailureTitle.node.active = false;
    this.sceneSuccessActions.active = false;
    this.sceneFailureActions.active = false;
    this.sceneStraightNail.active = true;
    this.sceneBentNail.active = false;
    this.sceneBentNail.setPosition(0, 0, 0);
    this.sceneBentNail.setScale(1, 1, 1);
    this.sceneWoodBack.setPosition(0, -10, 0);
    this.sceneWoodFront.setPosition(0, -144, 0);
    this.sceneHammerRoot.setScale(1, 1, 1);
    this.sceneHammerReady.active = true;
    this.sceneHammerStrike.active = false;
    this.sceneTargetNormal.active = true;
    this.sceneTargetSuccess.active = false;
    this.sceneSpeechBubble.active = false;
    this.sceneNailRoot.setPosition(0, NAIL_START_Y, 0);
    this.syncNailFrontLayer();
    this.sceneSightScaleNode.setScale(TARGET_MAX_SCALE, TARGET_MAX_SCALE, 1);
    this.refreshHud();
  };

  private updateTargetPulse(dt: number): void {
    const speed = TARGET_PULSE_SPEED + Math.min(2.4, this.completedNails * 0.28);
    this.targetPhase += dt * speed;
    const wave = (Math.cos(this.targetPhase) + 1) * 0.5;
    this.targetScale = TARGET_MIN_SCALE + (TARGET_MAX_SCALE - TARGET_MIN_SCALE) * wave;
    this.sceneSightScaleNode.setScale(this.targetScale, this.targetScale, 1);
    this.refreshTargetColor();
  }

  private refreshTargetColor(): void {
    const isInHitWindow =
      this.targetScale >= TARGET_SUCCESS_MIN && this.targetScale <= TARGET_SUCCESS_MAX;
    this.sceneTargetNormal.active = !isInHitWindow;
    this.sceneTargetSuccess.active = isInHitWindow;
  }

  private syncNailFrontLayer(): void {
    if (
      !this.sceneNailRoot?.isValid ||
      !this.sceneNailFrontRoot?.isValid ||
      !this.sceneWoodFront?.isValid
    ) return;

    this.sceneNailFrontRoot.setPosition(this.sceneNailRoot.position);
    this.syncNailFrontSprite(this.sceneStraightNail, this.sceneStraightNailFront);
    this.syncNailFrontSprite(this.sceneBentNail, this.sceneBentNailFront);
  }

  private syncNailFrontSprite(source: Node, front: Sprite): void {
    const sourceTransform = source.getComponent(UITransform);
    const woodTransform = this.sceneWoodFront.getComponent(UITransform);
    if (!sourceTransform || !woodTransform) return;

    front.node.active = source.active;
    front.node.setPosition(source.position);
    front.node.setScale(source.scale);

    const surfaceY = this.sceneWoodFront.position.y + woodTransform.contentSize.height * 0.5;
    const spriteHeight = sourceTransform.contentSize.height * Math.abs(source.scale.y);
    const spriteTopY =
      this.sceneNailRoot.position.y + source.position.y + spriteHeight * 0.5;
    const visibleRatio = Math.min(1, Math.max(0, (spriteTopY - surfaceY) / spriteHeight));
    front.fillStart = 1 - visibleRatio;
    front.fillRange = visibleRatio;
  }

  private onGlobalTouchStart = (event: EventTouch): void => {
    // Same compatibility path as shooting/juggling: some hosts omit feedEnter.
    // Only a real canvas press activates the session; preview animation never does.
    if (this.feedMode && !this.feedEntered && !this.feedExited && this.roundState !== "leaving") {
      FeedAcquisitionService.activateFromFirstTouch();
    }
    if (
      this.roundState !== "playing" ||
      this.adInFlight ||
      this.inputLocked ||
      this.hammerCount >= this.hammerLimit ||
      !this.isInteractionEnabled() ||
      this.sceneResultOverlay.active
    ) return;
    if (
      this.isTouchInsideNode(event, this.sceneBackButton.node) ||
      this.isTouchInsideNode(event, this.sceneAddHammersButton.node) ||
      this.isTouchInsideNode(event, this.sceneReplayButton.node) ||
      this.isTouchInsideNode(event, this.sceneNextButton.node)
    ) return;

    let result: StrikeResult;
    if (this.targetScale < TARGET_SUCCESS_MIN) result = "bent";
    else if (this.targetScale > TARGET_SUCCESS_MAX) result = "blank";
    else result = "hit";
    this.performStrike(result);
  };

  private performStrike(result: StrikeResult): void {
    if (this.roundState !== "playing" || this.adInFlight || this.inputLocked || this.hammerCount >= this.hammerLimit) return;
    this.inputLocked = true;
    this.hammerCount++;
    this.showHammerStrike();

    if (result === "hit") this.handleNailHit();
    else if (result === "bent") this.handleBentNail();
    else this.handleBlankStrike();

    this.refreshHud();
  }

  private handleNailHit(): void {
    AudioManager.playEffect(soundName.nailHit);
    director.emit("vibrate_medium");
    this.nailHitCount++;
    const finishedNail = this.nailHitCount >= HITS_PER_NAIL;
    this.nailNeedsReplacement = finishedNail;
    this.showSpeech(finishedNail ? "你\n还\n挺\n准\n的" : "命\n中\n了");

    const nextY = NAIL_START_Y - (this.nailHitCount <= 2 ? this.nailHitCount * 31 : 72);
    Tween.stopAllByTarget(this.sceneNailRoot);
    tween(this.sceneNailRoot)
      .to(0.12, { position: new Vec3(0, nextY, 0) }, { easing: "quadIn" })
      .call(() => {
        if (this.roundState !== "playing") return;
        if (finishedNail) {
          this.completedNails++;
          this.nailHitCount = 0;
        }
        this.syncNailFrontLayer();
        this.refreshHud();
        // Count the landed nail before checking the last available hammer.
        if (this.checkRoundEnd()) return;
        if (finishedNail) this.retireNail(false);
        else {
          this.inputLocked = false;
          this.refreshButtons();
        }
      })
      .start();
  }

  private handleBentNail(): void {
    AudioManager.playEffect(soundName.nailMiss);
    director.emit("vibrate_heavy");
    this.sceneStraightNail.active = false;
    this.sceneBentNail.active = true;
    this.sceneBentNail.setPosition(this.targetPhase % (Math.PI * 2) > Math.PI ? 17 : -17, 0, 0);
    this.sceneBentNail.setScale(this.sceneBentNail.position.x > 0 ? -1 : 1, 1, 1);
    this.nailHitCount = 0;
    this.nailNeedsReplacement = true;
    this.showSpeech("哎\n呀\n砸\n歪\n了");
    this.scheduleOnce(() => {
      if (this.roundState !== "playing" || this.checkRoundEnd()) return;
      this.retireNail(true);
    }, 0.18);
  }

  private handleBlankStrike(): void {
    AudioManager.playEffect(soundName.nailMiss);
    director.emit("vibrate_light");
    this.showSpeech("差\n一\n点\n再\n来");
    this.shakeWood();
    this.scheduleOnce(() => {
      if (this.roundState !== "playing" || this.checkRoundEnd()) return;
      this.inputLocked = false;
      this.refreshButtons();
    }, 0.2);
  }

  private showHammerStrike(): void {
    this.sceneHammerReady.active = false;
    this.sceneHammerStrike.active = true;
    Tween.stopAllByTarget(this.sceneHammerRoot);
    this.sceneHammerRoot.setScale(1.08, 1.08, 1);
    tween(this.sceneHammerRoot)
      .to(0.08, { scale: Vec3.ONE }, { easing: "quadOut" })
      .delay(0.08)
      .call(() => {
        if (!this.sceneHammerRoot?.isValid) return;
        this.sceneHammerStrike.active = false;
        this.sceneHammerReady.active = true;
      })
      .start();
  }

  private retireNail(wasBent: boolean): void {
    if (!this.sceneNailRoot?.isValid || this.roundState !== "playing") return;
    this.inputLocked = true;
    Tween.stopAllByTarget(this.sceneNailRoot);
    tween(this.sceneNailRoot)
      .to(0.22, { position: new Vec3(-470, this.sceneNailRoot.position.y, 0) }, { easing: "quadIn" })
      .call(() => {
        this.sceneNailRoot.setPosition(470, NAIL_START_Y, 0);
        this.sceneStraightNail.active = true;
        this.sceneBentNail.active = false;
        this.sceneBentNail.setPosition(0, 0, 0);
        this.sceneBentNail.setScale(1, 1, 1);
        this.nailNeedsReplacement = false;
      })
      .to(0.24, { position: new Vec3(0, NAIL_START_Y, 0) }, { easing: "quadOut" })
      .call(() => {
        if (this.roundState === "playing" && this.hammerCount < this.hammerLimit) {
          this.inputLocked = false;
          this.refreshButtons();
          if (wasBent) this.showSpeech("下\n一\n枚");
        }
      })
      .start();
  }

  private shakeWood(): void {
    for (const wood of [this.sceneWoodBack, this.sceneWoodFront]) {
      Tween.stopAllByTarget(wood);
      wood.setPosition(0, wood === this.sceneWoodBack ? -10 : -144, 0);
      tween(wood)
        .by(0.035, { position: new Vec3(-8, 0, 0) })
        .by(0.07, { position: new Vec3(16, 0, 0) })
        .by(0.035, { position: new Vec3(-8, 0, 0) })
        .start();
    }
  }

  private showSpeech(text: string): void {
    const serial = ++this.feedbackSerial;
    const onRight = serial % 2 === 1;
    const art = this.sceneSpeechBubble.getChildByName("BubbleArt");
    this.sceneSpeechLabel.string = text;
    this.sceneSpeechBubble.active = true;
    this.sceneSpeechBubble.setPosition(onRight ? 278 : -278, 112, 0);
    art?.setScale(onRight ? 0.78 : -0.78, 0.78, 1);
    Tween.stopAllByTarget(this.sceneSpeechBubble);
    this.sceneSpeechBubble.setScale(0.75, 0.75, 1);
    tween(this.sceneSpeechBubble)
      .to(0.14, { scale: Vec3.ONE }, { easing: "backOut" })
      .delay(0.8)
      .call(() => {
        if (serial === this.feedbackSerial && this.sceneSpeechBubble?.isValid) {
          this.sceneSpeechBubble.active = false;
        }
      })
      .start();
  }

  private refreshHud(): void {
    this.sceneCompletedNailsLabel.string = `${this.completedNails}/${REQUIRED_NAILS}`;
    this.sceneHammerCountLabel.string = `剩余${Math.max(0, this.hammerLimit - this.hammerCount)}锤`;
    this.refreshButtons();
  }

  private refreshButtons(): void {
    const enabled = !this.adInFlight && this.roundState !== "leaving";
    for (const button of [
      this.sceneBackButton,
      this.sceneReplayButton,
      this.sceneRestartButton,
      this.sceneResultHomeButton,
    ]) {
      if (button?.isValid) button.interactable = enabled;
    }
    this.sceneNextButton.interactable = enabled && this.resultSucceeded;
    this.sceneAddHammersButton.interactable =
      enabled && this.roundState === "playing" && !this.inputLocked && this.isInteractionEnabled();
    this.sceneReviveButton.interactable = enabled && this.roundState === "complete" && !this.resultSucceeded;
  }

  private onAddHammersPressed = (): void => {
    if (this.roundState !== "playing" || this.inputLocked || !this.isInteractionEnabled()) return;
    void this.watchAdForHammers(false);
  };

  private onRevivePressed = (): void => {
    if (this.roundState !== "complete" || this.resultSucceeded || !this.isInteractionEnabled()) return;
    void this.watchAdForHammers(true);
  };

  private async watchAdForHammers(revive: boolean): Promise<void> {
    if (this.adInFlight || SdkUtils.isFullscreenAdBusy()) return;
    const serial = this.roundSerial;
    this.adInFlight = true;
    this.refreshButtons();
    let rewarded = false;
    try {
      // Start immediately in the real button-click stack, as required by the feed container.
      rewarded = await SdkUtils.showRewardedVideo();
    } catch (error) {
      console.warn("[nailHammerFeedGameScene] 激励视频失败", error);
    }
    // Ignore callbacks from a scene/round that no longer exists.
    if (!this.node?.isValid || this.roundState === "leaving" || serial !== this.roundSerial) return;
    this.adInFlight = false;
    if (!rewarded) {
      this.refreshButtons();
      this.showDouyinToast("完整看完广告才能增加锤子");
      return;
    }

    this.hammerLimit += revive ? REVIVE_HAMMER_COUNT : AD_HAMMER_COUNT;
    if (revive) {
      this.roundState = "playing";
      this.resultSucceeded = false;
      this.sceneResultOverlay.active = false;
      this.sceneResultSuccessTitle.node.active = false;
      this.sceneResultFailureTitle.node.active = false;
      this.sceneSuccessActions.active = false;
      this.sceneFailureActions.active = false;
      // Failed on a bent/fully driven nail: replace it. A partially driven
      // straight nail keeps its height and hit count when resuming the round.
      if (this.nailNeedsReplacement) this.retireNail(this.sceneBentNail.active);
      else this.inputLocked = false;
    }
    this.refreshHud();
    this.showDouyinToast(revive ? "已复活，增加10锤" : "已增加5锤");
  }

  private showDouyinToast(title: string): void {
    try {
      const api = typeof tt !== "undefined" ? tt : null;
      if (typeof api?.showToast === "function") api.showToast({ title, icon: "none" });
      else console.log(`[nailHammerFeedGameScene] ${title}`);
    } catch {
      console.log(`[nailHammerFeedGameScene] ${title}`);
    }
  }

  private checkRoundEnd(): boolean {
    if (this.completedNails >= REQUIRED_NAILS) {
      this.finishRound(true);
      return true;
    }
    if (this.hammerCount >= this.hammerLimit) {
      this.finishRound(false);
      return true;
    }
    return false;
  }

  private finishRound(success: boolean): void {
    if (this.roundState !== "playing") return;
    this.roundState = "complete";
    this.resultSucceeded = success;
    this.inputLocked = true;
    this.sceneResultSuccessTitle.node.active = success;
    this.sceneResultFailureTitle.node.active = !success;
    this.sceneSuccessActions.active = success;
    this.sceneFailureActions.active = !success;
    this.refreshButtons();
    this.sceneResultProgress.string = `完整钉入 ${this.completedNails}/${REQUIRED_NAILS} 枚`;
    this.sceneResultDetail.string = success
      ? `使用 ${this.hammerCount} 锤，剩余 ${this.hammerLimit - this.hammerCount} 锤\n5 枚钉子全部钉入！`
      : `锤子已用完，还差 ${REQUIRED_NAILS - this.completedNails} 枚\n复活可保留当前进度继续挑战！`;
    this.sceneResultOverlay.active = true;
    Tween.stopAllByTarget(this.sceneResultPanel);
    this.sceneResultPanel.setScale(0.88, 0.88, 1);
    tween(this.sceneResultPanel).to(0.26, { scale: Vec3.ONE }, { easing: "backOut" }).start();
  }

  private goToMainGame = (): void => {
    if (this.roundState !== "complete" || !this.resultSucceeded || this.adInFlight) return;
    this.roundState = "leaving";
    this.sceneNextButton.interactable = false;
    this.finishFeedExperience();
    AudioManager.playDefaultBgm();
    void GameSceneBundle.loadScene(GameSceneName.Game).catch((err) => {
      console.error("[nailHammerFeedGameScene] 下一关加载失败", err);
      this.roundState = "complete";
      if (this.sceneNextButton?.node?.isValid) this.sceneNextButton.interactable = true;
    });
  };

  private returnToMain = (): void => {
    if (this.roundState === "leaving" || this.adInFlight) return;
    const previousState = this.roundState;
    this.roundState = "leaving";
    this.finishFeedExperience();
    AudioManager.playDefaultBgm();
    void GameSceneBundle.loadScene(GameSceneName.Main).catch((err) => {
      console.error("[nailHammerFeedGameScene] 返回主页失败", err);
      this.roundState = previousState;
    });
  };

  private async reportFeedSceneReady(): Promise<void> {
    await FeedAcquisitionService.reportSceneReadyAfterStableRender({
      owner: this.node,
      requiredVisibleNodes: [
        this.sceneBackground,
        this.sceneBoss,
        this.sceneWoodFront,
        this.sceneHammerReady,
        this.sceneStraightNail,
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
    this.refreshButtons();
    // 推荐流展示时直接播放 BGM，不等待正式进入；后台和激励广告仍暂停。
    if (!this.appHidden && !this.adInFlight && !SdkUtils.isRewardedVideoBusy()) {
      if (!this.feedAudioForeground) {
        this.feedAudioForeground = true;
        AudioManager.restartMusic(soundName.getUserBgm);
      } else AudioManager.playMusic(soundName.getUserBgm);
    }
    if (this.feedExited) {
      adc.cancelFeedEntryInterstitial();
      this.feedInterstitialScheduled = false;
    } else if (state.active && state.entered) {
      if (!this.feedInterstitialScheduled) {
        this.feedInterstitialScheduled = true;
        adc.scheduleFeedEntryInterstitial(() => {
          const current = FeedAcquisitionService.getState();
          return !!this.node?.isValid && this.roundState !== "leaving" &&
            !this.feedExperienceFinished && current.active && current.entered && !current.exited;
        });
      }
    }
  };

  private readonly onGameShow = (): void => {
    this.appHidden = false;
    if (!this.feedMode || this.adInFlight || SdkUtils.isRewardedVideoBusy()) return;
    this.feedAudioForeground = true;
    AudioManager.restartMusic(soundName.getUserBgm);
  };

  private readonly onGameHide = (): void => {
    this.appHidden = true;
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

  private isTouchInsideNode(event: EventTouch, node: Node | null): boolean {
    if (!node?.isValid || !node.activeInHierarchy) return false;
    const transform = node.getComponent(UITransform);
    if (!transform) return false;
    return transform.hitTest(event.getUILocation());
  }
}
