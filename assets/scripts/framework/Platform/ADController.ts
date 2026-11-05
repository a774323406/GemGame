import { director, Director, game, Game, Node, Scene } from "cc";
import { GameConfig } from "../../GameConfig";
import { GameSceneBundle, GameSceneName } from "../GameSceneBundle";
import { FeedAcquisitionService } from "./FeedAcquisitionService";
import { SdkUtils } from "./sdk/SdkUtils";

export type LevelResultKind = "pass" | "fail";
export interface LevelResultAdOptions {
  eligible?: boolean;
  isStillValid?: () => boolean;
}

/**
 * 所有入口共用一个广告时钟。只管理“何时请求”，不暂停引擎、不操作按钮或触摸。
 * 大厅、加载和推荐流预览不弹；玩法就绪后，游戏中及结算页均可不限次数展示。
 */
export class ADController {
  private static readonly FIRST_DELAY_MS = 31_000;
  private static readonly FEED_ENTER_DELAY_MS = 2_000;
  private static readonly INTERVAL_MS = 60_000;

  private readonly appStartedAt = Date.now();
  private initialized = false;
  private appHidden = false;
  private sceneReadyAt = 0;
  private generation = 0;
  private feedEnteredAt: number | null = null;
  private feedKey = "";
  private feedValidity: (() => boolean) | null = null;
  private lastFullscreenAdEndedAt: number | null = null;
  private retryAt = 0;
  private gameplayScene: Scene | null = null;
  private requestPending = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  public initialize(): void {
    if (this.initialized) return;
    this.initialized = true;
    game.on(Game.EVENT_HIDE, this.onGameHide, this);
    game.on(Game.EVENT_SHOW, this.onGameShow, this);
    director.on(Director.EVENT_AFTER_SCENE_LAUNCH, this.onSceneLaunched, this);
    director.on(SdkUtils.EVENT_AD_PAUSE_CHANGED, this.onRewardedPauseChanged, this);
    director.on(SdkUtils.EVENT_INTERSTITIAL_ENDED, this.onFullscreenAdEnded, this);
    this.wake();
  }

  /** 保留结算页入口，但不另开一个计时器，也不把全局广告限定在结果页。 */
  public onLevelResult(_level: number, _kind: LevelResultKind, _options: LevelResultAdOptions = {}): void {
    this.initialize();
    this.wake();
  }

  /** 由玩法在资源和初始画面准备完成后调用；过期场景回调不能解锁新场景。 */
  public onEnterGame(owner?: Node): void {
    this.initialize();
    const scene = director.getScene();
    if (!owner?.isValid || !scene || owner.scene !== scene || scene.name === GameSceneName.Main) return;
    this.gameplayScene = scene;
    this.wake();
  }

  /** 场景的 feedEnter 回调只唤醒全局检查，重复通知不会重置冷却。 */
  public scheduleFeedEntryInterstitial(isStillValid?: () => boolean): void {
    this.initialize();
    this.feedValidity = isStillValid ?? null;
    this.observeFeedState();
    this.wake();
  }

  /** 使当前加载中的请求失效，不关闭整个应用的重复广告时钟。 */
  public cancelFeedEntryInterstitial(): void {
    ++this.generation;
    this.feedValidity = null;
    this.feedEnteredAt = null;
    if (this.initialized) this.wake();
  }

  private observeFeedState(): void {
    // FeedService.completeSession 会清空监听者，所以这里读取当前状态，不挂永久监听。
    const feed = FeedAcquisitionService.getState();
    const key = `${feed.mode}:${feed.contentId}`;
    if (!feed.active || !feed.entered || feed.exited) {
      if (this.feedEnteredAt !== null) ++this.generation;
      this.feedEnteredAt = null;
    } else if (this.feedEnteredAt === null || this.feedKey !== key) {
      this.feedEnteredAt = Date.now();
      ++this.generation;
    }
    this.feedKey = key;
  }

  private nextAllowedAt(): number {
    return Math.max(
      this.appStartedAt + ADController.FIRST_DELAY_MS,
      this.sceneReadyAt,
      this.feedEnteredAt === null ? 0 : this.feedEnteredAt + ADController.FEED_ENTER_DELAY_MS,
      this.lastFullscreenAdEndedAt === null ? 0 : this.lastFullscreenAdEndedAt + ADController.INTERVAL_MS,
      this.retryAt,
    );
  }

  private canRequestHere(): boolean {
    this.observeFeedState();
    const scene = director.getScene();
    const feed = FeedAcquisitionService.getState();
    if (!GameConfig.showAd || this.appHidden || GameSceneBundle.isLoadingScene) return false;
    if (!scene || !scene.isValid || scene.name === GameSceneName.Main || scene !== this.gameplayScene ||
      !Object.keys(GameSceneName).some(key => GameSceneName[key] === scene.name)) return false;
    if (feed.active && (!feed.sceneReadyReported || !feed.entered || feed.exited ||
      (this.feedValidity && !this.feedValidity()))) return false;
    return Date.now() >= this.nextAllowedAt();
  }

  private clearTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private wake(delay = 250): void {
    this.clearTimer();
    if (!this.initialized || this.appHidden || this.requestPending) return;
    this.timer = setTimeout(() => this.tick(), Math.max(1, delay));
  }

  private tick(): void {
    this.timer = null;
    if (this.appHidden || this.requestPending) return;
    if (!this.canRequestHere() || SdkUtils.isFullscreenAdBusy()) {
      // 未到期/不在合适的前台场景时只检查状态，不请求广告。
      this.wake(Math.min(1_000, Math.max(250, this.nextAllowedAt() - Date.now())));
      return;
    }

    const scene = director.getScene();
    const generation = this.generation;
    this.requestPending = true;
    let shown = false;
    let finished = false;
    const canShow = () => this.canRequestHere() &&
      generation === this.generation && scene === director.getScene();
    const finish = () => {
      if (finished) return;
      finished = true;
      this.requestPending = false;
      if (shown) {
        this.lastFullscreenAdEndedAt = Date.now();
        this.retryAt = 0;
      } else {
        // 失败或加载中失效都等待完整间隔，切场景/切后台不能绕过重试冷却。
        this.retryAt = Date.now() + ADController.INTERVAL_MS;
      }
      this.wake();
    };
    console.log("[ADController] 插屏间隔已到，尝试展示", scene.name);
    const started = SdkUtils.showInterstitialAd(finish, finish, () => { shown = true; }, canShow);
    if (!started) finish();
  }

  private onRewardedPauseChanged(active: boolean): void {
    // 激励沿用原有流程；插屏不再写入或订阅游戏暂停状态来控制玩法。
    if (!active) this.onFullscreenAdEnded();
  }

  private onFullscreenAdEnded(): void {
    this.lastFullscreenAdEndedAt = Date.now();
    this.retryAt = 0;
    this.wake();
  }

  private onSceneLaunched(): void {
    this.gameplayScene = null;
    ++this.generation;
    this.feedValidity = null;
    this.sceneReadyAt = Date.now() + 650;
    this.wake();
  }

  private onGameHide(): void {
    this.appHidden = true;
    ++this.generation;
    this.clearTimer();
  }

  private onGameShow(): void {
    this.appHidden = false;
    this.wake();
  }
}

export const adc = new ADController();
