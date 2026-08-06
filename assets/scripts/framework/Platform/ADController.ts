import { director, game, Game } from "cc";
import { GameConfig } from "../../GameConfig";
import { SdkUtils } from "./sdk/SdkUtils";

export type LevelResultKind = "pass" | "fail";

export interface LevelResultAdOptions {
  /** 推荐流直玩等特殊流程可禁止本次插屏。 */
  eligible?: boolean;
  /** 延迟期间玩家可能已离开结果页，触发前再确认一次。 */
  isStillValid?: () => boolean;
}

/**
 * 全局广告节奏管理。
 *
 * - Banner 全局只保留一份，全屏广告/切后台时自动销毁并恢复。
 * - 正常显示时 30 秒只做健康检查，不反复销毁刷新素材。
 * - 插屏在结果页或推荐流真实进入后触发，并统一遵守平台首屏与全屏广告间隔。
 */
export class ADController {
  private static readonly BANNER_HEALTH_CHECK_MS = 30_000;
  private static readonly BANNER_RETRY_MS = 30_000;
  private static readonly BANNER_USER_CLOSE_COOLDOWN_MS = 60_000;
  /** 抖音规定小游戏启动后的前 30 秒不能展示插屏，额外留 1 秒余量。 */
  private static readonly INTERSTITIAL_FIRST_SHOW_DELAY_MS = 31_000;
  /** 推荐流真正进入小游戏后稍作停顿，避免和平台转场动画同时弹出。 */
  private static readonly INTERSTITIAL_FEED_ENTER_DELAY_MS = 2_000;
  private static readonly INTERSTITIAL_RESULT_DELAY_MS = 650;
  private static readonly INTERSTITIAL_MIN_INTERVAL_MS = 60_000;

  /** adc 在脚本首次执行时就创建，可近似视为小游戏进程启动时间。 */
  private readonly appStartedAt = Date.now();
  private initialized = false;
  private appHidden = false;
  private fullscreenAdActive = false;

  private bannerSceneEnabled = false;
  private bannerRequestOwners = new Set<string>();
  private bannerDesired = false;
  private bannerCreating = false;
  private bannerVisible = false;
  private bannerGeneration = 0;
  private bannerRetryNotBefore = 0;
  private bannerUserClosedUntil = 0;
  private bannerTimer: ReturnType<typeof setTimeout> | null = null;

  private interstitialRequestPending = false;
  private frequencyWindowStartedAt = 0;
  private lastInterstitialShownAt = 0;
  private lastFullscreenAdEndedAt = 0;
  private feedInterstitialTimer: ReturnType<typeof setTimeout> | null = null;
  private feedInterstitialAttempt: (() => void) | null = null;
  private feedInterstitialGeneration = 0;

  public initialize() {
    if (this.initialized) return;
    this.initialized = true;
    this.frequencyWindowStartedAt = Date.now();

    game.on(Game.EVENT_HIDE, this.onGameHide, this);
    game.on(Game.EVENT_SHOW, this.onGameShow, this);
    director.on(SdkUtils.EVENT_AD_PAUSE_CHANGED, this.onFullscreenAdChanged, this);
  }

  /** 设置当前场景的 Banner 基础策略。主界面开启，玩法场景关闭。 */
  public setBannerEnabled(enabled: boolean) {
    this.initialize();
    this.bannerSceneEnabled = enabled;
    this.refreshBannerDesired();
  }

  /**
   * 弹窗临时申请 Banner。使用 owner 集合而不是直接覆盖场景策略，
   * 可正确处理复用弹窗、嵌套弹窗以及关闭动画期间的异步场景切换。
   */
  public setBannerRequested(owner: string, requested: boolean) {
    this.initialize();
    const normalizedOwner = String(owner || "").trim();
    if (!normalizedOwner) return;

    if (requested) {
      this.bannerRequestOwners.add(normalizedOwner);
    } else {
      this.bannerRequestOwners.delete(normalizedOwner);
    }
    this.refreshBannerDesired();
  }

  private refreshBannerDesired() {
    this.bannerDesired =
      GameConfig.showAd &&
      (this.bannerSceneEnabled || this.bannerRequestOwners.size > 0);

    if (!this.bannerDesired) {
      this.destroyCurrentBanner();
      this.clearBannerTimer();
      return;
    }

    this.ensureBanner();
  }

  /**
   * 结果面板已显示后上报。策略失效或广告加载失败时不会阻塞关卡流程。
   */
  public onLevelResult(level: number, kind: LevelResultKind, options: LevelResultAdOptions = {}) {
    this.initialize();

    const normalizedLevel = Math.max(1, Math.floor(Number(level) || 1));
    if (!GameConfig.showAd || options.eligible === false) return;
    if (this.interstitialRequestPending) return;

    if (SdkUtils.isFullscreenAdBusy()) return;
    const lastFullscreenAt = Math.max(
      this.frequencyWindowStartedAt,
      this.lastInterstitialShownAt,
      this.lastFullscreenAdEndedAt,
    );
    if (Date.now() - lastFullscreenAt < ADController.INTERSTITIAL_MIN_INTERVAL_MS) return;

    this.interstitialRequestPending = true;
    setTimeout(() => {
      if (!this.interstitialRequestPending) return;
      if (options.isStillValid && !options.isStillValid()) {
        this.interstitialRequestPending = false;
        return;
      }
      if (this.appHidden || SdkUtils.isFullscreenAdBusy()) {
        this.interstitialRequestPending = false;
        return;
      }
      const lastFullscreenAt = Math.max(
        this.frequencyWindowStartedAt,
        this.lastInterstitialShownAt,
        this.lastFullscreenAdEndedAt,
      );
      if (Date.now() - lastFullscreenAt < ADController.INTERSTITIAL_MIN_INTERVAL_MS) {
        this.interstitialRequestPending = false;
        return;
      }

      console.log(`[ADController] 尝试显示插屏: level=${normalizedLevel}, result=${kind}`);
      const started = SdkUtils.showInterstitialAd(
        () => {
          this.interstitialRequestPending = false;
        },
        () => {
          this.interstitialRequestPending = false;
        },
        () => {
          this.lastInterstitialShownAt = Date.now();
        },
      );

      if (!started) {
        this.interstitialRequestPending = false;
      }
    }, ADController.INTERSTITIAL_RESULT_DELAY_MS);
  }

  /**
   * 推荐流用户真正进入小游戏后安排一次插屏。
   *
   * start 阶段属于平台后台预启动，不能在那里直接调用广告 API；这里会同时等待：
   * 1. feedEnter 后 2 秒；
   * 2. 小游戏启动满 31 秒；
   * 3. 距离上一全屏广告至少 60 秒。
   */
  public scheduleFeedEntryInterstitial(isStillValid?: () => boolean) {
    this.initialize();
    this.cancelFeedEntryInterstitial();
    if (!GameConfig.showAd) return;

    const generation = ++this.feedInterstitialGeneration;
    const feedEnteredAt = Date.now();

    const attempt = () => {
      if (generation !== this.feedInterstitialGeneration) return;
      this.feedInterstitialTimer = null;
      if (isStillValid && !isStillValid()) {
        this.feedInterstitialAttempt = null;
        return;
      }

      // 后台不轮询；恢复前台后由 onGameShow 继续本次排队。
      if (this.appHidden) return;

      const now = Date.now();
      const nextAllowedAt = Math.max(
        feedEnteredAt + ADController.INTERSTITIAL_FEED_ENTER_DELAY_MS,
        this.appStartedAt + ADController.INTERSTITIAL_FIRST_SHOW_DELAY_MS,
        this.lastInterstitialShownAt + ADController.INTERSTITIAL_MIN_INTERVAL_MS,
        this.lastFullscreenAdEndedAt + ADController.INTERSTITIAL_MIN_INTERVAL_MS,
      );

      if (now < nextAllowedAt || this.interstitialRequestPending || SdkUtils.isFullscreenAdBusy()) {
        const retryDelay = now < nextAllowedAt ? nextAllowedAt - now : 1_000;
        this.feedInterstitialTimer = setTimeout(attempt, Math.max(250, retryDelay));
        return;
      }

      this.feedInterstitialAttempt = null;
      this.interstitialRequestPending = true;
      console.log("[ADController] 推荐流已真实进入，尝试显示插屏");
      const finish = () => {
        this.interstitialRequestPending = false;
      };
      const started = SdkUtils.showInterstitialAd(
        finish,
        finish,
        () => {
          this.lastInterstitialShownAt = Date.now();
        },
      );

      if (!started) finish();
    };

    const initialDelay = Math.max(
      ADController.INTERSTITIAL_FEED_ENTER_DELAY_MS,
      this.appStartedAt + ADController.INTERSTITIAL_FIRST_SHOW_DELAY_MS - Date.now(),
    );
    console.log(`[ADController] 推荐流插屏已排队，约 ${Math.ceil(initialDelay / 1000)} 秒后检查`);
    this.feedInterstitialAttempt = attempt;
    this.feedInterstitialTimer = setTimeout(attempt, Math.max(250, initialDelay));
  }

  /** 离开推荐流或销毁对应场景时，取消尚未发起的插屏请求。 */
  public cancelFeedEntryInterstitial() {
    ++this.feedInterstitialGeneration;
    this.feedInterstitialAttempt = null;
    if (!this.feedInterstitialTimer) return;
    clearTimeout(this.feedInterstitialTimer);
    this.feedInterstitialTimer = null;
  }

  /** 保留旧 SDK 登录回调入口，仅负责初始化监听。 */
  public onEnterGame() {
    this.initialize();
  }

  private ensureBanner() {
    if (!this.bannerDesired || this.appHidden || this.fullscreenAdActive) return;
    if (this.bannerCreating || this.bannerVisible) {
      this.scheduleBannerCheck(ADController.BANNER_HEALTH_CHECK_MS);
      return;
    }

    const now = Date.now();
    const nextAllowedAt = Math.max(this.bannerRetryNotBefore, this.bannerUserClosedUntil);
    if (now < nextAllowedAt) {
      this.scheduleBannerCheck(nextAllowedAt - now);
      return;
    }

    this.clearBannerTimer();
    this.bannerCreating = true;
    const generation = ++this.bannerGeneration;
    const started = SdkUtils.showADBanner(
      () => {
        if (generation !== this.bannerGeneration) return;
        this.bannerCreating = false;
        this.bannerVisible = true;
        this.bannerRetryNotBefore = 0;
        this.scheduleBannerCheck(ADController.BANNER_HEALTH_CHECK_MS);
      },
      () => {
        if (generation !== this.bannerGeneration) return;
        this.bannerCreating = false;
        this.bannerVisible = false;
        this.bannerRetryNotBefore = Date.now() + ADController.BANNER_RETRY_MS;
        SdkUtils.destroyADBanner();
        this.scheduleBannerCheck(ADController.BANNER_RETRY_MS);
      },
      () => {
        if (generation !== this.bannerGeneration) return;
        this.bannerCreating = false;
        this.bannerVisible = false;
        this.bannerUserClosedUntil = Date.now() + ADController.BANNER_USER_CLOSE_COOLDOWN_MS;
        SdkUtils.clearBannerInset();
        this.scheduleBannerCheck(ADController.BANNER_USER_CLOSE_COOLDOWN_MS);
      },
    );

    if (!started && generation === this.bannerGeneration) {
      this.bannerCreating = false;
    }
  }

  private destroyCurrentBanner() {
    ++this.bannerGeneration;
    this.bannerCreating = false;
    this.bannerVisible = false;
    SdkUtils.destroyADBanner();
  }

  private scheduleBannerCheck(delayMs: number) {
    if (!this.bannerDesired) return;
    this.clearBannerTimer();
    this.bannerTimer = setTimeout(() => {
      this.bannerTimer = null;
      this.ensureBanner();
    }, Math.max(250, delayMs));
  }

  private clearBannerTimer() {
    if (!this.bannerTimer) return;
    clearTimeout(this.bannerTimer);
    this.bannerTimer = null;
  }

  private onFullscreenAdChanged(active: boolean) {
    this.fullscreenAdActive = active;
    if (active) {
      this.destroyCurrentBanner();
      this.clearBannerTimer();
      return;
    }
    this.lastFullscreenAdEndedAt = Date.now();
    this.ensureBanner();
  }

  private onGameHide() {
    this.appHidden = true;
    this.destroyCurrentBanner();
    this.clearBannerTimer();
  }

  private onGameShow() {
    this.appHidden = false;
    if (this.feedInterstitialAttempt && !this.feedInterstitialTimer) {
      this.feedInterstitialTimer = setTimeout(this.feedInterstitialAttempt, 250);
    }
    this.ensureBanner();
  }
}

export const adc = new ADController();
