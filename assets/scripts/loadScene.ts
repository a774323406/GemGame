import { _decorator, Component, ProgressBar, director } from "cc";
import AudioManager from "./framework/AudioManager";
import gamePrefabMgr from "./gamePrefabMgr";
import { SdkUtils } from "./framework/Platform/sdk/SdkUtils";

const { ccclass, property } = _decorator;

@ccclass("loadScene")
export class loadScene extends Component {
  @property(ProgressBar)
  public loading: ProgressBar = null;

  private progressTimer: any = null;
  private currentProgress: number = 0;
  private targetProgress: number = 0;
  private hasEnteredMainScene: boolean = false;

  start() {
    SdkUtils.requireSDK();
    if (this.loading) {
      this.loading.progress = 0;
    }

    gamePrefabMgr.Instance.resetLoadState();

    this.startProgressTimer();
    this.loadRes();
  }

  /**
   * 刷新真实加载进度
   */
  private startProgressTimer() {
    this.clearProgressTimer();

    this.progressTimer = setInterval(() => {
      const realProgress = gamePrefabMgr.Instance.getLoadProgress() / 100;

      if (realProgress <= 0) {
        this.targetProgress = Math.max(this.targetProgress, 0.03);
      } else {
        this.targetProgress = realProgress;
      }

      this.currentProgress += (this.targetProgress - this.currentProgress) * 0.25;

      if (this.loading) {
        this.loading.progress = this.currentProgress;
      }
    }, 30);
  }

  /**
   * 加载资源
   */
  private async loadRes() {
    try {
      console.log("[loadScene] 开始加载资源");

      /**
       * 这里写你需要加载的 bundle。
       *
       * 注意：
       * 不建议直接写 ResourceManager.ins.loadBundle("res")
       * 因为那样 gamePrefabMgr 无法统计真实进度。
       */
      await gamePrefabMgr.Instance.loadBundle("res");

      /**
       * 如果以后有其他 bundle，就继续写：
       *
       * await gamePrefabMgr.Instance.loadBundle("config");
       * await gamePrefabMgr.Instance.loadBundle("puzzle");
       * await gamePrefabMgr.Instance.loadBundle("find");
       */

      /**
       * 加载默认资源：
       * - UI prefab
       * - sound 音效
       */
      await gamePrefabMgr.Instance.loadDefaultAssets();

      console.log("[loadScene] 所有资源加载完成，准备进入 MainScene");

      AudioManager.playDefaultBgm();

      this.enterMainScene();
    } catch (err) {
      console.error("[loadScene] 加载失败：", err);
    }
  }

  /**
   * 进入主场景
   */
  private enterMainScene() {
    if (this.hasEnteredMainScene) {
      return;
    }

    this.hasEnteredMainScene = true;

    this.targetProgress = 1;
    this.currentProgress = 1;

    if (this.loading) {
      this.loading.progress = 1;
    }

    this.clearProgressTimer();

    director.loadScene("MainScene");
  }

  private clearProgressTimer() {
    if (this.progressTimer) {
      clearInterval(this.progressTimer);
      this.progressTimer = null;
    }
  }

  onDestroy() {
    this.clearProgressTimer();
  }
}
