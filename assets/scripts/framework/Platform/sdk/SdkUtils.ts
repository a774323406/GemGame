/*
 * @author: wch
 */
import { director } from "cc";
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

export class SdkUtils {
  static readonly EVENT_AD_PAUSE_CHANGED = "sdk_rewarded_video_pause_changed";
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
  /** 插屏拉取阶段不遮挡或暂停游戏；仅在原生广告真正显示后暂停。 */
  static showInterstitialAd(closeCB?: Function, failCB?: Function, shownCB?: Function): boolean {
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

    let finished = false;
    let adShown = false;
    let adPauseEntered = false;
    const onAdShown = () => {
      if (finished || adShown) return;
      adShown = true;
      adPauseEntered = true;
      SdkUtils.enterAdPause();
      shownCB && shownCB();
    };
    const finish = (success: boolean, callback?: Function) => {
      if (finished) return;
      finished = true;
      SdkUtils.interstitialBusy = false;
      if (adPauseEntered) {
        adPauseEntered = false;
        SdkUtils.leaveAdPause();
      }
      callback && callback(success);
    };

    try {
      SdkUtils.sdk.showInterstitialAd(
        () => finish(true, closeCB),
        () => finish(false, failCB),
        onAdShown,
      );
    } catch (err) {
      console.warn("[SdkUtils] showInterstitialAd failed", err);
      finish(false, failCB);
    }

    return true;
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
