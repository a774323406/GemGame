import { _decorator, Component, ProgressBar } from "cc";
import AudioManager from "./framework/AudioManager";
import gamePrefabMgr from "./gamePrefabMgr";
import { GameSceneBundle, GameSceneName } from "./framework/GameSceneBundle";
import { FeedAcquisitionService } from "./framework/Platform/FeedAcquisitionService";
import { SdkUtils } from "./framework/Platform/sdk/SdkUtils";

const { ccclass, property } = _decorator;

@ccclass("loadScene")
export class loadScene extends Component {
  @property(ProgressBar)
  public loading: ProgressBar = null;

  private progressTimer: any = null;
  private currentProgress: number = 0;
  private targetProgress: number = 0;
  private hasEnteredNextScene: boolean = false;

  start() {
    SdkUtils.requireSDK();
    FeedAcquisitionService.init();
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
      await gamePrefabMgr.Instance.loadBundle("gamescene");

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

      const isFeedAcquisition = FeedAcquisitionService.isActive();
      console.log(
        `[loadScene] 所有资源加载完成，准备进入 ${isFeedAcquisition ? "GameScene（获客模式）" : "MainScene"}`,
      );

      if (!isFeedAcquisition) {
        AudioManager.playDefaultBgm();
      }

      await this.enterNextScene();
    } catch (err) {
      console.error("[loadScene] 加载失败：", err);
    }
  }

  /**
   * 进入主场景
   */
  private async enterNextScene() {
    if (this.hasEnteredNextScene) {
      return;
    }

    this.hasEnteredNextScene = true;

    this.targetProgress = 1;
    this.currentProgress = 1;

    if (this.loading) {
      this.loading.progress = 1;
    }

    this.clearProgressTimer();

    await GameSceneBundle.loadScene(
      FeedAcquisitionService.isActive() ? GameSceneName.Game : GameSceneName.Main,
    );
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
