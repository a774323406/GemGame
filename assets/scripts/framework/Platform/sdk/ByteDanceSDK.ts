import { http } from "./HttpRequest";
import { BaseSDK, GameShareOptions } from "./BaseSDK";
import { GlobalTool } from "./GlobalTool";
import { View } from "cc";

// 字节跳动/抖音小游戏 SDK
export class ByteDanceSDK extends BaseSDK {
  TAG = `ByteDanceSDK`;
  public isInited = false;
  isLogined = false;
  adUnitId = "uents1cnry199hsspu"; // 激励广告 ID
  interstitialAdUnitId = "7b1ol0m16t715dq06m";

  ver = "1.0.0";

  log(...args: any[]) {
    console.log(this.TAG, ...args);
  }

  error(...args: any[]) {
    console.error(this.TAG, ...args);
  }

  warn(...args: any[]) {
    console.warn(this.TAG, ...args);
  }

  _sdk: any = null;

  get sdk(): any {
    return tt;
  }

  init(cb?: Function) {
    // if (!this.sdk) {
    //   this.error("cannot found sdk interface!");
    //   return;
    // }
    // const config = {
    //   appCchId: this.appCchId, // 聚量包id
    //   cchid: this.cchid, // 聚量渠道id
    //   appid: this.appid, // 聚量应用id
    //   appkey: this.appkey, // 聚量应用key
    //   pkgName: this.pkgName, // 包名
    // };
    // this.log("ver", this.ver);
    // this.log("init sdk", this, config);
    // this.sdk?.onInit({
    //   config: config,
    //   success: (data) => {
    //     this.log("init success", data);
    //     this.isInited = true;
    //     this.login();
    //   },
    //   fail: (err) => {
    //     this.log("init failed", err);
    //   },
    // });
  }

  private loginFD = null;
  login(cb?: Function) {
    // this.log("login");
    // if (this.loginFD) {
    //   clearTimeout(this.loginFD);
    //   this.loginFD = null;
    // }
    // this.sdk?.onLogin({
    //   success: (data) => {
    //     this.log("login success", data);
    //     this.log("loginToken", data.loginToken);
    //     this.verifyLogin(data.loginToken);
    //     GlobalTool.isAdUser = this.sdk.isAdUser();
    //     this.log("GlobalTool.isAdUser", GlobalTool.isAdUser);
    //     this.onLoginFinished();
    //     cb && cb();
    //   },
    //   fail: (err) => {
    //     this.log("login failed", err);
    //     this.loginFD = setTimeout(() => {
    //       this.loginFD = null;
    //       this.login(cb);
    //     }, 1000);
    //   },
    // });
  }

  verifyLogin(token: string) {
    // let parameters: any = {
    //   tm: Math.floor(new Date().getTime() / 1000),
    //   app_cch_id: this.appCchId,
    //   cchid: this.cchid,
    //   appid: this.appid,
    //   access_token: token,
    // };
    // let sign = "SignUtil.sign(parameters, this.signKey);";
    // parameters.sign = sign;
    // // let url = "https://channel.bmt.youxiangshou.com/user/v1/token/verify";
    // let url = this.verifyUrl;
    // this.log("verifyLogin", parameters);
    // let fnOnComplete = (jsonData: any) => {
    //   this.log("verifyLogin complete", jsonData);
    //   if (jsonData.code == 200) {
    //     this.isLogined = true;
    //     // HomePage.instance?.checkStart();
    //   } else {
    //   }
    // };
    // let fnOnError = (response: any) => {
    //   this.log("verifyLogin error", response);
    //   this.error(response);
    // };
    // http.post(url, parameters, fnOnComplete, fnOnError);
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

  private rewardedVideoResultDispatched: boolean = false;

  showADVideo(cb?: Function, failCB?: Function, shownCB?: Function) {
    this.log("showADVideo start");
    this.videFinishCB = cb;
    this.videCanelCB = failCB;
    this.rewardedVideoResultDispatched = false;
    GlobalTool.isPlayingAD = true;
    let shownDispatched = false;
    const notifyShown = () => {
      if (shownDispatched) return;
      shownDispatched = true;
      shownCB && shownCB();
    };

    if (typeof tt === "undefined" || !tt.createRewardedVideoAd) {
      this.warn("tt.createRewardedVideoAd unavailable");
      this.finishRewardedVideo(false);
      return;
    }

    const videoAd = tt.createRewardedVideoAd({
      adUnitId: this.adUnitId,
    });

    videoAd.onLoad(() => {
      try {
        const showResult = videoAd.show();
        if (showResult?.then) {
          showResult
            .then(() => notifyShown())
            .catch((err) => {
              this.warn("rewarded video show failed", err);
              this.finishRewardedVideo(false);
            });
        } else {
          notifyShown();
        }
      } catch (err) {
        this.warn("rewarded video show failed", err);
        this.finishRewardedVideo(false);
      }
    });

    videoAd.onError?.((err) => {
      this.warn("rewarded video error", err);
      this.finishRewardedVideo(false);
    });

    const loadResult = videoAd.load();
    loadResult?.catch?.((err) => {
      this.warn("rewarded video load failed", err);
      this.finishRewardedVideo(false);
    });

    videoAd.onClose((res) => {
      // 兼容旧基础库：关闭回调没有 res 时按完整观看处理。
      this.finishRewardedVideo(res === undefined || !!res?.isEnded);
    });
  }

  private finishRewardedVideo(isEnded: boolean) {
    if (this.rewardedVideoResultDispatched) {
      return;
    }

    this.rewardedVideoResultDispatched = true;
    GlobalTool.isPlayingAD = false;
    GlobalTool.setWatchADTime();
    this.setBrightness(1);

    if (isEnded) {
      this.onVideoFinished();
      return;
    }

    this.onVideCanceled();
  }
  setBrightness(val: number) {
    //@ts-ignore
    /*window.qg.setScreenBrightness({
            value: val,
            success: function (res) { },
            fail: function (res) { },
            complete: function (res) { },
        });*/
  }

  private interstitialAd: any = null;

  showInterstitialAd(closeCB?: Function, failCB?: Function, shownCB?: Function) {
    if (typeof tt === "undefined" || typeof tt.createInterstitialAd !== "function") {
      this.warn("tt.createInterstitialAd unavailable");
      failCB && failCB(new Error("tt.createInterstitialAd unavailable"));
      return;
    }

    if (this.interstitialAd) {
      this.warn("interstitial ad is already loading or showing");
      failCB && failCB(new Error("interstitial ad is busy"));
      return;
    }

    const ad = tt.createInterstitialAd({
      adUnitId: this.interstitialAdUnitId,
    });
    this.interstitialAd = ad;

    let finished = false;
    let shown = false;
    let loadTimeout: ReturnType<typeof setTimeout> | null = null;
    const cleanup = () => {
      if (loadTimeout) {
        clearTimeout(loadTimeout);
        loadTimeout = null;
      }
      if (this.interstitialAd === ad) this.interstitialAd = null;
      try {
        ad.destroy?.();
      } catch {
        // 原生广告已自动回收时无需再处理。
      }
    };
    const fail = (err?: unknown) => {
      if (finished) return;
      finished = true;
      this.warn("interstitial load/show failed", err);
      cleanup();
      failCB && failCB(err);
    };
    const show = () => {
      if (finished || shown || this.interstitialAd !== ad) return;
      shown = true;
      try {
        const showResult = ad.show?.();
        if (showResult?.then) {
          showResult
            .then(() => {
              if (loadTimeout) {
                clearTimeout(loadTimeout);
                loadTimeout = null;
              }
              shownCB && shownCB();
            })
            .catch((err: unknown) => fail(err));
        } else {
          if (loadTimeout) {
            clearTimeout(loadTimeout);
            loadTimeout = null;
          }
          shownCB && shownCB();
        }
      } catch (err) {
        fail(err);
      }
    };

    ad.onError?.((err: unknown) => fail(err));
    ad.onLoad?.(show);
    ad.onClose?.(() => {
      if (finished) return;
      finished = true;
      cleanup();
      closeCB && closeCB();
    });
    loadTimeout = setTimeout(() => fail(new Error("interstitial load timeout")), 15_000);

    try {
      if (typeof ad.load === "function") {
        const loadResult = ad.load();
        if (loadResult?.then) {
          loadResult.then(show).catch((err: unknown) => fail(err));
        }
      } else {
        show();
      }
    } catch (err) {
      fail(err);
    }
  }

  private curCustomId: any = null;
  /** 原生模板 */
  showADTemplate() {
    // if (this.curCustomId) {
    //     this.destroyADTemplate();
    // }

    const size = View.instance.getVisibleSize();
    let top = size.height / 2;
    this.log("showADTemplate", top);
    this.sdk?.showAdvert({
      type: 5,
      config: {
        top: top + 150,
        width: 300,
      },
      success: (res) => {
        this.log("customId", res.customId);
        this.curCustomId = res.customId;
      },
      fail: (err) => {},
      onHide: () => {
        this.log("showADTemplate onHide");
        this.destroyADTemplate();
        this.setBrightness(1);
      },
    });
  }

  destroyADTemplate() {
    this.sdk?.destroyAdvert({
      type: 5,
      customId: this.curCustomId,
    });
    this.curCustomId = null;
  }

  report(tag: string, params: any) {
    this.log("report", tag, params);
    let args = { tag: tag, param: params };
    this.sdk?.onCltLog(args); //上报
  }

  share(options: GameShareOptions = {}, successCB?: Function, failCB?: Function) {
    const api = typeof tt !== "undefined" ? tt : null;
    if (typeof api?.shareAppMessage !== "function") {
      const err = new Error("tt.shareAppMessage unavailable");
      this.warn(err.message);
      failCB && failCB(err);
      return;
    }

    let finished = false;
    const finish = (success: boolean, payload?: unknown) => {
      if (finished) return;
      finished = true;
      if (success) {
        this.log("share success", payload);
        successCB && successCB(payload);
      } else {
        this.warn("share failed", payload);
        failCB && failCB(payload);
      }
    };

    const payload: Record<string, any> = {
      channel: options.channel ?? "invite",
      success: (res: unknown) => finish(true, res),
      fail: (err: unknown) => finish(false, err),
    };
    if (options.templateId) payload.templateId = options.templateId;
    if (options.query) payload.query = options.query;
    if (options.title) payload.title = options.title;
    if (options.desc) payload.desc = options.desc;

    try {
      api.shareAppMessage(payload);
    } catch (err) {
      finish(false, err);
    }
  }

  checkShortcut() {
    this.log("checkShortcut start");
    //@ts-ignore
    this.sdk?.onAddShortcut({
      success: () => {
        this.log("add shortcut success");
      },
      fail: (err) => {
        this.log("add shortcut fail");
      },
    });
    this.log("checkShortcut end");
  }
}
