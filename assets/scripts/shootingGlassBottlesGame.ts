import {
  _decorator,
  Button,
  Color,
  Component,
  director,
  Director,
  EventTouch,
  Game,
  game,
  HorizontalTextAlignment,
  JsonAsset,
  Label,
  Node,
  ResolutionPolicy,
  Sprite,
  SpriteFrame,
  tween,
  Tween,
  UITransform,
  UIOpacity,
  Vec3,
  VerticalTextAlignment,
  view,
} from "cc";
import { GameSceneBundle, GameSceneName } from "./framework/GameSceneBundle";
import { ResourceManager } from "./framework/ResourceManager";
import { SdkUtils } from "./framework/Platform/sdk/SdkUtils";
import UIManager, { UILayer } from "./framework/ui/UIManager";
import AudioManager from "./framework/AudioManager";
import gamePrefabMgr, { soundName, uiName } from "./gamePrefabMgr";
import PlayData from "./data/PlayData";
import { FeedAcquisitionService, FeedAcquisitionState } from "./framework/Platform/FeedAcquisitionService";
import { FeedRevisitService } from "./framework/Platform/FeedRevisitService";
import { adc } from "./framework/Platform/ADController";

const { ccclass, property } = _decorator;

interface ShootingLevelConfig {
  level: number;
  bottleCount: number;
  ammo: number;
  timeSeconds: number;
  minSwingDegrees: number;
  maxSwingDegrees: number;
  minSwingSpeed: number;
  maxSwingSpeed: number;
  hitRadius: number;
}

interface BottleState {
  bottleNode: Node;
  bottleOpacity: UIOpacity;
  ropeNode: Node;
  alive: boolean;
  pivotX: number;
  pivotY: number;
  ropeLength: number;
  totalLength: number;
  baseAngle: number;
  amplitude: number;
  speed: number;
  phase: number;
  currentAngle: number;
  currentCenter: Vec3;
}

interface ShootingAssets {
  bottle: SpriteFrame;
  brokenBottle: SpriteFrame;
  rope: SpriteFrame;
  bullet: SpriteFrame;
  hook: SpriteFrame;
  shard: SpriteFrame;
  muzzle: SpriteFrame;
}

type RoundState = "loading" | "playing" | "success" | "failed";
type FailureReason = "ammo" | "time" | null;

const DESIGN_WIDTH = 750;
const DESIGN_HEIGHT = 1334;
const RESOURCE_ROOT = "shootingGlassBottles";
const LEVEL_RESOURCE_PATH = `${RESOURCE_ROOT}/levels`;
const LEVEL_RESOURCE_UUID = "32dd7370-66a3-4885-8a3d-fb2aae6bd35f";
const TARGET_Y = -55;
const BOTTLE_WIDTH = 58;
const BOTTLE_HEIGHT = 188;
const BROKEN_BOTTLE_HEIGHT = 114;
const DEFAULT_PIVOT_Y = 345;
const COUNTDOWN_WARNING_SECONDS = 30;
const COUNTDOWN_BREATH_SCALE = 1.12;
const COUNTDOWN_BREATH_HALF_CYCLE = 0.55;
const COUNTDOWN_NORMAL_COLOR = new Color(255, 255, 255, 255);
const COUNTDOWN_WARNING_COLOR = new Color(231, 43, 59, 255);

const SHOOTING_ASSET_UUIDS: Record<keyof ShootingAssets, string> = {
  bottle: "5b990358-f4c5-5ccd-8df6-b600b3ff8b38@f9941",
  brokenBottle: "bfd54952-5a35-5d1c-98ea-07a1ea516cee@f9941",
  rope: "9eaf3f42-d58a-5fa4-a532-b077bdaece20@f9941",
  bullet: "3591f63e-66f5-5297-bf2b-72d39a332765@f9941",
  hook: "f76e624e-e74f-5a63-9b55-69a8dac68796@f9941",
  shard: "62c80bdc-7397-5a10-8bb1-289504f47b50@f9941",
  muzzle: "662f5d8f-b70f-5954-98fe-003462746909@f9941",
};

const FALLBACK_LEVELS: ShootingLevelConfig[] = [
  {
    level: 1,
    bottleCount: 10,
    ammo: 13,
    timeSeconds: 48,
    minSwingDegrees: 32,
    maxSwingDegrees: 40,
    minSwingSpeed: 1.75,
    maxSwingSpeed: 2.15,
    hitRadius: 22,
  },
  {
    level: 2,
    bottleCount: 10,
    ammo: 12,
    timeSeconds: 52,
    minSwingDegrees: 36,
    maxSwingDegrees: 46,
    minSwingSpeed: 1.95,
    maxSwingSpeed: 2.4,
    hitRadius: 18,
  },
  {
    level: 3,
    bottleCount: 10,
    ammo: 11,
    timeSeconds: 56,
    minSwingDegrees: 40,
    maxSwingDegrees: 52,
    minSwingSpeed: 2.15,
    maxSwingSpeed: 2.65,
    hitRadius: 15,
  },
];

@ccclass("shootingGlassBottlesGame")
export class shootingGlassBottlesGame extends Component {
  /** 只放关卡运行时需要克隆的图；固定 UI 已全部直接放在场景层级中。 */
  @property([SpriteFrame])
  shootingFrames: SpriteFrame[] = [];

  @property(JsonAsset)
  shootingLevelConfig: JsonAsset | null = null;

  @property(Node)
  gameplayRoot: Node | null = null;

  @property(Node)
  ropeLayerNode: Node | null = null;

  @property(Node)
  bottleLayerNode: Node | null = null;

  @property(Node)
  effectLayerNode: Node | null = null;

  @property(Node)
  gunNode: Node | null = null;

  @property(Node)
  gunMuzzleNode: Node | null = null;

  @property(Node)
  crosshairNode: Node | null = null;

  @property(Node)
  bottlePivotNode: Node | null = null;

  @property(Node)
  ammoIconNode: Node | null = null;

  @property(Button)
  settingButton: Button | null = null;

  @property(Button)
  addAmmoRewardButton: Button | null = null;

  @property(Button)
  addTimeRewardButton: Button | null = null;

  @property(Label)
  levelTitleLabel: Label | null = null;

  @property(Label)
  countdownLabel: Label | null = null;

  @property(Label)
  currentScoreLabel: Label | null = null;

  @property(Label)
  remainingAmmoLabel: Label | null = null;

  @property(Node)
  resultOverlayNode: Node | null = null;

  @property(UIOpacity)
  resultOverlayOpacity: UIOpacity | null = null;

  @property(Label)
  resultTitleLabel: Label | null = null;

  @property(Label)
  resultDetailLabel: Label | null = null;

  @property(Button)
  resultActionButton: Button | null = null;

  @property(Button)
  resultRestartButton: Button | null = null;

  @property(Label)
  resultActionLabel: Label | null = null;

  @property(Node)
  resultSuccessBackground: Node | null = null;

  @property(Node)
  resultAdBackground: Node | null = null;

  private assets: ShootingAssets | null = null;
  private levels: ShootingLevelConfig[] = FALLBACK_LEVELS;
  private level: ShootingLevelConfig = FALLBACK_LEVELS[0];
  private levelCursor = 0;
  private state: RoundState = "loading";
  private appVisible = true;
  private elapsed = 0;
  private remainingTime = 0;
  private remainingAmmo = 0;
  private totalShots = 0;
  private hits = 0;
  private score = 0;
  private firing = false;
  private adInFlight = false;
  private settingsOpen = false;
  private gunRestPosition = new Vec3(0, -535, 0);
  private targetPosition = new Vec3(0, TARGET_Y, 0);
  private timerBaseScale = Vec3.ONE.clone();
  private timerBreathing = false;
  private failureReason: FailureReason = null;
  private feedMode = false;
  private feedEntered = false;
  private feedExited = false;
  private feedAudioForeground = false;
  private feedAudioGestureRecovered = false;
  private feedInterstitialScheduled = false;
  private feedExperienceFinished = false;
  private feedRevisitScheduled = false;

  private gameRoot: Node | null = null;
  private playfield: Node | null = null;
  private ropeLayer: Node | null = null;
  private bottleLayer: Node | null = null;
  private effectLayer: Node | null = null;
  private pivotHook: Node | null = null;
  private bottles: BottleState[] = [];
  private gun: Node | null = null;
  private crosshair: Node | null = null;
  private ammoIcon: Node | null = null;
  private addAmmoButton: Node | null = null;
  private addTimeButton: Node | null = null;

  private timerLabel: Label | null = null;
  private scoreLabel: Label | null = null;
  private ammoLabel: Label | null = null;
  private overlay: Node | null = null;
  private overlayTitle: Label | null = null;
  private overlayDetail: Label | null = null;
  private nextButtonLabel: Label | null = null;
  private resultButton: Node | null = null;

  protected onLoad(): void {
    view.setDesignResolutionSize(DESIGN_WIDTH, DESIGN_HEIGHT, ResolutionPolicy.FIXED_WIDTH);
    if (!SdkUtils.sdk) SdkUtils.requireSDK();
    FeedAcquisitionService.init();
    this.feedMode = FeedAcquisitionService.isActive();
    this.node.on(Node.EventType.TOUCH_END, this.onScreenTouchEnd, this);
    this.settingButton?.node.on(Node.EventType.TOUCH_END, this.onSettingButtonTouchEnd, this);
    this.addAmmoRewardButton?.node.on(Node.EventType.TOUCH_END, this.onAddAmmoButtonTouchEnd, this);
    this.addTimeRewardButton?.node.on(Node.EventType.TOUCH_END, this.onAddTimeButtonTouchEnd, this);
    this.resultActionButton?.node.on(Node.EventType.TOUCH_END, this.onResultButtonTouchEnd, this);
    this.resultRestartButton?.node.on(Node.EventType.TOUCH_END, this.onRestartButtonTouchEnd, this);
    game.on(Game.EVENT_HIDE, this.onGameHide, this);
    game.on(Game.EVENT_SHOW, this.onGameShow, this);
  }

  protected async start(): Promise<void> {
    try {
      AudioManager.setSoundEvent();
      if (this.feedMode) {
        FeedAcquisitionService.addListener(this.onFeedStateChanged);
        this.node.on(Node.EventType.TOUCH_START, this.onFeedFallbackTouch, this, true);
      }
      if (!this.feedMode) {
        AudioManager.playMusic(soundName.getUserBgm);
      }
      await this.loadGameResources();
      if (!this.node?.isValid) return;
      this.bindSceneReferences();
      this.startLevel(0);
      if (this.feedMode) {
        director.once(Director.EVENT_END_FRAME, this.reportFeedSceneReady, this);
      }
    } catch (error) {
      console.error("[ShootingGlassBottles] 图片资源加载失败", error);
    }
  }

  /**
   * 编辑器运行中新增资源后，已经加载的 res Bundle 仍可能保留旧索引。
   * 第一次加载失败时刷新 Bundle 再重试，正式构建中通常不会走到重试。
   */
  private async loadGameResources(): Promise<void> {
    try {
      await Promise.all([this.loadAssets(), this.loadLevelConfigs()]);
    } catch (firstError) {
      ResourceManager.ins.removeBundle("res");
      try {
        await ResourceManager.ins.loadBundle("res");
        await Promise.all([this.loadAssets(), this.loadLevelConfigs()]);
      } catch (retryError) {
        console.error("[ShootingGlassBottles] 刷新 res Bundle 后仍无法加载资源", {
          firstError,
          retryError,
        });
        throw retryError;
      }
    }
  }

  protected update(deltaTime: number): void {
    if (
      this.state !== "playing" ||
      !this.appVisible ||
      this.adInFlight ||
      this.settingsOpen ||
      PlayData.Instance.ispause
    ) return;

    if (this.feedMode && this.feedExited) return;

    const safeDelta = Math.max(0, deltaTime);
    this.elapsed += safeDelta;
    this.updateIndependentBottles();
    // 推荐流卡片预览阶段保留瓶子摆动，但正式进入之前不消耗挑战时间。
    if (this.feedMode && !this.feedEntered) return;
    this.remainingTime = Math.max(0, this.remainingTime - safeDelta);
    this.refreshTimer();

    if (this.remainingTime <= 0) {
      this.finishRound(false);
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
    PlayData.Instance.ispause = false;
    this.unscheduleAllCallbacks();
    if (this.gameRoot?.isValid) Tween.stopAllByTarget(this.gameRoot);
    if (this.gun?.isValid) Tween.stopAllByTarget(this.gun);
    this.stopTimerBreathing();
    for (const bottle of this.bottles) {
      if (bottle.bottleNode.isValid) Tween.stopAllByTarget(bottle.bottleNode);
      if (bottle.bottleOpacity.isValid) Tween.stopAllByTarget(bottle.bottleOpacity);
    }
  }

  private readonly onScreenTouchEnd = (event: EventTouch): void => {
    this.activateFeedFromGesture();
    if (
      event.propagationStopped ||
      this.state !== "playing" ||
      this.firing ||
      this.settingsOpen ||
      !this.isFeedInteractionEnabled() ||
      PlayData.Instance.ispause
    ) return;
    this.fire();
  };

  private readonly onSettingButtonTouchEnd = (event: EventTouch): void => {
    event.propagationStopped = true;
    this.activateFeedFromGesture();
    if (!this.isFeedInteractionEnabled()) return;
    void this.openSettings();
  };

  private readonly onAddAmmoButtonTouchEnd = (event: EventTouch): void => {
    event.propagationStopped = true;
    this.activateFeedFromGesture();
    if (!this.isFeedInteractionEnabled()) return;
    void this.watchAdForAmmo(false);
  };

  private readonly onAddTimeButtonTouchEnd = (event: EventTouch): void => {
    event.propagationStopped = true;
    this.activateFeedFromGesture();
    if (!this.isFeedInteractionEnabled()) return;
    void this.watchAdForTime(false);
  };

  private readonly onResultButtonTouchEnd = (event: EventTouch): void => {
    event.propagationStopped = true;
    this.activateFeedFromGesture();
    if (!this.isFeedInteractionEnabled()) return;
    this.onResultButtonClicked();
  };

  private readonly onRestartButtonTouchEnd = (event: EventTouch): void => {
    event.propagationStopped = true;
    this.activateFeedFromGesture();
    if (!this.isFeedInteractionEnabled() || this.state !== "failed" || this.adInFlight) return;
    this.startLevel(this.levelCursor);
  };

  private readonly onGameHide = (): void => {
    this.appVisible = false;
    if (!this.feedMode) return;
    this.feedAudioForeground = false;
    AudioManager.pauseBgmForVideo();
  };

  private readonly onGameShow = (): void => {
    this.appVisible = true;
    if (!this.feedMode) return;
    const state = FeedAcquisitionService.getState();
    if (state.exited) return;
    this.feedAudioForeground = true;
    AudioManager.restartMusic(soundName.getUserBgm);
  };

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
    } else {
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
    if (this.node?.isValid) {
      this.node.off(Node.EventType.TOUCH_START, this.onFeedFallbackTouch, this, true);
    }
    FeedAcquisitionService.removeListener(this.onFeedStateChanged);
    FeedAcquisitionService.completeSession();
    this.feedMode = false;
  }

  private async loadAssets(): Promise<void> {
    const names: Array<keyof ShootingAssets> = [
      "bottle",
      "brokenBottle",
      "rope",
      "bullet",
      "hook",
      "shard",
      "muzzle",
    ];
    const frames = await Promise.all(
      names.map((name, index) => {
        const serializedFrame = this.shootingFrames[index];
        if (serializedFrame?.isValid) return serializedFrame;
        const resourcePath = `${RESOURCE_ROOT}/${name}`;
        return this.loadSpriteFrame(resourcePath, SHOOTING_ASSET_UUIDS[name]);
      }),
    );
    this.assets = names.reduce((result, name, index) => {
      result[name] = frames[index];
      return result;
    }, {} as ShootingAssets);
  }

  private async loadSpriteFrame(path: string, uuid: string): Promise<SpriteFrame> {
    const candidates = [`${path}/spriteFrame`, path];
    let lastError: unknown = null;
    for (const candidate of candidates) {
      try {
        return await ResourceManager.ins.loadBundleAsset("res", candidate, SpriteFrame);
      } catch (error) {
        lastError = error;
      }
    }
    try {
      return await ResourceManager.ins.loadAssetByUuid<SpriteFrame>(uuid);
    } catch (error) {
      lastError = error;
    }
    throw lastError ?? new Error(`无法加载图片: ${path}`);
  }

  private async loadLevelConfigs(): Promise<void> {
    let asset = this.shootingLevelConfig;
    if (!asset?.isValid) {
      try {
        asset = await ResourceManager.ins.loadBundleAsset("res", LEVEL_RESOURCE_PATH, JsonAsset);
      } catch {
        asset = await ResourceManager.ins.loadAssetByUuid<JsonAsset>(LEVEL_RESOURCE_UUID);
      }
    }
    const values = Array.isArray(asset.json?.levels) ? asset.json.levels : [];
    const parsed = values.map((value: unknown, index: number) => this.normalizeLevel(value, index));
    if (parsed.length > 0) this.levels = parsed;
  }

  private normalizeLevel(value: unknown, index: number): ShootingLevelConfig {
    const raw = value as Record<string, unknown> | null;
    const fallback = FALLBACK_LEVELS[Math.min(index, FALLBACK_LEVELS.length - 1)];
    const minDegrees = this.clamp(Number(raw?.minSwingDegrees) || fallback.minSwingDegrees, 8, 38);
    const maxDegrees = this.clamp(Number(raw?.maxSwingDegrees) || fallback.maxSwingDegrees, minDegrees, 42);
    const minSpeed = this.clamp(Number(raw?.minSwingSpeed) || fallback.minSwingSpeed, 0.45, 2.4);
    const maxSpeed = this.clamp(Number(raw?.maxSwingSpeed) || fallback.maxSwingSpeed, minSpeed, 2.8);
    return {
      level: Math.max(1, Math.floor(Number(raw?.level) || index + 1)),
      bottleCount: this.clamp(Math.floor(Number(raw?.bottleCount) || fallback.bottleCount), 6, 14),
      ammo: this.clamp(Math.floor(Number(raw?.ammo) || fallback.ammo), 6, 30),
      timeSeconds: this.clamp(Number(raw?.timeSeconds) || fallback.timeSeconds, 20, 120),
      minSwingDegrees: minDegrees,
      maxSwingDegrees: maxDegrees,
      minSwingSpeed: minSpeed,
      maxSwingSpeed: maxSpeed,
      hitRadius: this.clamp(Number(raw?.hitRadius) || fallback.hitRadius, 12, 42),
    };
  }

  private bindSceneReferences(): void {
    const missing = [
      ["gameplayRoot", this.gameplayRoot],
      ["ropeLayerNode", this.ropeLayerNode],
      ["bottleLayerNode", this.bottleLayerNode],
      ["effectLayerNode", this.effectLayerNode],
      ["gunNode", this.gunNode],
      ["gunMuzzleNode", this.gunMuzzleNode],
      ["crosshairNode", this.crosshairNode],
      ["bottlePivotNode", this.bottlePivotNode],
      ["resultOverlayNode", this.resultOverlayNode],
    ].filter(([, value]) => !value).map(([name]) => name);
    if (missing.length > 0) {
      throw new Error(`场景 UI 引用缺失: ${missing.join(", ")}`);
    }

    this.gameRoot = this.gameplayRoot;
    this.playfield = this.gameplayRoot;
    this.ropeLayer = this.ropeLayerNode;
    this.bottleLayer = this.bottleLayerNode;
    this.effectLayer = this.effectLayerNode;
    this.gun = this.gunNode;
    this.crosshair = this.crosshairNode;
    this.ammoIcon = this.ammoIconNode;
    this.addAmmoButton = this.addAmmoRewardButton?.node ?? null;
    this.addTimeButton = this.addTimeRewardButton?.node ?? null;
    this.timerLabel = this.countdownLabel;
    this.scoreLabel = this.currentScoreLabel;
    this.ammoLabel = this.remainingAmmoLabel;
    this.overlay = this.resultOverlayNode;
    this.overlayTitle = this.resultTitleLabel;
    this.overlayDetail = this.resultDetailLabel;
    this.nextButtonLabel = this.resultActionLabel;
    this.resultButton = this.resultActionButton?.node ?? null;
    this.gunRestPosition.set(this.gun!.position);
    this.targetPosition.set(this.crosshair!.position);
    this.timerBaseScale.set(this.timerLabel!.node.scale);
  }

  private startLevel(cursor: number): void {
    if (!this.assets || !this.gameRoot) return;
    this.levelCursor = ((cursor % this.levels.length) + this.levels.length) % this.levels.length;
    this.level = this.levels[this.levelCursor];
    this.state = "playing";
    this.elapsed = 0;
    this.remainingTime = this.level.timeSeconds;
    this.remainingAmmo = this.level.ammo;
    this.totalShots = 0;
    this.hits = 0;
    this.score = 0;
    this.firing = false;
    this.adInFlight = false;
    this.failureReason = null;
    this.stopTimerBreathing();
    this.buildIndependentBottles();
    this.hideOverlay();
    this.refreshHud();
  }

  private buildIndependentBottles(): void {
    const assets = this.assets!;
    for (const bottle of this.bottles) {
      bottle.bottleNode.destroy();
      bottle.ropeNode.destroy();
    }
    this.pivotHook?.destroy();
    this.pivotHook = null;
    this.bottles.length = 0;

    const count = this.level.bottleCount;
    const pivotY = this.bottlePivotNode?.position.y ?? DEFAULT_PIVOT_Y;
    const pivotX = this.bottlePivotNode?.position.x ?? 0;
    const totalLength = pivotY - this.targetPosition.y;
    const ropeLength = totalLength - BOTTLE_HEIGHT * 0.5;
    const baseAngle = 0;
    for (let index = 0; index < count; index++) {
      const amplitude = this.lerp(
        this.level.minSwingDegrees,
        this.level.maxSwingDegrees,
        this.seededUnit(index * 17 + this.level.level * 31),
      );
      const speed = this.lerp(
        this.level.minSwingSpeed,
        this.level.maxSwingSpeed,
        this.seededUnit(index * 29 + this.level.level * 43),
      );
      const phase = (0.72 + index * 1.37 + this.level.level * 0.19) % (Math.PI * 2);

      const ropeNode = this.createSprite(`Rope${index + 1}`, this.ropeLayer!, assets.rope, 10, ropeLength);
      ropeNode.setPosition(pivotX, pivotY, 0);
      ropeNode.getComponent(UITransform)?.setAnchorPoint(0.5, 1);

      const bottleNode = this.createSprite(`Bottle${index + 1}`, this.bottleLayer!, assets.bottle, BOTTLE_WIDTH, BOTTLE_HEIGHT);
      bottleNode.getComponent(UITransform)?.setAnchorPoint(0.5, 1);
      const bottleOpacity = bottleNode.addComponent(UIOpacity);

      const state: BottleState = {
        bottleNode,
        bottleOpacity,
        ropeNode,
        alive: true,
        pivotX,
        pivotY,
        ropeLength,
        totalLength,
        baseAngle,
        amplitude,
        speed,
        phase,
        currentAngle: baseAngle,
        currentCenter: new Vec3(),
      };
      this.bottles.push(state);
      this.updateBottleTransform(state);
    }

    // 挂点最后创建，盖住所有绳头，视觉上所有绳子都系在同一个点上。
    this.pivotHook = this.createSprite("SharedPivot", this.ropeLayer!, assets.hook, 66, 66);
    this.pivotHook.setPosition(pivotX, pivotY + 13, 0);
  }

  private updateIndependentBottles(): void {
    for (const bottle of this.bottles) {
      if (!bottle.bottleNode.isValid) continue;
      this.updateBottleTransform(bottle);
    }
  }

  private updateBottleTransform(bottle: BottleState): void {
    const swing = Math.sin(this.elapsed * bottle.speed + bottle.phase) * bottle.amplitude;
    const angle = bottle.baseAngle + swing;
    const radians = angle * (Math.PI / 180);
    const directionX = Math.sin(radians);
    const directionY = -Math.cos(radians);
    const capX = bottle.pivotX + directionX * bottle.ropeLength;
    const capY = bottle.pivotY + directionY * bottle.ropeLength;
    bottle.currentAngle = angle;
    bottle.currentCenter.set(
      bottle.pivotX + directionX * bottle.totalLength,
      bottle.pivotY + directionY * bottle.totalLength,
      0,
    );
    bottle.ropeNode.angle = angle;
    bottle.bottleNode.setPosition(capX, capY, 0);
    bottle.bottleNode.angle = angle;
  }

  private fire(): void {
    if (
      this.state !== "playing" ||
      this.firing ||
      this.remainingAmmo <= 0 ||
      !this.playfield ||
      !this.gun ||
      !this.crosshair ||
      !this.assets
    ) {
      return;
    }

    this.firing = true;
    AudioManager.playEffect(soundName.shoot);
    this.remainingAmmo--;
    this.totalShots++;
    this.refreshAmmo();
    const hitBottle = this.findBottleAtCrosshair();
    const target = this.crosshair.position.clone();
    const effectTransform = this.effectLayer.getComponent(UITransform);
    const muzzleTransform = this.gunMuzzleNode?.getComponent(UITransform);
    const start = effectTransform && muzzleTransform
      ? effectTransform.convertToNodeSpaceAR(muzzleTransform.convertToWorldSpaceAR(Vec3.ZERO))
      : this.gun.position.clone();
    const bullet = this.createSprite("FlyingBullet", this.effectLayer!, this.assets.bullet, 15, 38);
    bullet.setPosition(start);
    bullet.angle = -Math.atan2(target.x - start.x, target.y - start.y) * (180 / Math.PI);
    this.playMuzzleFlash(start);
    this.playGunRecoil();

    tween(bullet)
      .to(0.11, { position: target, scale: new Vec3(0.55, 0.55, 1) }, { easing: "quadIn" })
      .call(() => {
        if (!this.node?.isValid) return;
        bullet.destroy();
        if (hitBottle?.bottleNode.isValid && hitBottle.alive) {
          this.breakBottle(hitBottle);
        } else {
          this.showShotFeedback(target, "MISS", new Color(255, 244, 225, 255));
        }
        this.firing = false;
        if (
          this.state === "playing" &&
          this.remainingAmmo <= 0 &&
          this.bottles.some((bottle) => bottle.alive)
        ) {
          this.finishRound(false);
        }
      })
      .start();
  }

  private findBottleAtCrosshair(): BottleState | null {
    let closest: BottleState | null = null;
    let closestDistance = Number.POSITIVE_INFINITY;
    for (const bottle of this.bottles) {
      if (!bottle.alive || !bottle.bottleNode.isValid) continue;
      const distance = Math.hypot(
        bottle.currentCenter.x - this.targetPosition.x,
        bottle.currentCenter.y - this.targetPosition.y,
      );
      if (distance < closestDistance) {
        closestDistance = distance;
        closest = bottle;
      }
    }
    return closest && closestDistance <= this.level.hitRadius ? closest : null;
  }

  private breakBottle(bottle: BottleState): void {
    if (!bottle.alive || !bottle.bottleNode.isValid) return;
    bottle.alive = false;
    AudioManager.playEffect(soundName.glassbroke);
    this.hits++;
    this.score += 100 + Math.max(0, Math.floor(this.remainingTime));
    const impact = bottle.currentCenter.clone();
    this.spawnShards(impact, bottle.currentAngle);
    this.showShotFeedback(impact, "+100", new Color(255, 244, 70, 255));

    const sprite = bottle.bottleNode.getComponent(Sprite);
    if (sprite) sprite.spriteFrame = this.assets!.brokenBottle;
    bottle.bottleNode.getComponent(UITransform)?.setContentSize(
      BOTTLE_WIDTH,
      BROKEN_BOTTLE_HEIGHT,
    );
    bottle.bottleOpacity.opacity = 255;
    tween(bottle.bottleNode)
      .to(0.07, { scale: new Vec3(1.2, 0.86, 1) })
      .to(0.12, { scale: Vec3.ONE }, { easing: "backOut" })
      .start();
    this.refreshHud();

    if (this.bottles.every((item) => !item.alive)) {
      this.score += Math.floor(this.remainingTime) * 10 + this.remainingAmmo * 40;
      this.scheduleOnce(() => this.finishRound(true), 0.34);
    }
  }

  private spawnShards(position: Vec3, sourceAngle: number): void {
    if (!this.effectLayer || !this.assets) return;
    const colors = [
      new Color(255, 86, 164, 255),
      new Color(255, 151, 205, 255),
      new Color(255, 221, 239, 255),
      new Color(207, 50, 132, 255),
    ];
    for (let index = 0; index < 7; index++) {
      const shard = this.createSprite("GlassShard", this.effectLayer, this.assets.shard, 28, 31);
      shard.setPosition(position.x, position.y - 38, 0);
      shard.angle = sourceAngle + index * 31;
      shard.getComponent(Sprite)!.color = colors[index % colors.length];
      const opacity = shard.addComponent(UIOpacity);
      const spread = (index - 3) / 3;
      const distance = 65 + (index % 3) * 20;
      const destination = new Vec3(
        position.x + spread * distance,
        position.y - 125 - (index % 3) * 35,
        0,
      );
      tween(shard)
        .to(0.48, { position: destination, angle: shard.angle + (index % 2 ? 220 : -210) }, { easing: "quadOut" })
        .call(() => shard.destroy())
        .start();
      tween(opacity).delay(0.14).to(0.32, { opacity: 0 }).start();
    }
  }

  private playMuzzleFlash(position: Vec3): void {
    if (!this.effectLayer || !this.assets) return;
    const flash = this.createSprite("MuzzleFlash", this.effectLayer, this.assets.muzzle, 106, 106);
    flash.setPosition(position);
    flash.setScale(0.25, 0.25, 1);
    const opacity = flash.addComponent(UIOpacity);
    tween(flash).to(0.09, { scale: Vec3.ONE }).call(() => flash.destroy()).start();
    tween(opacity).to(0.09, { opacity: 0 }).start();
  }

  private playGunRecoil(): void {
    if (!this.gun) return;
    Tween.stopAllByTarget(this.gun);
    const basePosition = this.gunRestPosition.clone();
    this.gun.setPosition(basePosition);
    tween(this.gun)
      .to(0.055, { position: new Vec3(basePosition.x, basePosition.y - 14, basePosition.z), angle: 1.5 })
      .to(0.095, { position: basePosition, angle: 0 }, { easing: "quadOut" })
      .start();
  }

  private showShotFeedback(position: Vec3, text: string, color: Color): void {
    if (!this.effectLayer) return;
    const label = this.createLabel(this.effectLayer, text, 30, color);
    label.node.setPosition(position.x, position.y + 35, 0);
    const opacity = label.node.addComponent(UIOpacity);
    tween(label.node)
      .to(0.48, { position: new Vec3(position.x, position.y + 112, 0), scale: new Vec3(1.18, 1.18, 1) }, { easing: "quadOut" })
      .call(() => label.node.destroy())
      .start();
    tween(opacity).delay(0.16).to(0.3, { opacity: 0 }).start();
  }

  private finishRound(success: boolean): void {
    if (this.state !== "playing") return;
    this.state = success ? "success" : "failed";
    this.failureReason = success ? null : this.resolveFailureReason();
    this.stopTimerBreathing();
    const accuracy = this.totalShots > 0 ? Math.round((this.hits / this.totalShots) * 100) : 0;
    const revisitCompleted =
      success &&
      FeedAcquisitionService.isRevisit() &&
      this.levelCursor >= this.levels.length - 1;
    if (revisitCompleted && !this.feedRevisitScheduled) {
      this.feedRevisitScheduled = true;
      FeedRevisitService.scheduleNextImportantEvent(FeedAcquisitionService.getContentId());
    }
    if (this.overlayTitle) {
      this.overlayTitle.string = success ? "挑战成功" : "挑战失败";
      this.overlayTitle.color = success
        ? new Color(220, 87, 29, 255)
        : new Color(211, 49, 89, 255);
    }
    if (this.overlayDetail) {
      const failureMessage = this.failureReason === "ammo"
        ? "子弹已经用完，还有瓶子在摇晃！"
        : "时间耗尽，还有瓶子没有击碎！";
      this.overlayDetail.string = success
        ? `准确率：${accuracy}%\n最终得分：${this.score}\n剩余子弹：${this.remainingAmmo}`
        : `准确率：${accuracy}%\n${failureMessage}\n击碎 ${this.hits}/${this.level.bottleCount} 个瓶子`;
    }
    if (this.nextButtonLabel) {
      this.nextButtonLabel.string = success
        ? revisitCompleted
          ? "返回主页"
          : this.levelCursor >= this.levels.length - 1
          ? "重新开始"
          : "下一关"
        : this.failureReason === "ammo"
          ? "+5子弹复活"
          : "+20秒复活";
    }
    if (this.resultButton) {
      this.resultButton.name = success ? "NextLevelButton" : "RewardReviveButton";
      if (this.resultSuccessBackground) this.resultSuccessBackground.active = success;
      if (this.resultAdBackground) this.resultAdBackground.active = !success;
    }
    if (this.resultRestartButton?.node) this.resultRestartButton.node.active = !success;
    this.showOverlay();
  }

  private resolveFailureReason(): Exclude<FailureReason, null> {
    // 以实际剩余资源为准，避免最后一发子弹和倒计时临界帧造成弹窗奖励串线。
    // 只有“时间耗尽但仍有子弹”才补时间；其余子弹为 0 的情况一律补子弹。
    if (this.remainingTime <= 0 && this.remainingAmmo > 0) return "time";
    return "ammo";
  }

  private onResultButtonClicked(): void {
    if (this.state === "failed") {
      if (this.failureReason === "ammo") void this.watchAdForAmmo(true);
      else void this.watchAdForTime(true);
      return;
    }
    if (
      FeedAcquisitionService.isRevisit() &&
      this.levelCursor >= this.levels.length - 1
    ) {
      this.returnToMainScene();
      return;
    }
    this.startLevel(this.levelCursor + 1);
  }

  private async openSettings(): Promise<void> {
    if (this.settingsOpen || this.adInFlight) return;

    this.settingsOpen = true;
    PlayData.Instance.ispause = true;
    const manager = UIManager.instance;
    if (!manager) {
      this.finishSettingsPause();
      return;
    }

    // MainScene 通常已经预载了设置面板；直接从此场景预览时也补一次加载。
    if (!gamePrefabMgr.Instance.uiPre[uiName.settingPanel]) {
      try {
        await gamePrefabMgr.Instance.loadDefaultAssets();
      } catch (error) {
        console.error("[ShootingGlassBottles] 设置面板加载失败", error);
        this.finishSettingsPause();
        return;
      }
    }
    if (!this.node?.isValid || !this.settingsOpen) return;

    const panel = manager.open(
      uiName.settingPanel,
      {
        enterType: 1,
        showRetry: true,
        showBack: true,
        onClose: () => this.finishSettingsPause(),
        onRetry: () => {
          this.finishSettingsPause(false);
          this.startLevel(this.levelCursor);
        },
        onBack: () => {
          this.finishSettingsPause(false);
          this.returnToMainScene();
        },
        onMusicEnabled: () => AudioManager.playMusic(soundName.getUserBgm),
      },
      UILayer.Popup,
    );
    if (!panel) this.finishSettingsPause();
  }

  private finishSettingsPause(restoreGameState = true): void {
    if (!this.settingsOpen) return;
    this.settingsOpen = false;
    PlayData.Instance.ispause = false;
    if (!restoreGameState) this.firing = false;
  }

  private returnToMainScene(): void {
    this.finishFeedExperience();
    AudioManager.playDefaultBgm();
    void GameSceneBundle.loadScene(GameSceneName.Main).catch((error) => {
      console.error("[ShootingGlassBottles] 返回主页失败", error);
    });
  }

  private async watchAdForAmmo(fromRevive: boolean): Promise<void> {
    if (this.adInFlight || SdkUtils.isRewardedVideoBusy()) return;
    this.adInFlight = true;
    this.setRewardButtonsInteractable(false);
    const success = await SdkUtils.showRewardedVideo();
    if (!this.node?.isValid) return;
    this.adInFlight = false;
    this.setRewardButtonsInteractable(true);
    if (!success) {
      this.showToast("请完整观看广告后领取子弹");
      return;
    }
    this.remainingAmmo += 5;
    this.refreshAmmo();
    if (fromRevive) this.resumeAfterReward();
    else this.showToast("获得子弹 +5");
  }

  private async watchAdForTime(fromRevive: boolean): Promise<void> {
    if (this.adInFlight || SdkUtils.isRewardedVideoBusy()) return;
    this.adInFlight = true;
    this.setRewardButtonsInteractable(false);
    const success = await SdkUtils.showRewardedVideo();
    if (!this.node?.isValid) return;
    this.adInFlight = false;
    this.setRewardButtonsInteractable(true);
    if (!success) {
      this.showToast("请完整观看广告后领取时间");
      return;
    }
    this.remainingTime += 20;
    this.refreshTimer();
    if (fromRevive) this.resumeAfterReward();
    else this.showToast("获得时间 +20秒");
  }

  private resumeAfterReward(): void {
    this.state = "playing";
    this.failureReason = null;
    this.firing = false;
    this.hideOverlay();
    this.refreshTimer();
  }

  private setRewardButtonsInteractable(interactable: boolean): void {
    for (const node of [
      this.addAmmoButton,
      this.addTimeButton,
      this.resultButton,
      this.resultRestartButton?.node,
    ]) {
      const button = node?.getComponent(Button);
      if (button) button.interactable = interactable;
    }
  }

  private showToast(title: string): void {
    try {
      const api = typeof tt !== "undefined" ? tt : null;
      if (typeof api?.showToast === "function") {
        api.showToast({ title, icon: "none" });
      } else {
        console.log(`[ShootingGlassBottles] ${title}`);
      }
    } catch {
      console.log(`[ShootingGlassBottles] ${title}`);
    }
  }

  private showOverlay(): void {
    const overlay = this.overlay;
    const opacity = this.resultOverlayOpacity ?? overlay?.getComponent(UIOpacity);
    if (!overlay || !opacity) return;
    overlay.active = true;
    overlay.setScale(0.9, 0.9, 1);
    opacity.opacity = 0;
    tween(opacity).to(0.2, { opacity: 255 }).start();
    tween(overlay).to(0.22, { scale: Vec3.ONE }, { easing: "backOut" }).start();
  }

  private hideOverlay(): void {
    if (!this.overlay) return;
    Tween.stopAllByTarget(this.overlay);
    this.overlay.active = false;
  }

  private refreshHud(): void {
    if (this.scoreLabel) this.scoreLabel.string = `当前得分：\n${this.score}`;
    this.refreshTimer();
    this.refreshAmmo();
  }

  private refreshTimer(): void {
    if (!this.timerLabel) return;
    this.timerLabel.string = `时间：${Math.max(0, Math.ceil(this.remainingTime))}s`;
    const warning = this.remainingTime <= COUNTDOWN_WARNING_SECONDS;
    this.timerLabel.color = warning ? COUNTDOWN_WARNING_COLOR : COUNTDOWN_NORMAL_COLOR;
    if (warning && this.state === "playing") this.startTimerBreathing();
    else if (this.timerBreathing) this.stopTimerBreathing();
  }

  private startTimerBreathing(): void {
    const timerNode = this.timerLabel?.node;
    if (!timerNode?.isValid || this.timerBreathing) return;
    this.timerBreathing = true;
    Tween.stopAllByTarget(timerNode);
    timerNode.setScale(this.timerBaseScale);
    const breathScale = new Vec3(
      this.timerBaseScale.x * COUNTDOWN_BREATH_SCALE,
      this.timerBaseScale.y * COUNTDOWN_BREATH_SCALE,
      this.timerBaseScale.z,
    );
    tween(timerNode)
      .repeatForever(
        tween(timerNode)
          .to(COUNTDOWN_BREATH_HALF_CYCLE, { scale: breathScale }, { easing: "sineInOut" })
          .to(COUNTDOWN_BREATH_HALF_CYCLE, { scale: this.timerBaseScale.clone() }, { easing: "sineInOut" }),
      )
      .start();
  }

  private stopTimerBreathing(): void {
    const timerNode = this.timerLabel?.node;
    this.timerBreathing = false;
    if (!timerNode?.isValid) return;
    Tween.stopAllByTarget(timerNode);
    timerNode.setScale(this.timerBaseScale);
  }

  private refreshAmmo(): void {
    if (this.ammoLabel) this.ammoLabel.string = `×${this.remainingAmmo}`;
    if (this.ammoIcon) this.ammoIcon.active = this.remainingAmmo > 0;
  }

  private createSprite(
    name: string,
    parent: Node,
    frame: SpriteFrame,
    width: number,
    height: number,
  ): Node {
    const node = this.createNode(name, parent, width, height);
    const sprite = node.addComponent(Sprite);
    sprite.spriteFrame = frame;
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.type = Sprite.Type.SIMPLE;
    node.getComponent(UITransform)?.setContentSize(width, height);
    return node;
  }

  private createNode(name: string, parent: Node, width: number, height: number): Node {
    const node = new Node(name);
    parent.addChild(node);
    node.addComponent(UITransform).setContentSize(width, height);
    return node;
  }

  /** 仅用于命中/未命中的短暂浮字，固定 HUD 文本都来自场景节点。 */
  private createLabel(parent: Node, text: string, fontSize: number, textColor: Color): Label {
    const node = this.createNode(`${text}Label`, parent, 420, 70);
    const label = node.addComponent(Label);
    label.string = text;
    label.fontSize = fontSize;
    label.lineHeight = Math.round(fontSize * 1.25);
    label.color = textColor;
    label.horizontalAlign = HorizontalTextAlignment.CENTER;
    label.verticalAlign = VerticalTextAlignment.CENTER;
    label.overflow = Label.Overflow.SHRINK;
    label.enableWrapText = false;
    return label;
  }

  private seededUnit(seed: number): number {
    const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
    return value - Math.floor(value);
  }

  private lerp(start: number, end: number, amount: number): number {
    return start + (end - start) * amount;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }
}
