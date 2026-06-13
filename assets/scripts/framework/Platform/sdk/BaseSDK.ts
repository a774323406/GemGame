import { adc } from "../ADController";

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

  showADVideo(cb?: Function, failCB?: Function) {
    console.log("[BaseSDK] mock rewarded video success");
    cb && cb();
  }

  showADBanner(callback?: Function) {
    console.log("[BaseSDK] mock banner show success");
    callback && callback();
  }

  destroyADBanner() {}

  /** 原生模板 */
  showADTemplate() {
    console.log("[BaseSDK] mock template ad show");
  }
  showInterstitialAd(cb?: Function) {
    console.log("[BaseSDK] mock interstitial ad show success");
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
  share() {
    console.log("share");
  }
  vibrateShort() {
    console.log("vibrateShort");
  }
  vibrateLong() {
    console.log("vibrateLong");
  }
}
