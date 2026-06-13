import { EnvTool } from "./sdk/EnvTool";

export interface FeedAcquisitionState {
  active: boolean;
  entered: boolean;
  exited: boolean;
  statusApiSupported: boolean;
  sceneReadyReported: boolean;
}

type FeedStateListener = (state: FeedAcquisitionState) => void;

/**
 * 抖音推荐流直玩获客模式。
 *
 * 仅 scene 后四位为 3041、feed_game_scene=0、feed_game_channel=2 时启用。
 * 其他启动方式和其他渠道不会绑定 Feed API，也不会改变原游戏流程。
 */
export class FeedAcquisitionService {
  private static initialized = false;
  private static active = false;
  private static entered = false;
  private static exited = false;
  private static statusApiSupported = false;
  private static sceneReadyReported = false;
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

    this.active = this.isAcquisitionLaunch(launchOptions);
    if (!this.active) return;

    this.statusApiSupported = typeof api.onFeedStatusChange === "function";
    if (this.statusApiSupported) {
      api.onFeedStatusChange((result: any) => {
        if (!this.active) return;

        const type =
          typeof result === "string" ? result : result?.type ?? result?.feedStatus ?? result?.status;
        if (type === "feedEnter") {
          this.entered = true;
          this.exited = false;
          this.notify();
        } else if (type === "feedExit") {
          this.exited = true;
          this.notify();
        }
      });
    }

    console.log("[FeedAcquisition] 已进入抖音推荐流获客预加载模式");
  }

  public static getState(): FeedAcquisitionState {
    this.init();
    return {
      active: this.active,
      entered: this.entered,
      exited: this.exited,
      statusApiSupported: this.statusApiSupported,
      sceneReadyReported: this.sceneReadyReported,
    };
  }

  public static isActive(): boolean {
    return this.getState().active;
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
   * 低版本抖音没有 onFeedStatusChange 时，以用户首次触摸作为真实进入信号。
   */
  public static activateFromFirstTouch() {
    this.init();
    if (!this.active || this.statusApiSupported || this.entered) return;

    this.entered = true;
    this.exited = false;
    console.log("[FeedAcquisition] 低版本兼容：首次触摸后开始正式游戏");
    this.notify();
  }

  /**
   * 玩家离开本次获客体验后关闭运行时开关，避免随后从主页正常开局仍走获客流程。
   */
  public static completeSession() {
    if (!this.active) return;

    this.active = false;
    this.entered = false;
    this.exited = false;
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

    this.sceneReadyReported = true;
    api.reportScene({
      sceneId: 7001,
      success: () => console.log("[FeedAcquisition] 场景加载完成已上报: 7001"),
      fail: (err: any) => {
        this.sceneReadyReported = false;
        console.warn("[FeedAcquisition] tt.reportScene 上报失败", err);
      },
    });
    this.notify();
  }

  private static isAcquisitionLaunch(options: any): boolean {
    const scene = String(options?.scene ?? "");
    const query = options?.query || {};
    return (
      scene.slice(-4) === "3041" &&
      String(query.feed_game_scene) === "0" &&
      String(query.feed_game_channel) === "2"
    );
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
