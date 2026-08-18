import {
  _decorator,
  Color,
  Component,
  HorizontalTextAlignment,
  Label,
  Node,
  ProgressBar,
  sys,
  UITransform,
} from "cc";
import AudioManager from "./framework/AudioManager";
import gamePrefabMgr from "./gamePrefabMgr";
import { GameSceneBundle, GameSceneName } from "./framework/GameSceneBundle";
import {
  FeedAcquisitionService,
  FeedDirectPlayMode,
} from "./framework/Platform/FeedAcquisitionService";
import {
  FEED_HAIR_CONTENT_ID,
  FEED_SHOOTING_CONTENT_ID,
} from "./framework/Platform/FeedRevisitConfig";
import { SdkUtils } from "./framework/Platform/sdk/SdkUtils";

const { ccclass, property } = _decorator;
const FIRST_DIRECT_GAME_ENTRY_KEY = "gem_first_direct_game_entry_v1";
const EXISTING_LEVEL_PROGRESS_KEY = "gem_sort_level";

@ccclass("loadScene")
export class loadScene extends Component {
  @property(ProgressBar)
  public loading: ProgressBar = null;

  private progressTimer: any = null;
  private currentProgress: number = 0;
  private targetProgress: number = 0;
  private hasEnteredNextScene: boolean = false;
  private isLoading: boolean = false;
  private loadErrorNode: Node | null = null;

  start() {
    SdkUtils.requireSDK();
    FeedAcquisitionService.init();
    if (this.loading) {
      this.loading.progress = 0;
    }

    this.startProgressTimer();
    void this.loadRes();
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
    if (this.isLoading) return;
    this.isLoading = true;
    this.clearLoadError();

    const maxAttempts = 3;
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      gamePrefabMgr.Instance.resetLoadState();
      this.currentProgress = 0;
      this.targetProgress = 0;
      if (this.loading) this.loading.progress = 0;

      try {
        console.log(`[loadScene] 开始加载资源 (${attempt}/${maxAttempts})`);

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

        const isFeedDirectPlay = FeedAcquisitionService.isActive();
        const hasFirstEntryMarker = !!sys.localStorage.getItem(FIRST_DIRECT_GAME_ENTRY_KEY);
        const hasExistingProgress = sys.localStorage.getItem(EXISTING_LEVEL_PROGRESS_KEY) !== null;
        const isFirstLaunch = !hasFirstEntryMarker && !hasExistingProgress;
        if (!hasFirstEntryMarker && hasExistingProgress) {
          // 旧版本玩家已有关卡进度，迁移为“已完成首次入口”。
          sys.localStorage.setItem(FIRST_DIRECT_GAME_ENTRY_KEY, "1");
        }
        const feedEntry = isFeedDirectPlay ? this.resolveFeedEntry() : null;
        const nextScene = feedEntry
          ? feedEntry.sceneName
          : isFirstLaunch
            ? GameSceneName.Game
            : GameSceneName.Main;
        const entryReason = feedEntry
          ? feedEntry.reason
          : isFirstLaunch
            ? "首次启动直接进入关卡"
            : "正常进入主界面";
        console.log(
          `[loadScene] 所有资源加载完成，准备进入 ${nextScene}（${entryReason}）`,
        );

        if (!isFeedDirectPlay) {
          AudioManager.playDefaultBgm();
        }

        await this.enterNextScene(nextScene, isFirstLaunch);
        this.isLoading = false;
        return;
      } catch (err) {
        lastError = err;
        console.error(`[loadScene] 第 ${attempt} 次加载失败：`, err);
        this.hasEnteredNextScene = false;
        if (attempt < maxAttempts) {
          await this.delay(600);
        }
      }
    }

    this.isLoading = false;
    this.clearProgressTimer();
    console.error("[loadScene] 多次加载仍失败：", lastError);
    this.showLoadError();
  }

  /**
   * 进入下一个场景。
   * 首次标记在切场景前写入；如果切场景失败则回滚，保证重试时仍能直接进关卡。
   */
  private async enterNextScene(sceneName: GameSceneName, markFirstLaunch: boolean) {
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

    if (markFirstLaunch) {
      sys.localStorage.setItem(FIRST_DIRECT_GAME_ENTRY_KEY, "1");
    }

    try {
      await GameSceneBundle.loadScene(sceneName);
    } catch (err) {
      if (markFirstLaunch) {
        sys.localStorage.removeItem(FIRST_DIRECT_GAME_ENTRY_KEY);
      }
      this.hasEnteredNextScene = false;
      throw err;
    }
  }

  /**
   * 获客按方案 Content_ID 分流；复访固定进入打瓶子玩法。
   * 未知获客 ID 继续进入打瓶子，保证新建/测试方案不会卡在加载页。
   */
  private resolveFeedEntry(): { sceneName: GameSceneName; reason: string } {
    const state = FeedAcquisitionService.getState();
    const contentId = String(state.contentId || "").trim();

    if (state.mode === "revisit") {
      return {
        sceneName: GameSceneName.ShootingGlassBottles,
        reason: `推荐流复访打瓶子（${contentId || "无 Content_ID"}）`,
      };
    }

    if (contentId === FEED_HAIR_CONTENT_ID) {
      return {
        sceneName: GameSceneName.HairGame,
        reason: `推荐流头发校准方案（${contentId}）`,
      };
    }

    if (contentId === FEED_SHOOTING_CONTENT_ID) {
      return {
        sceneName: GameSceneName.ShootingGlassBottles,
        reason: `推荐流打瓶子方案（${contentId}）`,
      };
    }

    this.warnUnknownFeedContentId(state.mode, contentId);
    return {
      sceneName: GameSceneName.ShootingGlassBottles,
      reason: `推荐流未知方案兜底打瓶子（${contentId || "无 Content_ID"}）`,
    };
  }

  private warnUnknownFeedContentId(mode: FeedDirectPlayMode, contentId: string): void {
    console.warn(
      `[loadScene] 未配置推荐流 Content_ID 映射，使用打瓶子兜底: mode=${mode}, contentId=${contentId || "empty"}`,
    );
  }

  private showLoadError() {
    if (this.loadErrorNode?.isValid) return;

    const node = new Node("LoadErrorLabel");
    node.parent = this.node;
    node.setPosition(0, -180, 0);
    node.addComponent(UITransform).setContentSize(650, 80);
    const label = node.addComponent(Label);
    label.string = "加载失败，点击屏幕重试";
    label.fontSize = 30;
    label.lineHeight = 42;
    label.color = new Color(255, 255, 255, 255);
    label.horizontalAlign = HorizontalTextAlignment.CENTER;
    this.loadErrorNode = node;

    this.node.off(Node.EventType.TOUCH_END, this.retryLoad, this);
    this.node.on(Node.EventType.TOUCH_END, this.retryLoad, this);
  }

  private retryLoad() {
    if (this.isLoading) return;
    this.clearLoadError();
    this.hasEnteredNextScene = false;
    this.startProgressTimer();
    void this.loadRes();
  }

  private clearLoadError() {
    this.node.off(Node.EventType.TOUCH_END, this.retryLoad, this);
    if (this.loadErrorNode?.isValid) {
      this.loadErrorNode.destroy();
    }
    this.loadErrorNode = null;
  }

  private delay(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  private clearProgressTimer() {
    if (this.progressTimer) {
      clearInterval(this.progressTimer);
      this.progressTimer = null;
    }
  }

  onDestroy() {
    this.clearProgressTimer();
    this.clearLoadError();
  }
}
