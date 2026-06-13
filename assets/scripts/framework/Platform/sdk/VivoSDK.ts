import { http } from "./HttpRequest";
import { BaseSDK } from "./BaseSDK";
import { GlobalTool } from "./GlobalTool";
import { View } from "cc";

export class VivoSDK extends BaseSDK {
  TAG = `VivoSDK`;
  public isInited = false;
  isLogined = false;

  appCchId = "4001212"; // 聚量包id
  cchid = "214"; // 聚量渠道id
  appid = "23932"; // 聚量应用id
  appkey = "8LJ4hql7Rp1cnNwi"; // 聚量应用key
  pkgName = "com.xst.msjj.vivominigame"; // 包名
  signKey = "8LJ4hql7Rp1cnNwi";
  verifyUrl = "https://channel.bmt.youxiangshou.com/user/v1/token/verify/";
  // 测试环境地址 "http://channel.bmt.gm825.net/user/v1/token/verify"

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
    if (!this._sdk) {
      this._sdk = window["SdkAdapter"];
    }
    return this._sdk;
  }

  init(cb?: Function) {
    if (!this.sdk) {
      this.error("cannot found sdk interface!");
      return;
    }

    const config = {
      appCchId: this.appCchId, // 聚量包id
      cchid: this.cchid, // 聚量渠道id
      appid: this.appid, // 聚量应用id
      appkey: this.appkey, // 聚量应用key
      pkgName: this.pkgName, // 包名
    };
    this.log("ver", this.ver);
    this.log("init sdk", this, config);
    this.sdk?.onInit({
      config: config,
      success: (data) => {
        this.log("init success", data);
        this.isInited = true;
        this.login(cb);
      },
      fail: (err) => {
        this.log("init failed", err);
      },
    });
  }

  private loginFD = null;
  login(cb?: Function) {
    this.log("login");
    if (this.loginFD) {
      clearTimeout(this.loginFD);
      this.loginFD = null;
    }
    this.sdk?.onLogin({
      success: (data) => {
        this.log("login success", data);
        this.log("loginToken", data.loginToken);
        this.verifyLogin(data.loginToken);

        GlobalTool.isAdUser = this.sdk.isAdUser();
        this.log("GlobalTool.isAdUser", GlobalTool.isAdUser);
        this.onLoginFinished();
        cb && cb();
      },
      fail: (err) => {
        this.log("login failed", err);
        this.loginFD = setTimeout(() => {
          this.loginFD = null;
          this.login(cb);
        }, 1000);
      },
    });
  }

  verifyLogin(token: string) {
    let parameters: any = {
      tm: Math.floor(new Date().getTime() / 1000),
      app_cch_id: this.appCchId,
      cchid: this.cchid,
      appid: this.appid,
      access_token: token,
    };
    let sign = "SignUtil.sign(parameters, this.signKey);";
    parameters.sign = sign;

    // let url = "https://channel.bmt.youxiangshou.com/user/v1/token/verify";
    let url = this.verifyUrl;
    this.log("verifyLogin", parameters);
    let fnOnComplete = (jsonData: any) => {
      this.log("verifyLogin complete", jsonData);
      if (jsonData.code == 200) {
        this.isLogined = true;
        // HomePage.instance?.checkStart();
      } else {
      }
    };
    let fnOnError = (response: any) => {
      this.log("verifyLogin error", response);
      this.error(response);
    };
    http.post(url, parameters, fnOnComplete, fnOnError);
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

  showADVideo(cb?: Function, failCB?: Function) {
    this.log("showADVideo start1111");
    this.videFinishCB = cb;
    this.videCanelCB = failCB;
    // 激励视频
    GlobalTool.isPlayingAD = true;
    this.sdk?.showAdvert({
      type: 2,
      success: () => {
        this.log("showADVideo success");
        GlobalTool.isPlayingAD = false;
        GlobalTool.setWatchADTime();
        this.onVideoFinished();

        this.setBrightness(1);
      },
      fail: (err) => {
        this.log("showADVideo fail");
        GlobalTool.isPlayingAD = false;
        GlobalTool.setWatchADTime();
        this.onVideCanceled();

        this.setBrightness(1);
      },
    });
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

  private curBannerId: any = null;
  showADBanner(callback?: Function) {
    // if (this.curBannerId) {
    //     this.destroyADBanner();
    // }
    this.sdk?.showAdvert({
      type: 3,
      // config: {
      //   top: 0,
      //   left: 0,
      //   width: 300,
      //   heigth: 100,
      // },

      success: (res) => {
        this.log("bannerId", res.bannerId);
        this.curBannerId = res.bannerId;
        callback && callback();
      },
      fail: (err) => {},
    });
  }

  destroyADBanner() {
    this.sdk?.destroyAdvert({
      type: 3,
      bannerId: this.curBannerId,
    });
    this.curBannerId = null;
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
  interstitialId: any = null;
  showInterstitialAd(callback?: Function) {
    this.sdk?.showAdvert({
      type: 4,
      onHide: () => {
        callback && callback();
      },
      success: (res) => {
        this.log("Interstitial", res.bannerId);
        this.interstitialId = res.bannerId;
      },
      fail: (err) => {},
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
