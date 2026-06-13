import { View, gfx, screen, sys } from "cc";
import {
  ALIPAY,
  BUILD,
  BYTEDANCE,
  HTML5,
  HUAWEI,
  JSB,
  MINIGAME,
  NATIVE,
  OPPO,
  RUNTIME_BASED,
  TAOBAO_MINIGAME,
  VIVO,
  WECHAT,
  XIAOMI,
} from "cc/env";

export class EnvTool {
  public static isMiniGame(): boolean {
    let isMiniGame = false;
    if (WECHAT || MINIGAME || RUNTIME_BASED || BYTEDANCE) {
      isMiniGame = true;
    }
    return isMiniGame;
  }

  public static isH5() {
    return HTML5;
  }

  public static isWeChat() {
    if (WECHAT) {
      let isQQ = window["qq_minigame_flag"] == 1;
      return !isQQ;
    }
    return false;
  }

  public static isQQMiniGame() {
    if (WECHAT) {
      let isQQ = window["qq_minigame_flag"] == 1;
      return isQQ;
    }
    return false;
  }

  public static isByteDance() {
    return BYTEDANCE;
  }

  public static isBHMiniGame() {
    let ret = false;
    if (XIAOMI || OPPO || VIVO || BYTEDANCE || TAOBAO_MINIGAME) {
      ret = true;
    }
    return ret;
  }

  /**不要分享的小游戏类型 */
  public static isBHMiniGameNoShare() {
    let ret = false;
    if (XIAOMI || OPPO || VIVO || HUAWEI || TAOBAO_MINIGAME) {
      ret = true;
    }
    return ret;
  }

  public static isVivoMiniGame() {
    return VIVO;
  }
  //public static isHonorMiniGame() {
  //    return HONOR;
  // }

  public static isOppoMiniGame() {
    return OPPO;
  }

  public static isBaiduMiniGame() {
    // return BAIDU;
  }

  public static isXiaoMiMiniGame() {
    return XIAOMI;
  }

  public static isAlipayMiniGame() {
    return ALIPAY;
  }

  public static isTaobaoMiniGame() {
    return TAOBAO_MINIGAME;
  }

  public static isByteDanceMiniGame() {
    return BYTEDANCE;
  }

  public static isHuaWeiMiniGame() {
    return HUAWEI;
  }

  public static isIos() {
    return sys.os === sys.OS.IOS;
  }

  private static testTimer: any = null!;
  public static iPhoneModelH5() {
    // screen.requestFullScreen();
    let ret = false;
    if (HTML5) {
      const renderer = gfx.deviceManager.gfxDevice.renderer || ``;
      const vendor = gfx.deviceManager.gfxDevice.vendor || ``;
      ret = renderer.includes(`Apple`) || vendor.includes(`Apple`);
      const size = screen.windowSize;
      const scaleX = View.instance.getScaleX();
      const scaleY = View.instance.getScaleY();
      // const str = `ret, ${renderer} ${vendor}: ${size.width}x${size.height} ${scaleX}x${scaleY}`;
      // oops.gui.toast(str);
      // if (EnvTool.testTimer) {
      // clearTimeout(EnvTool.testTimer);
      // }
      // EnvTool.testTimer = setTimeout(() => {
      // EnvTool.iPhoneModelH5();
      // }, 1000);
    }
    return ret;
  }

  public static isNative() {
    return NATIVE;
  }

  public static tryGC() {
    if (JSB) {
      jsb.garbageCollect();
    } else if (HTML5) {
      // 浏览器自动GC
    } else {
      const api = EnvTool.getMiniGameApi();
      if (api) {
        if (typeof api.triggerGC === "function") {
          api.triggerGC();
        }
      }
    }
  }

  public static getMiniGameApi() {
    //@ts-ignore
    const api = window.wx || window.tt || window.qg || window.my || window.qq;
    return api;
  }

  static isBuild() {
    return BUILD;
  }
}
