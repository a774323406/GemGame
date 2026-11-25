import { director, Director, Node, Sprite, UITransform } from "cc";
import { EnvTool } from "./sdk/EnvTool";
import { isConfiguredFeedAcquisitionContentId } from "./FeedRevisitConfig";

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

export interface FeedStableRenderOptions {
  /** 挂载当前玩法脚本的场景根节点。 */
  owner: Node;
  /** 必须已经可见的背景和核心玩法节点。 */
  requiredVisibleNodes?: Array<Node | null | undefined>;
  /** 资源加载之外的自定义就绪条件。 */
  isReady?: () => boolean;
  /** 连续完成多少个渲染帧后才允许上报。 */
  stableFrameCount?: number;
  /** 给抖音原生 Surface 留出的画面提交时间。 */
  surfaceDelayMs?: number;
}

/**
 * 抖音推荐流直玩模式。
 *
 * - 获客：feed_game_scene=0、feed_game_channel=2；
 *   已配置 Content_ID 的预览入口允许缺少上述字段，不限制宿主 scene 值。
 * - 复访：feed_game_scene=3、feed_game_channel=1。
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

  /**
   * 等待场景资源、节点和原生画布都稳定后再上报 7001。
   *
   * 推荐流会在收到 7001 后很快抓取预览画面。只等一个 Cocos 帧时，
   * 真机的纹理上传或原生 Surface 可能仍未提交，平台就会抓到 Camera 的清屏帧。
   */
  public static async reportSceneReadyAfterStableRender(
    options: FeedStableRenderOptions,
  ): Promise<boolean> {
    this.init();
    if (!this.active || this.sceneReadyReported) return false;

    const stableFrameCount = Math.max(2, Math.floor(options.stableFrameCount ?? 3));
    const surfaceDelayMs = Math.max(0, Math.floor(options.surfaceDelayMs ?? 160));

    for (let frame = 0; frame < stableFrameCount; frame++) {
      if (!this.isFeedSceneRenderable(options)) {
        this.warnFeedSceneNotRenderable(options);
        return false;
      }
      await this.waitForEndFrame();
    }

    if (surfaceDelayMs > 0) {
      await this.delay(surfaceDelayMs);
    }

    // 延迟后再跨过一个完整渲染帧，保证等待时间内产生的画面已经提交。
    await this.waitForEndFrame();
    if (!this.isFeedSceneRenderable(options)) {
      this.warnFeedSceneNotRenderable(options);
      return false;
    }

    this.reportSceneReady();
    return this.sceneReadyReported;
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

  private static isFeedSceneRenderable(options: FeedStableRenderOptions): boolean {
    if (!this.active || !options.owner?.isValid || !options.owner.activeInHierarchy) return false;

    const requiredNodes = options.requiredVisibleNodes ?? [];
    for (const node of requiredNodes) {
      if (!node?.isValid || !node.activeInHierarchy) return false;

      const transform = node.getComponent(UITransform);
      if (transform && (transform.width <= 1 || transform.height <= 1)) return false;

      const sprite = node.getComponent(Sprite);
      if (sprite && (!sprite.enabled || !sprite.spriteFrame?.isValid)) return false;
    }

    if (options.isReady) {
      try {
        if (!options.isReady()) return false;
      } catch (err) {
        console.warn("[FeedAcquisition] 检查推荐流场景可见状态失败", err);
        return false;
      }
    }

    return true;
  }

  private static warnFeedSceneNotRenderable(options: FeedStableRenderOptions): void {
    if (!this.active || !options.owner?.isValid) return;
    const invalidNodes = (options.requiredVisibleNodes ?? [])
      .filter((node) => {
        if (!node?.isValid || !node.activeInHierarchy) return true;
        const transform = node.getComponent(UITransform);
        if (transform && (transform.width <= 1 || transform.height <= 1)) return true;
        const sprite = node.getComponent(Sprite);
        return !!sprite && (!sprite.enabled || !sprite.spriteFrame?.isValid);
      })
      .map((node) => node?.name || "unknown");
    console.warn(
      `[FeedAcquisition] 场景尚未达到可渲染状态，暂不上报 7001${
        invalidNodes.length > 0 ? `: ${invalidNodes.join(", ")}` : ""
      }`,
    );
  }

  private static waitForEndFrame(): Promise<void> {
    return new Promise((resolve) => {
      director.once(Director.EVENT_END_FRAME, () => resolve());
    });
  }

  private static delay(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  private static readLaunchContext(options: any) {
    const scene = String(options?.scene ?? "");
    const query = this.getFeedLaunchQuery(options);
    const feedSceneText = String(
      query.feed_game_scene ?? query.feedGameScene ?? query.feedScene ?? "",
    ).trim();
    const feedChannelText = String(
      query.feed_game_channel ?? query.feedGameChannel ?? query.feedChannel ?? "",
    ).trim();
    const feedScene = feedSceneText ? Number(feedSceneText) : NaN;
    const feedChannel = feedChannelText ? Number(feedChannelText) : NaN;
    const contentId = this.normalizeContentId(
      query.feed_game_content_id ??
        query.feedGameContentId ??
        query.feed_game_contentID ??
        query.contentId ??
        query.content_id ??
        query.contentID,
    );
    const hasAcquisitionMarkers = feedScene === 0 && feedChannel === 2;
    // Only infer missing fields for a live, configured acquisition ID. Explicit
    // revisit markers or another channel retain their original interpretation.
    const hasConfiguredAcquisitionId = isConfiguredFeedAcquisitionContentId(contentId);
    const canInferAcquisition = hasConfiguredAcquisitionId &&
      (!feedSceneText || feedScene === 0) && (!feedChannelText || feedChannel === 2);

    if (hasAcquisitionMarkers || canInferAcquisition) {
      this.mode = "acquisition";
    } else if (feedScene === 3 && feedChannel === 1) {
      this.mode = "revisit";
    } else {
      console.log(
        `[FeedDirectPlay] 未激活推荐流: scene=${scene || "empty"}, feedScene=${feedSceneText || "missing"}, feedChannel=${feedChannelText || "missing"}, contentId=${contentId || "empty"}, configuredId=${hasConfiguredAcquisitionId}`,
      );
      return;
    }

    this.active = true;
    this.feedScene = this.mode === "acquisition" ? 0 : feedScene;
    this.contentId = contentId;
    this.extra = String(
      query.feed_game_extra ?? query.feedGameExtra ?? "",
    );
    console.log(
      `[FeedDirectPlay] 启动参数已识别: scene=${scene || "empty"}, feedScene=${feedSceneText || "missing"}, feedChannel=${feedChannelText || "missing"}, contentId=${this.contentId || "empty"}, source=${this.mode === "acquisition" && !hasAcquisitionMarkers ? "configured-content-id" : "feed-markers"}`,
    );
  }

  private static getFeedLaunchQuery(options: any): Record<string, any> {
    const query: Record<string, any> = {};
    const extraData = this.parseLaunchQuery(options?.referrerInfo?.extraData);
    Object.assign(query, extraData);
    Object.assign(query, this.parseLaunchQuery(extraData.query));
    Object.assign(
      query,
      this.parseLaunchQuery(options?.referrerInfo?.extraData?.query),
    );
    Object.assign(query, this.parseLaunchQuery(options));
    Object.assign(query, this.parseLaunchQuery(options?.query));
    return query;
  }

  private static parseLaunchQuery(value: any): Record<string, any> {
    if (!value || typeof value === "object") {
      return value && typeof value === "object" ? value : {};
    }

    const text = String(value).trim();
    if (!text) return {};
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      // Some hosts expose extraData as a URL query string.
    }

    const query: Record<string, string> = {};
    for (const part of text.replace(/^\?/, "").split("&")) {
      const separator = part.indexOf("=");
      if (separator < 0) continue;
      try {
        const key = decodeURIComponent(part.slice(0, separator));
        const rawValue = part.slice(separator + 1);
        query[key] = decodeURIComponent(rawValue.replace(/\+/g, " "));
      } catch {
        // Ignore malformed query fragments and keep the remaining markers.
      }
    }
    return query;
  }

  private static normalizeContentId(value: any): string {
    const text = String(value ?? "").trim();
    if (!text) return "";
    try {
      return decodeURIComponent(text).trim();
    } catch {
      return text;
    }
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
