/*
 * @author: wch
 */
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

export class SdkUtils {
  static sdk: BaseSDK = null;
  private static adPauseCount: number = 0;
  private static pauseBeforeAd: boolean = false;
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
  static showADVideo(cb?: Function, failCB?: Function) {
    if (!SdkUtils.sdk) {
      SdkUtils.requireSDK();
    }
    if (!GameConfig.showAd) {
      cb && cb();
      return;
    }
    SdkUtils.enterAdPause();

    let finished = false;
    const finish = (callback?: Function) => {
      if (finished) {
        return;
      }

      finished = true;
      SdkUtils.leaveAdPause();
      callback && callback();
    };

    try {
      SdkUtils.sdk.showADVideo(
        () => {
          finish(cb);
        },
        () => {
          finish(failCB);
        },
      );
    } catch (err) {
      console.warn("[SdkUtils] showADVideo failed", err);
      finish(failCB);
    }
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
      AudioManager.pauseBgmForVideo();
    }

    SdkUtils.adPauseCount++;
  }

  private static leaveAdPause() {
    SdkUtils.adPauseCount = Math.max(0, SdkUtils.adPauseCount - 1);

    if (SdkUtils.adPauseCount > 0) {
      return;
    }

    PlayData.Instance.ispause = SdkUtils.pauseBeforeAd;
    AudioManager.resumeBgmAfterVideo();
  }
}
