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
 * - 插屏只在结果页触发：距上次全屏广告至少 60 秒后，通关或失败都可展示。
 */
export class ADController {
  private static readonly BANNER_HEALTH_CHECK_MS = 30_000;
  private static readonly BANNER_RETRY_MS = 30_000;
  private static readonly BANNER_USER_CLOSE_COOLDOWN_MS = 60_000;
  private static readonly INTERSTITIAL_RESULT_DELAY_MS = 650;
  private static readonly INTERSTITIAL_MIN_INTERVAL_MS = 60_000;

  private initialized = false;
  private appHidden = false;
  private fullscreenAdActive = false;

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

  public initialize() {
    if (this.initialized) return;
    this.initialized = true;
    this.frequencyWindowStartedAt = Date.now();

    game.on(Game.EVENT_HIDE, this.onGameHide, this);
    game.on(Game.EVENT_SHOW, this.onGameShow, this);
    director.on(SdkUtils.EVENT_AD_PAUSE_CHANGED, this.onFullscreenAdChanged, this);
  }

  /** 进入主界面/普通关卡时开启，推荐流直玩时可关闭。 */
  public setBannerEnabled(enabled: boolean) {
    this.initialize();
    this.bannerDesired = enabled && GameConfig.showAd;

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
    this.ensureBanner();
  }
}

export const adc = new ADController();
