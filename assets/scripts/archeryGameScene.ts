import {
  _decorator,
  Button,
  Color,
  Component,
  director,
  EventTouch,
  game,
  Game,
  input,
  Input,
  Label,
  LabelOutline,
  Node,
  ResolutionPolicy,
  Sprite,
  SpriteFrame,
  tween,
  Tween,
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
import { ResourceManager } from "./framework/ResourceManager";
import { soundName } from "./gamePrefabMgr";

const { ccclass, property } = _decorator;

type ArcheryState = "playing" | "result";

interface ArrowRuntime {
  node: Node;
  x: number;
  y: number;
  passedGap: boolean;
}

const DESIGN_WIDTH = 750;
const DESIGN_HEIGHT = 1334;
const PLATFORM_Y = 105;
const PLATFORM_HEIGHT = 112;
const BULL_Y = 308;
const BOW_Y = -438;
const BOW_LIMIT = 248;
const BOW_SPEED = 430;
const ARROW_SPEED = 1540;
const ARROW_HALF_HEIGHT = 128;
const ARROW_WIDTH = 36;
const ARROW_LAND_PENETRATION = 32;
const ARROW_BULL_PENETRATION = 26;
const HIT_CENTER_TOLERANCE = 3;
const SHOT_COOLDOWN_MS = 105;
const TARGET_HITS = 1;
const MAX_STUCK_ARROWS = 30;

/**
 * 射中牛来：弓水平移动，点击发射竖直箭，只有穿过中央窄缝才能命中。
 * 主体节点固化在 ArcheryGameScene.scene，脚本只负责玩法、绘制和动画。
 */
@ccclass("archeryGameScene")
export class archeryGameScene extends Component {
  @property(Node)
  sceneHeaderPanel: Node | null = null;

  @property(Node)
  sceneHitsPanel: Node | null = null;

  @property(Node)
  sceneBull: Node | null = null;

  @property(Node)
  scenePlatform: Node | null = null;

  @property(Node)
  sceneArrowLayer: Node | null = null;

  @property(SpriteFrame)
  sceneArrowSpriteFrame: SpriteFrame | null = null;

  @property(Label)
  sceneHintLabel: Label | null = null;

  @property(Label)
  sceneTitleLabel: Label | null = null;

  @property(Label)
  sceneHitsLabel: Label | null = null;

  @property(Label)
  sceneGradeLabel: Label | null = null;

  @property(Label)
  sceneStatusLabel: Label | null = null;

  @property(Button)
  sceneBackButton: Button | null = null;

  @property(Node)
  sceneBow: Node | null = null;

  @property(Node)
  sceneUnusedRewardButton: Node | null = null;

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

  private state: ArcheryState = "playing";
  private hitCount = 0;
  private bowX = 0;
  private bowDirection = 1;
  private lastShotAt = 0;
  private leaving = false;
  private appHidden = false;
  private flyingArrows: ArrowRuntime[] = [];
  private stuckArrows: Node[] = [];
  private hitArrow: Node | null = null;

  private feedMode = false;
  private feedEntered = false;
  private feedExited = false;
  private feedAudioForeground = false;
  private feedAudioGestureRecovered = false;
  private feedInterstitialScheduled = false;
  private feedExperienceFinished = false;
  private nativeTouchApi: any | null = null;
  private nativeTouchBound = false;
  private artworkReadyPromise: Promise<void> = Promise.resolve();

  protected onLoad(): void {
    view.setDesignResolutionSize(DESIGN_WIDTH, DESIGN_HEIGHT, ResolutionPolicy.FIXED_WIDTH);
    FeedAcquisitionService.init();
    this.feedMode = FeedAcquisitionService.isActive();
    this.prepareSceneNodes();
    this.bindEvents();
    this.artworkReadyPromise = this.loadArtwork();
    this.resetRound();
  }

  protected start(): void {
    AudioManager.setSoundEvent();
    if (this.feedMode) {
      FeedAcquisitionService.addListener(this.onFeedStateChanged);
      this.bindNativeFeedTouchFallback();
      void this.reportFeedSceneAfterArtworkReady();
    } else {
      AudioManager.playMusic(soundName.archeryBgm);
    }
  }

  protected update(deltaTime: number): void {
    if (this.appHidden || this.state !== "playing" || (this.feedMode && this.feedExited)) return;
    const dt = Math.min(0.04, Math.max(0, deltaTime));
    this.updateBow(dt);
    this.updateArrows(dt);
  }

  protected onDestroy(): void {
    adc.cancelFeedEntryInterstitial();
    FeedAcquisitionService.removeListener(this.onFeedStateChanged);
    if (this.feedMode && !this.feedExperienceFinished) {
      this.feedExperienceFinished = true;
      FeedAcquisitionService.completeSession();
    }
    this.unbindNativeFeedTouchFallback();
    input.off(Input.EventType.TOUCH_END, this.onCanvasTouchEnd, this);
    input.off(Input.EventType.TOUCH_CANCEL, this.onCanvasTouchCancel, this);
    game.off(Game.EVENT_HIDE, this.onGameHide, this);
    game.off(Game.EVENT_SHOW, this.onGameShow, this);
    this.sceneBackButton?.node?.off(Button.EventType.CLICK, this.returnToMain, this);
    this.sceneResultActionButton?.node?.off(Button.EventType.CLICK, this.resetRound, this);
    this.sceneResultHomeButton?.node?.off(Button.EventType.CLICK, this.returnToMain, this);
    this.unscheduleAllCallbacks();
    this.stopSceneTweens();
  }

  private prepareSceneNodes(): void {
    const background = this.node.getChildByName("ArcheryBackground");
    background?.setPosition(0, 0, 0);
    background?.getComponent(UITransform)?.setContentSize(DESIGN_WIDTH, DESIGN_HEIGHT);

    this.sceneHeaderPanel?.setPosition(0, 545, 0);
    this.sceneHitsPanel?.setPosition(-286, 360, 0);
    this.scenePlatform?.setPosition(0, PLATFORM_Y, 0);
    this.scenePlatform?.getComponent(UITransform)?.setContentSize(DESIGN_WIDTH, PLATFORM_HEIGHT);
    this.sceneArrowLayer?.setPosition(0, 0, 0);
    this.sceneArrowLayer?.getComponent(UITransform)?.setContentSize(DESIGN_WIDTH, DESIGN_HEIGHT);
    this.sceneBull?.setPosition(0, BULL_Y, 0);
    this.sceneBull?.getComponent(UITransform)?.setContentSize(248, 372);
    this.sceneBow?.setPosition(0, BOW_Y, 0);
    this.sceneBow?.getComponent(UITransform)?.setContentSize(330, 198);

    const bowButton = this.sceneBow?.getComponent(Button);
    if (bowButton) bowButton.enabled = false;
    for (const child of this.sceneBow?.children ?? []) child.active = false;
    if (this.sceneUnusedRewardButton) this.sceneUnusedRewardButton.active = false;
    if (this.sceneResultOverlay) this.sceneResultOverlay.active = false;

    if (this.sceneTitleLabel) this.sceneTitleLabel.string = "射箭挑战之牛来";
    if (this.sceneHintLabel) this.sceneHintLabel.string = "点击屏幕发射，瞄准中央缺口";
    if (this.sceneResultActionLabel) this.sceneResultActionLabel.string = "再玩一次";
    if (this.sceneGradeLabel) {
      this.sceneGradeLabel.node.setPosition(0, -125, 0);
      this.sceneGradeLabel.fontSize = 72;
      this.sceneGradeLabel.lineHeight = 82;
      this.sceneGradeLabel.color = new Color(238, 174, 35, 255);
      const outline = this.sceneGradeLabel.node.getComponent(LabelOutline)
        ?? this.sceneGradeLabel.node.addComponent(LabelOutline);
      outline.color = new Color(74, 43, 14, 255);
      outline.width = 5;
    }
  }

  private bindEvents(): void {
    input.on(Input.EventType.TOUCH_END, this.onCanvasTouchEnd, this);
    input.on(Input.EventType.TOUCH_CANCEL, this.onCanvasTouchCancel, this);
    game.on(Game.EVENT_HIDE, this.onGameHide, this);
    game.on(Game.EVENT_SHOW, this.onGameShow, this);
    this.sceneBackButton?.node?.on(Button.EventType.CLICK, this.returnToMain, this);
    this.sceneResultActionButton?.node?.on(Button.EventType.CLICK, this.resetRound, this);
    this.sceneResultHomeButton?.node?.on(Button.EventType.CLICK, this.returnToMain, this);
  }

  private async loadArtwork(): Promise<void> {
    await Promise.all([
      this.loadSprite(this.sceneBull, "archeryGame/golden-bull/spriteFrame"),
      this.loadSprite(this.sceneBow, "archeryGame/wooden-bow/spriteFrame"),
    ]);
  }

  private async reportFeedSceneAfterArtworkReady(): Promise<void> {
    await this.artworkReadyPromise;
    if (!this.node?.isValid || !this.feedMode) return;

    const background = this.node.getChildByName("ArcheryBackground");
    await FeedAcquisitionService.reportSceneReadyAfterStableRender({
      owner: this.node,
      requiredVisibleNodes: [background, this.sceneBull, this.sceneBow, this.scenePlatform],
      isReady: () => this.state === "playing" && !this.leaving,
    });
  }

  private async loadSprite(node: Node | null, path: string): Promise<void> {
    const sprite = node?.getComponent(Sprite);
    if (!sprite) return;
    try {
      const frame = await ResourceManager.ins.loadBundleAsset("res", path, SpriteFrame);
      if (!node?.isValid) return;
      sprite.sizeMode = Sprite.SizeMode.CUSTOM;
      sprite.spriteFrame = frame;
    } catch (err) {
      console.warn(`[archeryGameScene] 图片加载失败: ${path}`, err);
    }
  }

  private resetRound = (): void => {
    if (this.leaving) return;
    this.unschedule(this.showResult);
    this.stopSceneTweens();
    this.clearArrows();
    this.state = "playing";
    this.hitCount = 0;
    this.bowX = 0;
    this.bowDirection = Math.random() < 0.5 ? -1 : 1;
    this.lastShotAt = 0;
    if (this.sceneBull) {
      this.sceneBull.active = true;
      this.sceneBull.setPosition(0, BULL_Y, 0);
      this.sceneBull.setScale(Vec3.ONE);
      this.sceneBull.angle = 0;
    }
    if (this.sceneBow) {
      this.sceneBow.active = true;
      this.sceneBow.setPosition(0, BOW_Y, 0);
      this.sceneBow.setScale(Vec3.ONE);
      this.sceneBow.angle = 0;
    }
    if (this.sceneResultOverlay) this.sceneResultOverlay.active = false;
    if (this.sceneStatusLabel) this.sceneStatusLabel.node.active = true;
    if (this.sceneGradeLabel?.node?.isValid) {
      this.sceneGradeLabel.node.active = true;
      this.sceneGradeLabel.node.setPosition(0, -125, 0);
      this.sceneGradeLabel.node.setScale(Vec3.ONE);
      this.sceneGradeLabel.node.angle = 0;
    }
    this.updateLabels();
  };

  private updateBow(dt: number): void {
    this.bowX += this.bowDirection * BOW_SPEED * dt;
    if (this.bowX >= BOW_LIMIT) {
      this.bowX = BOW_LIMIT;
      this.bowDirection = -1;
    } else if (this.bowX <= -BOW_LIMIT) {
      this.bowX = -BOW_LIMIT;
      this.bowDirection = 1;
    }
    this.sceneBow?.setPosition(this.bowX, BOW_Y, 0);
  }

  private readonly onCanvasTouchEnd = (event: EventTouch): void => {
    const target = event.target as Node | null;
    if (this.isNodeInside(target, this.sceneBackButton?.node) || this.isNodeInside(target, this.sceneResultOverlay)) {
      return;
    }
    this.handleFireGesture();
  };

  private readonly onCanvasTouchCancel = (): void => {};

  private handleFireGesture(): void {
    const enteredBeforeGesture = FeedAcquisitionService.getState().entered;
    this.activateFeedFromGesture();
    if (!this.isFeedInteractionEnabled() || this.state !== "playing" || this.leaving) return;
    if (this.feedMode && !enteredBeforeGesture) return;
    this.fireArrow();
  }

  private fireArrow(): void {
    const now = Date.now();
    if (
      now - this.lastShotAt < SHOT_COOLDOWN_MS ||
      !this.sceneArrowLayer ||
      !this.sceneArrowSpriteFrame
    ) return;
    this.lastShotAt = now;
    if (this.sceneStatusLabel?.node?.isValid) this.sceneStatusLabel.node.active = false;
    AudioManager.playEffect(soundName.archeryShoot);

    const node = new Node(`Arrow_${now}`);
    node.layer = this.node.layer;
    node.parent = this.sceneArrowLayer;
    node.addComponent(UITransform).setContentSize(ARROW_WIDTH, ARROW_HALF_HEIGHT * 2);
    const sprite = node.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.spriteFrame = this.sceneArrowSpriteFrame;
    const y = BOW_Y + ARROW_HALF_HEIGHT;
    node.setPosition(this.bowX, y, 0);
    this.flyingArrows.push({ node, x: this.bowX, y, passedGap: false });

    if (this.sceneBow?.isValid) {
      Tween.stopAllByTarget(this.sceneBow);
      this.sceneBow.setScale(Vec3.ONE);
      tween(this.sceneBow)
        .to(0.05, { scale: new Vec3(0.94, 1.08, 1) })
        .to(0.08, { scale: Vec3.ONE })
        .start();
    }
  }

  private updateArrows(dt: number): void {
    const platformBottom = PLATFORM_Y - PLATFORM_HEIGHT / 2;
    const bullBottom = BULL_Y - 174;
    for (let i = this.flyingArrows.length - 1; i >= 0; i--) {
      const arrow = this.flyingArrows[i];
      if (!arrow.node?.isValid) {
        this.flyingArrows.splice(i, 1);
        continue;
      }

      arrow.y += ARROW_SPEED * dt;
      let tipY = arrow.y + ARROW_HALF_HEIGHT;
      if (!arrow.passedGap && tipY >= platformBottom) {
        if (Math.abs(arrow.x) <= HIT_CENTER_TOLERANCE) {
          arrow.passedGap = true;
        } else {
          arrow.y = platformBottom + ARROW_LAND_PENETRATION - ARROW_HALF_HEIGHT;
          arrow.node.setPosition(arrow.x, arrow.y, 0);
          this.stickArrow(arrow.node);
          director.emit("vibrate_light");
          this.flyingArrows.splice(i, 1);
          continue;
        }
      }

      tipY = arrow.y + ARROW_HALF_HEIGHT;
      if (arrow.passedGap && tipY >= bullBottom) {
        arrow.y = bullBottom + ARROW_BULL_PENETRATION - ARROW_HALF_HEIGHT;
        arrow.node.setPosition(arrow.x, arrow.y, 0);
        this.stickArrow(arrow.node);
        this.attachArrowToBull(arrow.node);
        this.flyingArrows.splice(i, 1);
        this.registerHit();
        continue;
      }

      if (arrow.y > DESIGN_HEIGHT / 2 + 150) {
        arrow.node.destroy();
        this.flyingArrows.splice(i, 1);
        continue;
      }
      arrow.node.setPosition(arrow.x, arrow.y, 0);
    }
  }

  private stickArrow(node: Node): void {
    this.stuckArrows.push(node);
    const restAngle = (Math.random() - 0.5) * 2.4;
    node.setScale(0.94, 1.08, 1);
    tween(node)
      .to(0.04, { angle: restAngle + 1.8, scale: new Vec3(1.02, 0.98, 1) })
      .to(0.05, { angle: restAngle - 1.2, scale: new Vec3(0.98, 1.02, 1) })
      .to(0.08, { angle: restAngle, scale: Vec3.ONE })
      .start();
    while (this.stuckArrows.length > MAX_STUCK_ARROWS) {
      const oldest = this.stuckArrows.shift();
      if (oldest?.isValid) oldest.destroy();
    }
  }

  private attachArrowToBull(node: Node): void {
    if (!this.sceneBull?.isValid || !node?.isValid) return;
    this.hitArrow = node;
    node.setParent(this.sceneBull, true);
  }

  private registerHit(): void {
    this.hitCount += 1;
    AudioManager.playEffect(soundName.pingPongHit);
    director.emit("vibrate_light");
    this.updateLabels();
    if (this.hitCount >= TARGET_HITS) {
      this.finishRound();
      return;
    }
    this.playBullHitReaction();
  }

  private playBullHitReaction(): void {
    if (!this.sceneBull?.isValid) return;
    const direction = this.hitCount % 2 === 0 ? -1 : 1;
    Tween.stopAllByTarget(this.sceneBull);
    this.sceneBull.setPosition(0, BULL_Y, 0);
    this.sceneBull.setScale(Vec3.ONE);
    this.sceneBull.angle = 0;
    tween(this.sceneBull)
      .to(0.07, {
        position: new Vec3(direction * 16, BULL_Y + 20, 0),
        angle: direction * 8,
        scale: new Vec3(1.04, 0.96, 1),
      })
      .to(0.11, { position: new Vec3(0, BULL_Y, 0), angle: 0, scale: Vec3.ONE })
      .start();
  }

  private finishRound(): void {
    if (this.state !== "playing") return;
    this.state = "result";
    this.clearFlyingArrows();
    this.clearMissedArrows();
    director.emit("vibrate_success");
    if (this.sceneStatusLabel) this.sceneStatusLabel.node.active = false;
    this.playLegendLabelAnimation();
    if (this.sceneBull?.isValid) {
      const direction = Math.random() < 0.5 ? -1 : 1;
      Tween.stopAllByTarget(this.sceneBull);
      this.sceneBull.setPosition(0, BULL_Y, 0);
      this.sceneBull.setScale(Vec3.ONE);
      this.sceneBull.angle = 0;
      tween(this.sceneBull)
        .to(0.1, {
          position: new Vec3(0, BULL_Y - 10, 0),
          scale: new Vec3(1.12, 0.86, 1),
        })
        .to(0.3, {
          position: new Vec3(direction * 82, BULL_Y + 285, 0),
          angle: direction * 20,
          scale: new Vec3(0.94, 1.12, 1),
        }, { easing: "quadOut" })
        .to(0.38, {
          position: new Vec3(-direction * 125, BULL_Y + 220, 0),
          angle: -direction * 48,
          scale: new Vec3(1.08, 1.08, 1),
        })
        .to(0.44, {
          position: new Vec3(direction * 178, BULL_Y + 5, 0),
          angle: direction * 78,
          scale: new Vec3(1.05, 1.05, 1),
        }, { easing: "quadIn" })
        .to(0.12, {
          position: new Vec3(direction * 166, BULL_Y - 5, 0),
          angle: direction * 84,
          scale: new Vec3(1.08, 0.94, 1),
        }, { easing: "backOut" })
        .start();
    }
    this.scheduleOnce(this.showResult, 1.55);
  }

  private playLegendLabelAnimation(): void {
    if (!this.sceneGradeLabel?.node?.isValid) return;
    const node = this.sceneGradeLabel.node;
    this.sceneGradeLabel.string = "传奇级";
    node.active = true;
    Tween.stopAllByTarget(node);
    node.setScale(0.35, 0.35, 1);
    node.angle = -5;
    tween(node)
      .to(0.2, { scale: new Vec3(1.16, 1.16, 1), angle: 2 }, { easing: "backOut" })
      .to(0.08, { scale: Vec3.ONE, angle: 0 })
      .start();
  }

  private showResult = (): void => {
    if (!this.sceneResultOverlay?.isValid || this.leaving) return;
    if (this.sceneGradeLabel?.node?.isValid) this.sceneGradeLabel.node.active = false;
    this.sceneResultOverlay.active = true;
    if (this.sceneResultTitle) this.sceneResultTitle.string = "挑战成功";
    if (this.sceneResultDetail) {
      this.sceneResultDetail.string = "成功穿过中央缺口！\n你射中了牛来！";
    }
    if (this.sceneResultPanel?.isValid) {
      Tween.stopAllByTarget(this.sceneResultPanel);
      this.sceneResultPanel.setScale(0.7, 0.7, 1);
      tween(this.sceneResultPanel)
        .to(0.22, { scale: new Vec3(1.06, 1.06, 1) }, { easing: "backOut" })
        .to(0.09, { scale: Vec3.ONE })
        .start();
    }
  };

  private updateLabels(): void {
    if (this.sceneHitsLabel) {
      this.sceneHitsLabel.string = this.hitCount > 0 ? `${this.hitCount} Hits` : "Hits";
    }
    if (this.sceneGradeLabel) {
      this.sceneGradeLabel.string = this.hitCount >= 20 ? "大师级" : this.hitCount >= 10 ? "高手级" : "";
    }
    if (this.sceneStatusLabel) {
      this.sceneStatusLabel.string = this.hitCount >= 20 ? "再命中几次就是传奇！" : "根本没有人能射中牛来！";
    }
  }

  private clearArrows(): void {
    this.clearFlyingArrows();
    for (const node of this.stuckArrows) {
      if (node?.isValid) node.destroy();
    }
    this.stuckArrows.length = 0;
    this.hitArrow = null;
  }

  private clearMissedArrows(): void {
    const keptArrow = this.hitArrow?.isValid ? this.hitArrow : null;
    for (const node of this.stuckArrows) {
      if (node !== keptArrow && node?.isValid) node.destroy();
    }
    this.stuckArrows.length = 0;
    if (keptArrow) this.stuckArrows.push(keptArrow);
  }

  private clearFlyingArrows(): void {
    for (const arrow of this.flyingArrows) {
      if (arrow.node?.isValid) arrow.node.destroy();
    }
    this.flyingArrows.length = 0;
  }

  private stopSceneTweens(): void {
    if (this.sceneBull?.isValid) Tween.stopAllByTarget(this.sceneBull);
    if (this.sceneBow?.isValid) Tween.stopAllByTarget(this.sceneBow);
    if (this.sceneGradeLabel?.node?.isValid) Tween.stopAllByTarget(this.sceneGradeLabel.node);
    if (this.sceneResultPanel?.isValid) Tween.stopAllByTarget(this.sceneResultPanel);
  }

  private isNodeInside(candidate: Node | null, root: Node | null | undefined): boolean {
    if (!candidate || !root) return false;
    let current: Node | null = candidate;
    while (current) {
      if (current === root) return true;
      current = current.parent;
    }
    return false;
  }

  private returnToMain = (): void => {
    if (this.leaving) return;
    this.leaving = true;
    this.finishFeedExperience();
    AudioManager.playDefaultBgm();
    void GameSceneBundle.loadScene(GameSceneName.Main).catch((err) => {
      console.error("[archeryGameScene] 返回主页失败", err);
      this.leaving = false;
    });
  };

  private readonly onFeedStateChanged = (state: FeedAcquisitionState): void => {
    this.feedMode = state.active;
    this.feedEntered = state.entered;
    this.feedExited = state.exited;
    if (!state.active) {
      AudioManager.playMusic(soundName.archeryBgm);
      return;
    }
    if (state.exited) {
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
      AudioManager.restartMusic(soundName.archeryBgm);
    } else {
      AudioManager.playMusic(soundName.archeryBgm);
    }
  };

  private activateFeedFromGesture(): void {
    if (FeedAcquisitionService.isActive()) FeedAcquisitionService.activateFromFirstTouch();
    const state = FeedAcquisitionService.getState();
    if (state.active && (!state.entered || state.exited)) return;
    if (state.active && !this.feedAudioGestureRecovered) {
      this.feedAudioGestureRecovered = true;
      AudioManager.restartMusic(soundName.archeryBgm);
    } else if (!state.active) {
      AudioManager.playMusic(soundName.archeryBgm);
    }
  }

  private isFeedInteractionEnabled(): boolean {
    return !this.feedMode || (this.feedEntered && !this.feedExited);
  }

  private finishFeedExperience(): void {
    if (!this.feedMode || this.feedExperienceFinished) return;
    this.feedExperienceFinished = true;
    adc.cancelFeedEntryInterstitial();
    this.unbindNativeFeedTouchFallback();
    FeedAcquisitionService.removeListener(this.onFeedStateChanged);
    FeedAcquisitionService.completeSession();
    this.feedMode = false;
  }

  private bindNativeFeedTouchFallback(): void {
    if (!this.feedMode || this.nativeTouchBound) return;
    try {
      const api = typeof tt !== "undefined" ? tt : null;
      if (!api || typeof api.onTouchEnd !== "function") return;
      api.onTouchEnd(this.onNativeTouchEnd);
      if (typeof api.onTouchCancel === "function") api.onTouchCancel(this.onNativeTouchCancel);
      this.nativeTouchApi = api;
      this.nativeTouchBound = true;
    } catch (err) {
      console.warn("[archeryGameScene] 推荐流原生触摸注册失败", err);
    }
  }

  private unbindNativeFeedTouchFallback(): void {
    if (!this.nativeTouchBound || !this.nativeTouchApi) return;
    try {
      this.nativeTouchApi.offTouchEnd?.(this.onNativeTouchEnd);
      this.nativeTouchApi.offTouchCancel?.(this.onNativeTouchCancel);
    } catch (err) {
      console.warn("[archeryGameScene] 推荐流原生触摸解绑失败", err);
    }
    this.nativeTouchApi = null;
    this.nativeTouchBound = false;
  }

  private readonly onNativeTouchEnd = (): void => {
    this.handleFireGesture();
  };

  private readonly onNativeTouchCancel = (): void => {};

  private onGameHide = (): void => {
    this.appHidden = true;
    if (!this.feedMode) return;
    this.feedAudioForeground = false;
    AudioManager.pauseBgmForVideo();
  };

  private onGameShow = (): void => {
    this.appHidden = false;
    if (!this.feedMode) return;
    const state = FeedAcquisitionService.getState();
    if (state.exited) return;
    this.feedAudioForeground = true;
    AudioManager.restartMusic(soundName.archeryBgm);
  };
}
