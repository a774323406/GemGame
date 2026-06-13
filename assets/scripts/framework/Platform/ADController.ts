import { GlobalTool } from "./sdk/GlobalTool";
import { EnvTool } from "./sdk/EnvTool";
import { SdkUtils } from "./sdk/SdkUtils";
import { EventTag } from "./sdk/EventTag";

export class ADController {
  private isAutoAD = false;
  private enterADCount = 0;
  private bannerFD = null;

  private isBan() {
    return !GlobalTool.isAdUser || !this.isAutoAD || EnvTool.isNative();
  }

  // 游戏从点击进入开始后连续两次激励视频-被动（无任何点击行为），从时间节点计算，无秒数限制。
  // 游戏从点击进入开始后连续两次激励视频-被动（无任何点击行为），从时间节点计算，无秒数限制。此处连弹2次激励视频改成1次
  onEnterGame() {
    console.log("onEnterGame", GlobalTool.isAdUser);
    SdkUtils.report(EventTag.LOGIN_FINISH);

    if (this.isBan()) {
      return;
    }

    if (this.enterADCount >= 1) {
      GlobalTool.isEnterADFinished = true;
      return;
    }
    setTimeout(() => {
      console.log("onEnterGame trigger", this.enterADCount);
      SdkUtils.showADVideo(
        () => {
          this.enterADCount++;
          this.onEnterGame();
        },
        () => {
          this.enterADCount++;
          this.onEnterGame();
        }
      );
    }, 500);

    // setTimeout(() => {
    //     CarColorsGlobalInstance.instance.uiSysterm.showUI(UINames.VirtualBannerPage);
    // }, 4000);

    // banner
    // if (this.bannerFD) {
    //     clearTimeout(this.bannerFD);
    // }
    // this.bannerFD = setTimeout(() => {
    //     SdkUtils.showADBanner();
    // }, 15000);
    // SdkUtils.showADBanner();
  }

  // 游戏关卡开始时 ，每12秒被动弹出激励视频同时调用OPPO屏幕调起最暗的亮度无法调整。
  // 游戏开始时9秒后弹出激励视频广告位，后续逻辑为每11秒一个激励视频；
  private levelStartHandle = null;
  private levelStartTemplateHandle = null;
  onLevelStart() {
    console.log("onLevelStart", GlobalTool.isAdUser);
    if (this.isBan()) {
      return;
    }

    this.showDelayVideoAD(9000);
    this.showDelayTemplateAD(6000);

    // setTimeout(() => {
    //     SdkUtils.showADTemplate();
    // }, 7000);
    // SdkUtils.showADBanner();
  }

  private showDelayVideoAD(delay: number) {
    if (this.levelStartHandle) {
      clearTimeout(this.levelStartHandle);
      this.levelStartHandle = null;
    }

    this.levelStartHandle = setTimeout(() => {
      this.levelStartHandle = null;
      console.log("onLevelStart tigger");
      let nextDelay = 11000;
      // if (CarColorsGlobalInstance.instance.uiSysterm.isShowing(UINames.RefreshPage)) {
      //   console.log("isShowing 1");
      //   this.showDelayVideoAD(nextDelay);
      //   return;
      // }

      // if (CarColorsGlobalInstance.instance.uiSysterm.isShowing(UINames.SortPage)) {
      //   console.log("isShowing 2");
      //   this.showDelayVideoAD(nextDelay);
      //   return;
      // }

      // if (CarColorsGlobalInstance.instance.uiSysterm.isShowing(UINames.VipPage)) {
      //   console.log("isShowing 3");
      //   this.showDelayVideoAD(nextDelay);
      //   return;
      // }
      console.log("onLevelStart tigger start showDelayVideoAD");
      if (EnvTool.isOppoMiniGame()) {
        SdkUtils.setBrightness(0);
      }
      setTimeout(() => {
        SdkUtils.showADVideo(
          () => {
            this.showDelayVideoAD(nextDelay);
          },
          () => {
            this.showDelayVideoAD(nextDelay);
          }
        );
      }, 100);
    }, delay);
  }

  private showDelayTemplateAD(delay: number) {
    if (this.levelStartTemplateHandle) {
      clearTimeout(this.levelStartTemplateHandle);
      this.levelStartTemplateHandle = null;
    }
    this.levelStartTemplateHandle = setTimeout(() => {
      this.levelStartTemplateHandle = null;
      let nextDelay = 8000;
      console.log("onLevelStart tigger start showDelayTemplateAD");
      SdkUtils.showADTemplate();
      this.showDelayTemplateAD(nextDelay);
    }, delay);
  }

  // 游戏关卡开始时 ，每30秒被动模板广告并且变暗
  onLevelTime30Sec() {
    console.log("onLevelTime30Sec", GlobalTool.isAdUser);
    if (this.isBan()) {
      return;
    }

    console.log("onLevelTime30Sec tigger");
    SdkUtils.setBrightness(0);
    SdkUtils.showADTemplate();
  }

  onLevelEnd() {
    console.log("onLevelTime30Sec", GlobalTool.isAdUser);
    if (this.isBan()) {
      return;
    }

    console.log("onLevelEnd tigger");
    if (this.levelStartHandle) {
      clearTimeout(this.levelStartHandle);
    }
    this.levelStartHandle = null;

    if (this.levelStartTemplateHandle) {
      clearTimeout(this.levelStartTemplateHandle);
    }
    this.levelStartTemplateHandle = null;

    SdkUtils.showADVideo();
  }

  onBeforeLevelStart(cb?: Function) {
    console.log("onBeforeLevelStart", GlobalTool.isAdUser);
    if (!GlobalTool.isAdUser) {
      cb && cb();
      return;
    }

    console.log("onBeforeLevelStart tigger");
    // CarColorsGlobalInstance.instance.uiSysterm.showUI(UINames.BoxPage, cb);
  }

  // 每重新进入游戏一次（不杀端的情况下），每次调起游戏后都需要播放一次激励视频-被动。
  onGameResume() {
    console.log("onGameResume", GlobalTool.isAdUser);
    if (this.isBan()) {
      return;
    }

    if (!GlobalTool.isEnterADFinished) {
      return;
    }
    if (!GlobalTool.isCanWatchFromResume()) {
      return;
    }
    console.log("onGameResume tigger");
    SdkUtils.showADVideo();
  }

  onGameHide() {
    console.log("onGameHide", GlobalTool.isAdUser);
    if (this.isBan()) {
      return;
    }

    if (GlobalTool.isPlayingAD) {
      return;
    }

    if (!GlobalTool.isCanWatchFromResume()) {
      return;
    }
    console.log("onGameHide tigger");
    SdkUtils.showADVideo();
  }
}

export const adc = new ADController();
