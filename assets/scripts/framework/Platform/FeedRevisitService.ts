import { sys } from "cc";
import { EnvTool } from "./sdk/EnvTool";
import {
  createFeedRevisitExtra,
  FEED_REVISIT_CONTENT_ID,
  FEED_REVISIT_LEGACY_CHALLENGE_LEVELS,
  FEED_REVISIT_PRODUCTION_DELAY_MS,
  FEED_REVISIT_SCENE,
  FEED_REVISIT_TEST_DELAY_MS,
  isFeedRevisitChallengeLevel,
  pickFeedRevisitChallengeLevel,
} from "./FeedRevisitConfig";

const STORAGE_READY_AT_KEY = "gem_sort_feed_revisit_ready_at_v1";
const STORAGE_CONTENT_ID_KEY = "gem_sort_feed_revisit_content_id_v1";
const STORAGE_REWARD_READY_AT_KEY = "gem_sort_feed_revisit_reward_ready_at_v2";

export type FeedSubscribeResult =
  | "subscribed"
  | "already-subscribed"
  | "login-required"
  | "rejected"
  | "not-configured"
  | "unsupported"
  | "failed";

export interface FeedRevisitInitResult {
  available: boolean;
  configured: boolean;
  loggedIn: boolean;
  subscribed: boolean;
  shouldShowSubscribeEntry: boolean;
}

/**
 * 抖音复访版的订阅与托管就绪数据。
 *
 * 当前项目使用平台托管的按时间判断能力，不需要自建 SPI 服务器。
 */
export class FeedRevisitService {
  private static loggedIn = false;
  private static subscribed = false;
  private static loginPromise: Promise<boolean> | null = null;
  private static schedulePromise: Promise<boolean> | null = null;
  private static scheduleContentId = "";
  private static scheduleIsForced = false;
  private static interactiveLoginPending = false;
  private static warnedMissingContentId = false;

  public static isConfigured(): boolean {
    return this.isValidContentId(FEED_REVISIT_CONTENT_ID);
  }

  public static async initialize(): Promise<FeedRevisitInitResult> {
    const api = this.getDouyinApi();
    const configured = this.isConfigured();
    const available = Boolean(
      api &&
        typeof api.login === "function" &&
        typeof api.checkFeedSubscribeStatus === "function" &&
        typeof api.requestFeedSubscribe === "function" &&
        typeof api.storeFeedData === "function",
    );

    if (!configured) {
      this.warnMissingContentId();
      return {
        available,
        configured: false,
        loggedIn: false,
        subscribed: false,
        shouldShowSubscribeEntry: false,
      };
    }

    if (!available) {
      return {
        available: false,
        configured: true,
        loggedIn: false,
        subscribed: false,
        shouldShowSubscribeEntry: false,
      };
    }

    this.loggedIn = await this.ensureLogin(false);
    if (!this.loggedIn) {
      return {
        available: true,
        configured: true,
        loggedIn: false,
        subscribed: false,
        shouldShowSubscribeEntry: true,
      };
    }

    // 平台推荐制并不依赖用户订阅，因此登录成功后就确保事件已排期。
    void this.ensureImportantEventScheduled();
    this.subscribed = await this.checkSubscribeStatus();
    return {
      available: true,
      configured: true,
      loggedIn: true,
      subscribed: this.subscribed,
      shouldShowSubscribeEntry: !this.subscribed,
    };
  }

  /**
   * 必须直接从用户点击事件中调用。未登录时先完成宿主登录，用户需再次点击订阅。
   */
  public static requestSubscribeFromUserGesture(): Promise<FeedSubscribeResult> {
    const api = this.getDouyinApi();
    if (!this.isConfigured()) {
      this.warnMissingContentId();
      return Promise.resolve("not-configured");
    }
    if (
      !api ||
      typeof api.requestFeedSubscribe !== "function" ||
      typeof api.storeFeedData !== "function"
    ) {
      return Promise.resolve("unsupported");
    }
    if (this.subscribed) {
      return Promise.resolve("already-subscribed");
    }

    if (!this.loggedIn) {
      if (typeof api.login !== "function") return Promise.resolve("unsupported");
      if (this.interactiveLoginPending) return Promise.resolve("login-required");

      this.interactiveLoginPending = true;
      try {
        api.login({
          force: true,
          success: (result: any) => {
            this.loggedIn = result?.isLogin === true;
            if (this.loggedIn) void this.ensureImportantEventScheduled();
          },
          fail: (err: any) => console.warn("[FeedRevisit] 抖音登录失败", err),
          complete: () => {
            this.interactiveLoginPending = false;
          },
        });
      } catch (err) {
        this.interactiveLoginPending = false;
        console.warn("[FeedRevisit] tt.login 交互登录调用失败", err);
        return Promise.resolve("failed");
      }
      return Promise.resolve("login-required");
    }

    return new Promise<FeedSubscribeResult>((resolve) => {
      try {
        // 订阅弹窗必须与本次触摸同步拉起，不能在 await 之后调用。
        api.requestFeedSubscribe({
          type: "play",
          scene: FEED_REVISIT_SCENE,
          contentIDs: [FEED_REVISIT_CONTENT_ID],
          success: (result: any) => {
            if (result?.success === true) {
              this.subscribed = true;
              void this.ensureImportantEventScheduled();
              resolve("subscribed");
            } else {
              resolve("rejected");
            }
          },
          fail: (err: any) => {
            console.warn("[FeedRevisit] 请求挑战提醒订阅失败", err);
            resolve("failed");
          },
        });
      } catch (err) {
        console.warn("[FeedRevisit] requestFeedSubscribe 调用失败", err);
        resolve("failed");
      }
    });
  }

  /** 首次配置时只排期一次；事件已经到点后不会被普通启动向后顺延。 */
  public static async ensureImportantEventScheduled(): Promise<boolean> {
    const contentId = FEED_REVISIT_CONTENT_ID;
    if (!this.isValidContentId(contentId)) return false;

    const storedContentId = sys.localStorage.getItem(STORAGE_CONTENT_ID_KEY) || "";
    const storedReadyAt = Number(sys.localStorage.getItem(STORAGE_READY_AT_KEY) || 0);
    if (storedContentId === contentId && storedReadyAt > 0) {
      return true;
    }

    return this.scheduleImportantEvent(contentId, false);
  }

  /** 挑战完成后覆盖旧规则，测试版 60 秒、正式版 24 小时后再次就绪。 */
  public static scheduleNextImportantEvent(contentId = ""): void {
    const resolvedContentId = this.isValidContentId(contentId) ? contentId : FEED_REVISIT_CONTENT_ID;
    if (!this.isValidContentId(resolvedContentId)) {
      this.warnMissingContentId();
      return;
    }
    void this.scheduleImportantEvent(resolvedContentId, true);
  }

  /** 同一期回流挑战只允许领取一次奖励。 */
  public static claimChallengeReward(contentId = "", extra = ""): boolean {
    const resolvedContentId = String(contentId || "").trim();
    const readyAt = this.parseChallengeReadyAt(extra);
    if (
      !this.isValidContentId(FEED_REVISIT_CONTENT_ID) ||
      resolvedContentId !== FEED_REVISIT_CONTENT_ID ||
      readyAt <= 0
    ) {
      console.warn("[FeedRevisit] 回流参数不完整，本次挑战不发放奖励");
      return false;
    }

    const rewardState = this.readRewardReadyAtState();
    if (readyAt <= Number(rewardState[resolvedContentId] || 0)) return false;

    rewardState[resolvedContentId] = readyAt;
    sys.localStorage.setItem(STORAGE_REWARD_READY_AT_KEY, JSON.stringify(rewardState));
    return true;
  }

  private static scheduleImportantEvent(contentId: string, force: boolean): Promise<boolean> {
    if (this.schedulePromise) {
      const needsFollowUp =
        contentId !== this.scheduleContentId || (force && !this.scheduleIsForced);
      if (needsFollowUp) {
        return this.schedulePromise.then(() => this.scheduleImportantEvent(contentId, force));
      }
      return this.schedulePromise;
    }

    if (force) {
      // 先把旧排期标记为待更新；若网络失败，下次普通启动会自动重试。
      sys.localStorage.setItem(STORAGE_CONTENT_ID_KEY, contentId);
      sys.localStorage.removeItem(STORAGE_READY_AT_KEY);
    }

    const request = this.performScheduleImportantEvent(contentId, force);
    this.schedulePromise = request;
    this.scheduleContentId = contentId;
    this.scheduleIsForced = force;
    const clearScheduleRequest = () => {
      if (this.schedulePromise !== request) return;
      this.schedulePromise = null;
      this.scheduleContentId = "";
      this.scheduleIsForced = false;
    };
    void request.then(clearScheduleRequest, clearScheduleRequest);
    return request;
  }

  private static async performScheduleImportantEvent(
    contentId: string,
    force: boolean,
  ): Promise<boolean> {
    const api = this.getDouyinApi();
    if (!api || typeof api.storeFeedData !== "function") {
      console.warn("[FeedRevisit] 当前抖音版本或应用权限不支持 tt.storeFeedData");
      return false;
    }

    if (!this.loggedIn) {
      this.loggedIn = await this.ensureLogin(false);
      if (!this.loggedIn) return false;
    }

    if (!force) {
      const storedContentId = sys.localStorage.getItem(STORAGE_CONTENT_ID_KEY) || "";
      const storedReadyAt = Number(sys.localStorage.getItem(STORAGE_READY_AT_KEY) || 0);
      if (storedContentId === contentId && storedReadyAt > 0) return true;
    }

    const readyAt = Date.now() + this.getReadyDelayMs(api);
    const challengeLevel = pickFeedRevisitChallengeLevel();
    const challengeExtra = createFeedRevisitExtra(readyAt, challengeLevel);
    return new Promise<boolean>((resolve) => {
      try {
        api.storeFeedData({
          scene: FEED_REVISIT_SCENE,
          contentID: contentId,
          leftValue: "timeStampMs",
          operator: ">=",
          rightValue: String(readyAt),
          status: 1,
          extra: challengeExtra,
          success: () => {
            sys.localStorage.setItem(STORAGE_CONTENT_ID_KEY, contentId);
            sys.localStorage.setItem(STORAGE_READY_AT_KEY, String(readyAt));
            console.log(
              `[FeedRevisit] 每日挑战第 ${challengeLevel} 关已排期: ${new Date(readyAt).toISOString()}`,
            );
            resolve(true);
          },
          fail: (err: any) => {
            console.warn("[FeedRevisit] tt.storeFeedData 上报失败", err);
            resolve(false);
          },
        });
      } catch (err) {
        console.warn("[FeedRevisit] storeFeedData 调用失败", err);
        resolve(false);
      }
    });
  }

  private static checkSubscribeStatus(): Promise<boolean> {
    const api = this.getDouyinApi();
    if (!api || typeof api.checkFeedSubscribeStatus !== "function") {
      return Promise.resolve(false);
    }

    return new Promise<boolean>((resolve) => {
      try {
        api.checkFeedSubscribeStatus({
          type: "play",
          scene: FEED_REVISIT_SCENE,
          success: (result: any) => resolve(result?.status === true),
          fail: (err: any) => {
            console.warn("[FeedRevisit] 查询挑战提醒订阅状态失败", err);
            resolve(false);
          },
        });
      } catch (err) {
        console.warn("[FeedRevisit] checkFeedSubscribeStatus 调用失败", err);
        resolve(false);
      }
    });
  }

  private static ensureLogin(force: boolean): Promise<boolean> {
    if (this.loggedIn) return Promise.resolve(true);
    if (this.loginPromise) return this.loginPromise;

    const api = this.getDouyinApi();
    if (!api || typeof api.login !== "function") return Promise.resolve(false);

    const request = new Promise<boolean>((resolve) => {
      try {
        api.login({
          force,
          success: (result: any) => {
            this.loggedIn = result?.isLogin === true;
            resolve(this.loggedIn);
          },
          fail: (err: any) => {
            console.warn("[FeedRevisit] 抖音静默登录失败", err);
            resolve(false);
          },
        });
      } catch (err) {
        console.warn("[FeedRevisit] tt.login 调用失败", err);
        resolve(false);
      }
    });
    this.loginPromise = request;
    const clearLoginRequest = () => {
      if (this.loginPromise === request) this.loginPromise = null;
    };
    void request.then(clearLoginRequest, clearLoginRequest);
    return request;
  }

  private static parseChallengeReadyAt(extra: string): number {
    if (!extra) return 0;
    try {
      const data = JSON.parse(extra);
      const challengeLevel = Number(data?.level);
      const isLegacyChallenge = (
        FEED_REVISIT_LEGACY_CHALLENGE_LEVELS as readonly number[]
      ).indexOf(challengeLevel) >= 0;
      if (
        data?.event !== "daily_gem_challenge" ||
        (!isFeedRevisitChallengeLevel(challengeLevel) && !isLegacyChallenge) ||
        !Number.isFinite(Number(data?.readyAt))
      ) {
        return 0;
      }
      return Math.max(0, Number(data.readyAt));
    } catch {
      return 0;
    }
  }

  private static readRewardReadyAtState(): Record<string, number> {
    try {
      const value = JSON.parse(sys.localStorage.getItem(STORAGE_REWARD_READY_AT_KEY) || "{}");
      return value && typeof value === "object" ? value : {};
    } catch {
      return {};
    }
  }

  private static getReadyDelayMs(api: any): number {
    try {
      const envType = api.getEnvInfoSync?.()?.microapp?.envType;
      if (envType === "development" || envType === "preview") {
        return FEED_REVISIT_TEST_DELAY_MS;
      }
    } catch (err) {
      console.warn("[FeedRevisit] 获取运行环境失败，使用正式排期", err);
    }
    return FEED_REVISIT_PRODUCTION_DELAY_MS;
  }

  private static isValidContentId(contentId: string): boolean {
    return /^content[a-z0-9_-]+$/i.test(String(contentId || "").trim());
  }

  private static warnMissingContentId() {
    if (this.warnedMissingContentId) return;
    this.warnedMissingContentId = true;
    console.warn(
      "[FeedRevisit] 尚未配置 Content ID；请在 FeedRevisitConfig.ts 填入复访方案生成的 CONTENT...",
    );
  }

  private static getDouyinApi(): any | null {
    if (!EnvTool.isByteDanceMiniGame()) return null;
    return EnvTool.getMiniGameApi() || null;
  }
}
