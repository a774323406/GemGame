import { EnvTool } from "./sdk/EnvTool";

export interface FeedAcquisitionState {
  active: boolean;
  mode: FeedDirectPlayMode;
  entered: boolean;
  exited: boolean;
  statusApiSupported: boolean;
  sceneReadyReported: boolean;
  feedScene: number;
  contentId: string;
  extra: string;
}

export type FeedDirectPlayMode = "none" | "acquisition" | "revisit";

type FeedStateListener = (state: FeedAcquisitionState) => void;

/**
 * 抖音推荐流直玩模式。
 *
 * - 获客：scene 后四位 3041、feed_game_scene=0、feed_game_channel=2；
 * - 复访：scene 后四位 3041、feed_game_scene=3、feed_game_channel=1。
 * 其他启动方式和其他渠道不会绑定 Feed API，也不会改变原游戏流程。
 */
export class FeedAcquisitionService {
  private static initialized = false;
  private static active = false;
  private static mode: FeedDirectPlayMode = "none";
  private static entered = false;
  private static exited = false;
  private static statusApiSupported = false;
  private static sceneReadyReported = false;
  private static feedScene = -1;
  private static contentId = "";
  private static extra = "";
  private static statusChangeHandler: ((result: any) => void) | null = null;
  private static sceneReadyReportAttempts = 0;
  private static sceneReadyRetryTimer: any = null;
  private static listeners = new Set<FeedStateListener>();

  public static init() {
    if (this.initialized) return;
    this.initialized = true;

    const api = this.getDouyinApi();
    if (!api) return;

    let launchOptions: any = null;
    try {
      launchOptions = api.getLaunchOptionsSync?.();
    } catch (err) {
      console.warn("[FeedAcquisition] 获取启动参数失败", err);
      return;
    }

    this.readLaunchContext(launchOptions);
    if (!this.active) return;

    this.statusApiSupported = typeof api.onFeedStatusChange === "function";
    if (this.statusApiSupported) {
      this.statusChangeHandler = (result: any) => {
        if (!this.active) return;

        const rawType =
          typeof result === "string" ? result : result?.type ?? result?.feedStatus ?? result?.status;
        const type = String(rawType || "")
          .replace(/[_-]/g, "")
          .toLowerCase();
        console.log("[FeedDirectPlay] Feed 状态变化", rawType, result);
        if (type === "feedenter") {
          this.entered = true;
          this.exited = false;
          this.notify();
        } else if (type === "feedexit") {
          this.entered = false;
          this.exited = true;
          this.notify();
        }
      };
      try {
        api.onFeedStatusChange(this.statusChangeHandler);
      } catch (err) {
        // 某些低版本宿主会暴露方法但调用失败，继续使用首次触摸兜底。
        this.statusApiSupported = false;
        this.statusChangeHandler = null;
        console.warn("[FeedAcquisition] Feed 状态监听注册失败，改用首次触摸兼容", err);
      }
    }

    console.log(
      `[FeedDirectPlay] 已进入抖音推荐流${this.mode === "revisit" ? "复访" : "获客"}预加载模式`,
    );
  }

  public static getState(): FeedAcquisitionState {
    this.init();
    return {
      active: this.active,
      mode: this.mode,
      entered: this.entered,
      exited: this.exited,
      statusApiSupported: this.statusApiSupported,
      sceneReadyReported: this.sceneReadyReported,
      feedScene: this.feedScene,
      contentId: this.contentId,
      extra: this.extra,
    };
  }

  public static isActive(): boolean {
    return this.getState().active;
  }

  public static isRevisit(): boolean {
    return this.getState().mode === "revisit";
  }

  public static isAcquisition(): boolean {
    return this.getState().mode === "acquisition";
  }

  public static getContentId(): string {
    return this.getState().contentId;
  }

  public static getExtra(): string {
    return this.getState().extra;
  }

  public static addListener(listener: FeedStateListener) {
    this.init();
    this.listeners.add(listener);
    listener(this.getState());
  }

  public static removeListener(listener: FeedStateListener) {
    this.listeners.delete(listener);
  }

  /**
   * 以用户首次真实画布触摸作为 Feed 状态事件的容错信号。
   * 某些测试宿主虽然暴露 onFeedStatusChange，但可能没有及时派发 feedEnter，
   * 因此不能仅凭 API 方法存在就禁用这条兜底路径。
   */
  public static activateFromFirstTouch() {
    this.init();
    if (!this.active || this.entered) return;

    this.entered = true;
    this.exited = false;
    console.log("[FeedDirectPlay] 首次真实画布触摸兜底：开始正式游戏");
    this.notify();
  }

  /**
   * 玩家离开本次获客体验后关闭运行时开关，避免随后从主页正常开局仍走获客流程。
   */
  public static completeSession() {
    if (!this.active) return;

    const api = this.getDouyinApi();
    if (this.statusChangeHandler && typeof api?.offFeedStatusChange === "function") {
      try {
        api.offFeedStatusChange(this.statusChangeHandler);
      } catch (err) {
        console.warn("[FeedDirectPlay] 取消 Feed 状态监听失败", err);
      }
    }

    this.active = false;
    this.mode = "none";
    this.entered = false;
    this.exited = false;
    this.statusApiSupported = false;
    this.sceneReadyReported = false;
    this.feedScene = -1;
    this.contentId = "";
    this.extra = "";
    this.statusChangeHandler = null;
    this.sceneReadyReportAttempts = 0;
    this.clearSceneReadyRetry();
    this.notify();
    this.listeners.clear();
  }

  /**
   * 棋盘、托盘等可交互内容完成后，上报平台固定场景 7001。
   */
  public static reportSceneReady() {
    this.init();
    if (!this.active || this.sceneReadyReported) return;

    const api = this.getDouyinApi();
    if (!api || typeof api.reportScene !== "function") {
      console.warn("[FeedAcquisition] 当前抖音版本不支持 tt.reportScene");
      return;
    }

    this.clearSceneReadyRetry();
    this.sceneReadyReportAttempts += 1;
    this.sceneReadyReported = true;
    try {
      api.reportScene({
        sceneId: 7001,
        success: () => {
          this.clearSceneReadyRetry();
          console.log("[FeedAcquisition] 场景加载完成已上报: 7001");
        },
        fail: (err: any) => this.handleSceneReadyReportFailure(err),
      });
    } catch (err) {
      this.handleSceneReadyReportFailure(err);
    }
    this.notify();
  }

  private static handleSceneReadyReportFailure(err: any) {
    this.sceneReadyReported = false;
    console.warn(
      `[FeedAcquisition] tt.reportScene 上报失败 (${this.sceneReadyReportAttempts}/3)`,
      err,
    );
    this.notify();
    if (!this.active || this.sceneReadyReportAttempts >= 3) return;

    const delayMs = this.sceneReadyReportAttempts * 1000;
    this.sceneReadyRetryTimer = setTimeout(() => {
      this.sceneReadyRetryTimer = null;
      this.reportSceneReady();
    }, delayMs);
  }

  private static clearSceneReadyRetry() {
    if (!this.sceneReadyRetryTimer) return;
    clearTimeout(this.sceneReadyRetryTimer);
    this.sceneReadyRetryTimer = null;
  }

  private static readLaunchContext(options: any) {
    const scene = String(options?.scene ?? "");
    const query = options?.query || {};
    if (scene.slice(-4) !== "3041") return;

    const feedScene = Number(query.feed_game_scene);
    const feedChannel = Number(query.feed_game_channel);
    if (feedScene === 0 && feedChannel === 2) {
      this.mode = "acquisition";
    } else if (feedScene === 3 && feedChannel === 1) {
      this.mode = "revisit";
    } else {
      return;
    }

    this.active = true;
    this.feedScene = feedScene;
    this.contentId = String(query.feed_game_content_id || "");
    this.extra = String(query.feed_game_extra || "");
  }

  private static getDouyinApi(): any | null {
    if (!EnvTool.isByteDanceMiniGame()) return null;

    const api = EnvTool.getMiniGameApi();
    return api && typeof api.getLaunchOptionsSync === "function" ? api : null;
  }

  private static notify() {
    const state = this.getState();
    for (const listener of this.listeners) {
      listener(state);
    }
  }
}
