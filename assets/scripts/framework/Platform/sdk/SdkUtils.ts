/*
 * @author: wch
 */
import { director, Director } from "cc";
import { BaseSDK } from "./BaseSDK";
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

export class SdkUtils {
  static readonly EVENT_AD_PAUSE_CHANGED = "sdk_rewarded_video_pause_changed";
  static sdk: BaseSDK = null;
  private static adPauseCount: number = 0;
  private static pauseBeforeAd: boolean = false;
  private static rewardedVideoBusy: boolean = false;
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
    if (SdkUtils.rewardedVideoBusy) {
      console.warn("[SdkUtils] 激励视频正在加载或播放，本次重复请求已忽略");
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

    // 先让遮罩完整渲染一帧，再拉起抖音原生广告。
    director.once(Director.EVENT_END_FRAME, () => {
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
    });

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

  static showADBanner(callback?: Function) {
    SdkUtils.sdk.showADBanner(callback);
  }

  static destroyADBanner() {
    SdkUtils.sdk.destroyADBanner();
  }

  /** 原生模板 */
  static showADTemplate() {
    SdkUtils.sdk.showADTemplate();
  }
  static showInterstitialAd(hideCb?: Function) {
    SdkUtils.sdk.showInterstitialAd(hideCb);
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
  static share() {
    if (!SdkUtils.sdk) {
      SdkUtils.requireSDK();
    }

    SdkUtils.sdk.share();
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
    director.emit(SdkUtils.EVENT_AD_PAUSE_CHANGED, false);
    AudioManager.resumeBgmAfterVideo();
    AudioManager.resumeLoopEffect();
  }
}
