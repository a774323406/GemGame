import { http } from "./HttpRequest";
import { BaseSDK } from "./BaseSDK";
import { GlobalTool } from "./GlobalTool";
import { View } from "cc";

export class WeChatSDK extends BaseSDK {
  TAG = `WeChatSDK`;

  private readonly shareTitle: string = "快来一起玩吧";

  ver = "1.0.0";
  videoAdUnitId = "adunit-58cb1165d95e45cc";
  bannerAdUnitId = "";
  InterstitialAdUnitId = "adunit-94155ebc0d5844f0";
  customAdUnitId = "adunit-75d8ceca9c1cedd4";
  log(...args: any[]) {
    console.log(this.TAG, ...args);
  }

  error(...args: any[]) {
    console.error(this.TAG, ...args);
  }

  warn(...args: any[]) {
    console.warn(this.TAG, ...args);
  }

  private videFinishCB: Function = null;
  onVideoFinished() {
    this.videFinishCB && this.videFinishCB();
    this.videFinishCB = null;
  }
  private videCanelCB: Function = null;
  onVideCanceled() {
    this.videCanelCB && this.videCanelCB();
    this.videCanelCB = null;
  }
  rewardedVideoAd: any = null;
  private rewardedVideoResultDispatched: boolean = false;
  showADVideo(cb?: Function, failCB?: Function) {
    this.log("showADVideo start1111");
    this.videFinishCB = cb;
    this.videCanelCB = failCB;
    this.rewardedVideoResultDispatched = false;

    if (typeof wx === "undefined" || !wx.createRewardedVideoAd) {
      this.warn("wx.createRewardedVideoAd unavailable");
      this.finishRewardedVideo(false);
      return;
    }

    GlobalTool.isPlayingAD = true;

    if (!this.rewardedVideoAd) {
      this.rewardedVideoAd = wx.createRewardedVideoAd({
        adUnitId: this.videoAdUnitId,
      });

      this.rewardedVideoAd.onClose((res) => {
        // 小于 2.1.0 的基础库版本，res 是 undefined，也按完整观看处理。
        this.finishRewardedVideo((res && res.isEnded) || res === undefined);
      });

      this.rewardedVideoAd.onError((err) => {
        this.warn("rewarded video error", err);
        this.finishRewardedVideo(false);
      });
    }

    this.rewardedVideoAd
      .load()
      .then(() => this.rewardedVideoAd.show())
      .catch((err) => {
        this.warn("rewarded video load/show failed", err);
        this.finishRewardedVideo(false);
      });

    //   success: () => {
    //     this.log("showADVideo success");
    //     GlobalTool.isPlayingAD = false;
    //     GlobalTool.setWatchADTime();
    //     this.onVideoFinished();

    //     this.setBrightness(1);
    //   },
    //   fail: (err) => {
    //     this.log("showADVideo fail");
    //     GlobalTool.isPlayingAD = false;
    //     GlobalTool.setWatchADTime();
    //     this.onVideCanceled();

    //     this.setBrightness(1);
    //   },
    // });
  }

  private finishRewardedVideo(isEnded: boolean) {
    if (this.rewardedVideoResultDispatched) {
      return;
    }

    this.rewardedVideoResultDispatched = true;
    GlobalTool.isPlayingAD = false;
    GlobalTool.setWatchADTime();
    this.setBrightness(1);

    // 微信广告关闭后原生 view 还会回收一小段时间，延后再改 Cocos UI，避免 TextView parent not found。
    setTimeout(() => {
      if (isEnded) {
        this.onVideoFinished();
        return;
      }

      this.onVideCanceled();
    }, 120);
  }
  bannerAd: any = null;
  showADBanner(callback?: Function) {
    if (!this.bannerAd) {
      this.bannerAd = wx.createBannerAd({
        adUnitId: this.bannerAdUnitId,
        style: {
          left: 10,
          top: 76,
          width: 320,
        },
      });
    }

    this.bannerAd.onLoad(() => {
      console.log("banner 广告加载成功");
      this.bannerAd.show().then(() => console.log("banner 广告显示"));
    });
  }

  destroyADBanner() {
    this.bannerAd?.destroy();
    this.bannerAd = wx.createBannerAd({
      adUnitId: this.bannerAdUnitId,
      style: {
        left: 10,
        top: 76,
        width: 320,
      },
    });
  }

  interstitialAd: any = null;
  showInterstitialAd(callback?: Function) {
    if (!this.interstitialAd) {
      this.interstitialAd = wx.createInterstitialAd({
        adUnitId: this.InterstitialAdUnitId,
      });
    }
    this.interstitialAd.onError((err) => {
      console.log(err);
    });
    this.interstitialAd.onLoad(() => {
      console.log("interstitial 广告加载成功");
      this.interstitialAd.show().then(() => console.log("interstitial 广告显示"));
    });
    this.interstitialAd.onClose(() => {
      console.log("interstitial 广告关闭");
      callback && callback();
    });
  }
  /** 原生模板 */
  customAd: any = null;
  showADTemplate() {
    this.customAd = wx.createCustomAd({
      adUnitId: this.customAdUnitId,
      style: {
        left: 10,
        top: 76,
        width: 375, // 用于设置组件宽度，只有部分模板才支持，如矩阵格子模板
        fixed: true, // fixed 只适用于小程序环境
      },
    });
    this.customAd.onError((err) => console.log(err));
    this.customAd.onLoad(() => console.log("原生模板广告加载成功"));

    this.customAd.show().then(() => console.log("原生模板广告显示"));
    this.customAd.onClose(() => console.log("原生模板广告关闭"));
  }
  destroyADTemplate() {
    this.customAd.hide();
  }

  report(tag: string, params: any = {}) {
    this.log("report", tag, params);

    if (typeof wx === "undefined") {
      this.warn("wx is undefined, report ignored", tag, params);
      return;
    }

    if (!wx.reportEvent) {
      this.warn("wx.reportEvent unavailable", tag, params);
      return;
    }

    try {
      wx.reportEvent(tag, params || {});
    } catch (err) {
      this.warn("wx.reportEvent failed", tag, params, err);
    }
  }

  checkShortcut() {
    // this.log("checkShortcut start");
    // //@ts-ignore
    // this.sdk?.onAddShortcut({
    //   success: () => {
    //     this.log("add shortcut success");
    //   },
    //   fail: (err) => {
    //     this.log("add shortcut fail");
    //   },
    // });
    // this.log("checkShortcut end");
  }

  share() {
    console.log("微信share");

    // if (typeof wx === "undefined" || !wx.shareAppMessage) {
    //   this.warn("wx.shareAppMessage unavailable");
    //   return;
    // }

    // try {
    //   wx.shareAppMessage({
    //     title: this.shareTitle,
    //     imageUrl: this.shareImageUrl,
    //   });
    // } catch (err) {
    //   this.warn("wx.shareAppMessage failed", err);
    // }
  }

  vibrateShort() {
    wx.vibrateShort();
  }
  vibrateLong() {
    wx.vibrateLong();
  }
}
