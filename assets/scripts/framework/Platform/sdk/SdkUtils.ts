/*
 * @author: wch
 */
import { Component, director } from "cc";
import { BaseSDK, GameShareOptions } from "./BaseSDK";
import { ByteDanceSDK } from "./ByteDanceSDK";
import { EnvTool } from "./EnvTool";
import { SDKNotify } from "./SdkNotify";
import { VivoSDK } from "./VivoSDK";
import { WeChatSDK } from "./WeChatSDK";
import AudioManager from "../../AudioManager";
import PlayData from "../../../data/PlayData";
import gameStorage from "../../gameStorage";
import { GameConfig } from "../../../GameConfig";
import { adLoadPanel } from "../../../ui/adLoadPanel";
import { GlobalTool } from "./GlobalTool";

/** 以当前玩法归因，避免从推荐流返回主页后仍沿用启动时的 Content_ID。 */
const AD_FEED_TYPES: Readonly<Record<string, string>> = {
  NewMainScene: "玩法大厅",
  GameScene: "拼豆排序",
  ShootingGlassBottlesGame: "打瓶子",
  JuggleBallGameScene: "乒乓球第一关",
  PenguinStackFeedGameScene: "企鹅叠叠乐",
  FoodDeliveryFeedGameScene: "外卖精准投送",
  WhiteGooseFeedGameScene: "套大鹅",
  RhythmCatFeedGameScene: "节奏猫咪",
  MathExamFeedGameScene: "口算大挑战",
  MotoRaceGameScene: "狂暴摩托",
};

export class SdkUtils {
  static readonly EVENT_AD_PAUSE_CHANGED = "sdk_rewarded_video_pause_changed";
  static readonly EVENT_INTERSTITIAL_ENDED = "sdk_interstitial_ended";
  static sdk: BaseSDK = null;
  private static adPauseCount: number = 0;
  private static pauseBeforeAd: boolean = false;
  private static rewardedVideoBusy: boolean = false;
  private static interstitialBusy: boolean = false;
  private static shareBusy: boolean = false;
  static isSDKEnvironment(): boolean {
    return !!this.sdk && this.sdk.constructor !== BaseSDK;
  }
  static requireSDK() {
    if (EnvTool.isWeChat()) {
      console.log("WeChat MiniGame detected, using WeChatSDK");
      SdkUtils.sdk = new WeChatSDK();
    } else if (EnvTool.isByteDanceMiniGame()) {
      console.log("ByteDance MiniGame detected, using ByteDanceSDK");
      SdkUtils.sdk = new ByteDanceSDK();
    } else if (EnvTool.isVivoMiniGame()) {
      console.log("Vivo MiniGame detected, using VivoSDK");
      SdkUtils.sdk = new VivoSDK();
    } else if (EnvTool.isOppoMiniGame()) {
      console.warn("Oppo MiniGame detected, but OppoSDK is not implemented. Fallback to BaseSDK mock.");
      // SdkUtils.sdk = new OppoSDK();
    } else if (EnvTool.isNative()) {
      console.warn("Native environment detected, but native SDK is not implemented. Fallback to BaseSDK mock.");
      // SdkUtils.sdk = new UnionSdk();
    }

    if (SdkUtils.sdk == null) {
      console.log("Editor/Web or unsupported channel detected, using BaseSDK mock.");
      SdkUtils.sdk = new BaseSDK();
    }
  }

  static init(cb?: Function) {
    SdkUtils.sdk.init(cb);
  }

  static isLogined() {
    return SdkUtils.sdk.isLogined;
  }

  static login(cb?: Function) {
    SdkUtils.sdk.login(cb);
  }
  static showADVideo(cb?: Function, failCB?: Function): boolean {
    if (!SdkUtils.sdk) {
      SdkUtils.requireSDK();
    }
    if (!GameConfig.showAd) {
      cb && cb();
      return true;
    }
    // 记录点击意图，不等待展示或看完；Promise 包装入口不再重复上报。
    SdkUtils.reportAdAnalytics("adType", SdkUtils.getAdAnalyticsFeedType());
    if (SdkUtils.isFullscreenAdBusy()) {
      console.warn("[SdkUtils] 全屏广告正在加载或播放，本次激励视频请求已忽略");
      failCB && failCB();
      return false;
    }

    SdkUtils.rewardedVideoBusy = true;
    SdkUtils.enterAdPause();
    adLoadPanel.show();

    let finished = false;
    let adShown = false;
    const onAdShown = () => {
      if (adShown) return;
      adShown = true;
      adLoadPanel.hide();
    };
    const finish = (callback?: Function) => {
      if (finished) {
        return;
      }

      finished = true;
      SdkUtils.rewardedVideoBusy = false;
      adLoadPanel.hide();
      SdkUtils.leaveAdPause();
      callback && callback();
    };

    // 必须在按钮的真实点击调用栈内开始请求。推荐流容器对用户手势更敏感，
    // 延迟到下一帧可能失去手势上下文；广告异步 load 期间转圈遮罩仍会正常渲染。
    try {
      SdkUtils.sdk.showADVideo(
        () => finish(cb),
        () => finish(failCB),
        onAdShown,
      );
    } catch (err) {
      console.warn("[SdkUtils] showADVideo failed", err);
      finish(failCB);
    }

    return true;
  }

  /** Promise 版本：只有完整看完广告时才返回 true。 */
  static showRewardedVideo(): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const started = SdkUtils.showADVideo(
        () => resolve(true),
        () => resolve(false),
      );
      if (!started) resolve(false);
    });
  }

  static isRewardedVideoBusy(): boolean {
    return SdkUtils.rewardedVideoBusy;
  }

  static isInterstitialBusy(): boolean {
    return SdkUtils.interstitialBusy;
  }

  static isFullscreenAdBusy(): boolean {
    return SdkUtils.rewardedVideoBusy || SdkUtils.interstitialBusy || SdkUtils.shareBusy;
  }

  /** 原生模板 */
  static showADTemplate() {
    SdkUtils.sdk.showADTemplate();
  }
  /** 插屏只请求/展示原生广告，不改游戏暂停状态，也不添加遮罩或触摸拦截。 */
  static showInterstitialAd(closeCB?: Function, failCB?: Function, shownCB?: Function, canShow?: () => boolean): boolean {
    if (!SdkUtils.sdk) {
      SdkUtils.requireSDK();
    }
    if (!GameConfig.showAd) {
      return false;
    }
    if (SdkUtils.isFullscreenAdBusy()) {
      console.warn("[SdkUtils] 全屏广告正在加载或播放，本次插屏请求已忽略");
      failCB && failCB();
      return false;
    }

    SdkUtils.interstitialBusy = true;
    // 加载期间可能切场景或进入下一关，固定本次广告发起时的玩法名称。
    const feedType = SdkUtils.getAdAnalyticsFeedType();

    let finished = false;
    let adShown = false;
    const onAdShown = () => {
      if (finished || adShown) return;
      adShown = true;
      SdkUtils.reportAdAnalytics("interAdType", feedType);
      shownCB && shownCB();
    };
    const finish = (success: boolean, callback?: Function) => {
      if (finished) return;
      finished = true;
      SdkUtils.interstitialBusy = false;
      if (adShown) director.emit(SdkUtils.EVENT_INTERSTITIAL_ENDED);
      callback && callback(success);
    };

    try {
      SdkUtils.sdk.showInterstitialAd(
        () => finish(true, closeCB),
        () => finish(false, failCB),
        onAdShown,
        canShow,
      );
    } catch (err) {
      console.warn("[SdkUtils] showInterstitialAd failed", err);
      finish(false, failCB);
    }

    return true;
  }

  private static getAdAnalyticsFeedType(): string {
    try {
      const scene = director.getScene();
      if (scene?.name === "JuggleBallGameScene") {
        const juggle = scene.getComponentInChildren("juggleBallGameScene") as
          (Component & { readonly adAnalyticsFeedType?: string }) | null;
        return juggle?.adAnalyticsFeedType || AD_FEED_TYPES.JuggleBallGameScene;
      }
      return AD_FEED_TYPES[scene?.name] || scene?.name || "未知玩法";
    } catch (err) {
      console.warn("[SdkUtils] 读取广告打点玩法失败", err);
      return "未知玩法";
    }
  }

  private static reportAdAnalytics(eventName: "adType" | "interAdType", feedType: string): void {
    if (!EnvTool.isByteDanceMiniGame()) return;
    try {
      const api = typeof tt !== "undefined" ? tt : null;
      if (typeof api?.reportAnalytics !== "function") return;
      api.reportAnalytics(eventName, { feedType });
    } catch (err) {
      // 数据上报异常不能阻断广告播放、奖励发放或暂停状态恢复。
      console.warn(`[SdkUtils] 广告打点失败: ${eventName}`, err);
    }
  }

  static destroyADTemplate() {
    SdkUtils.sdk.destroyADTemplate();
  }

  static setBrightness(val: number) {
    SdkUtils.sdk.setBrightness(val);
  }

  static showYongHuXieYi() {
    SdkUtils.sdk.showYongHuXieYi();
  }

  static showYinSiZhengCe() {
    SdkUtils.sdk.showYinSiZhengCe();
  }

  static report(tag: string, params?: any) {
    SdkUtils.sdk.report(tag, params);
  }

  static onBackToLogin() {
    SDKNotify.onBacktoLogin();
  }

  static checkShortcut() {
    SdkUtils.sdk.checkShortcut();
  }
  static addShortcut() {
    SdkUtils.sdk.addShortcut();
  }
  static share(options: GameShareOptions = {}): Promise<boolean> {
    if (!SdkUtils.sdk) {
      SdkUtils.requireSDK();
    }
    if (SdkUtils.isFullscreenAdBusy()) {
      console.warn("[SdkUtils] 分享面板已经打开，本次请求已忽略");
      return Promise.resolve(false);
    }

    SdkUtils.shareBusy = true;
    return new Promise<boolean>((resolve) => {
      let finished = false;
      const finish = (success: boolean) => {
        if (finished) return;
        finished = true;
        SdkUtils.shareBusy = false;
        resolve(success);
      };

      try {
        SdkUtils.sdk.share(
          options,
          () => finish(true),
          () => finish(false),
        );
      } catch (err) {
        console.warn("[SdkUtils] share failed", err);
        finish(false);
      }
    });
  }

  static vibrateShort() {
    if (gameStorage.getzhendong() == 1) {
      return;
    }

    if (!SdkUtils.sdk) {
      SdkUtils.requireSDK();
    }

    SdkUtils.sdk.vibrateShort();
  }
  static vibrateLong() {
    if (gameStorage.getzhendong() == 1) {
      return;
    }

    if (!SdkUtils.sdk) {
      SdkUtils.requireSDK();
    }

    SdkUtils.sdk.vibrateLong();
  }

  private static enterAdPause() {
    if (SdkUtils.adPauseCount === 0) {
      SdkUtils.pauseBeforeAd = PlayData.Instance.ispause;
      PlayData.Instance.ispause = true;
      GlobalTool.isPlayingAD = true;
      director.emit(SdkUtils.EVENT_AD_PAUSE_CHANGED, true);
      AudioManager.pauseBgmForVideo();
      AudioManager.pauseLoopEffect();
    }

    SdkUtils.adPauseCount++;
  }

  private static leaveAdPause() {
    SdkUtils.adPauseCount = Math.max(0, SdkUtils.adPauseCount - 1);

    if (SdkUtils.adPauseCount > 0) {
      return;
    }

    PlayData.Instance.ispause = SdkUtils.pauseBeforeAd;
    GlobalTool.isPlayingAD = false;
    GlobalTool.setWatchADTime();
    director.emit(SdkUtils.EVENT_AD_PAUSE_CHANGED, false);
    AudioManager.resumeBgmAfterVideo();
    AudioManager.resumeLoopEffect();
  }

}
