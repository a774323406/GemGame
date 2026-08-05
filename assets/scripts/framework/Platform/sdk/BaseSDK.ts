import { adc } from "../ADController";

export interface GameShareOptions {
  channel?: "invite" | "video" | "article" | "token" | "";
  templateId?: string;
  query?: string;
  title?: string;
  desc?: string;
}

export class BaseSDK {
  public isInited = false;
  isLogined = false;

  init(cb?: Function) {
    console.log("[BaseSDK] mock init success");
    this.isInited = true;
    this.isLogined = true;
    this.onLoginFinished();
    cb && cb();
  }

  login(cb?: Function) {
    console.log("[BaseSDK] mock login success");
    this.isLogined = true;
    cb && cb();
  }

  showADVideo(cb?: Function, failCB?: Function, shownCB?: Function) {
    console.log("[BaseSDK] mock rewarded video success");
    shownCB && shownCB();
    cb && cb();
  }

  showADBanner(callback?: Function, failCB?: Function, closeCB?: Function, resizeCB?: Function) {
    console.log("[BaseSDK] mock banner show success");
    resizeCB && resizeCB(0, 1);
    callback && callback();
  }

  destroyADBanner() {}

  /** 原生模板 */
  showADTemplate() {
    console.log("[BaseSDK] mock template ad show");
  }
  showInterstitialAd(cb?: Function, failCB?: Function, shownCB?: Function) {
    console.log("[BaseSDK] mock interstitial ad show success");
    shownCB && shownCB();
    cb && cb();
  }
  destroyADTemplate() {}

  onLoginFinished() {
    adc.onEnterGame();
  }

  setBrightness(val: number) {}

  showYongHuXieYi() {}

  showYinSiZhengCe() {}

  report(tag: string, params: any) {
    console.log("report", tag, params);
  }

  checkShortcut() {}

  addShortcut() {}
  share(options?: GameShareOptions, successCB?: Function, failCB?: Function) {
    console.log("[BaseSDK] mock share success", options);
    successCB && successCB();
  }
  vibrateShort() {
    console.log("vibrateShort");
  }
  vibrateLong() {
    console.log("vibrateLong");
  }
}
