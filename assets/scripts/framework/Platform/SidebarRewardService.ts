import { sys } from "cc";
import { ToolInventory } from "../../ToolInventory";
import { EnvTool } from "./sdk/EnvTool";

export interface SidebarRewardState {
  supported: boolean;
  checking: boolean;
  returnedFromSidebar: boolean;
  claimed: boolean;
  canClaim: boolean;
}

type SidebarStateListener = (state: SidebarRewardState) => void;

const CLAIMED_KEY = "gem_sort_sidebar_magic_reward_v1";

export class SidebarRewardService {
  private static initialized = false;
  private static checking = false;
  private static supported = false;
  private static returnedFromSidebar = false;
  private static listeners = new Set<SidebarStateListener>();

  public static init() {
    if (this.initialized) return;
    this.initialized = true;

    const api = this.getDouyinApi();
    if (!api) {
      // 编辑器和网页预览使用模拟模式，方便检查完整领取流程。
      this.supported = true;
      this.notify();
      return;
    }

    this.bindShowListener(api);
    this.captureSidebarLaunch(api.getLaunchOptionsSync?.());
  }

  public static async checkAvailability(): Promise<boolean> {
    this.init();
    const api = this.getDouyinApi();

    if (!api) {
      this.supported = true;
      this.notify();
      return true;
    }

    if (typeof api.checkScene !== "function") {
      this.supported = false;
      this.notify();
      return false;
    }

    this.checking = true;
    this.notify();

    return new Promise<boolean>((resolve) => {
      api.checkScene({
        scene: "sidebar",
        success: (res: any) => {
          this.checking = false;
          this.supported = !!res?.isExist;
          this.notify();
          resolve(this.supported);
        },
        fail: (err: any) => {
          console.warn("[SidebarReward] tt.checkScene failed", err);
          this.checking = false;
          this.supported = false;
          this.notify();
          resolve(false);
        },
      });
    });
  }

  public static async navigateToSidebar(): Promise<boolean> {
    this.init();
    const api = this.getDouyinApi();

    if (!api) {
      this.returnedFromSidebar = true;
      this.notify();
      return true;
    }

    if (!this.supported || typeof api.navigateToScene !== "function") {
      return false;
    }

    return new Promise<boolean>((resolve) => {
      api.navigateToScene({
        scene: "sidebar",
        success: () => resolve(true),
        fail: (err: any) => {
          console.warn("[SidebarReward] tt.navigateToScene failed", err);
          resolve(false);
        },
      });
    });
  }

  public static claimMagicWand(): boolean {
    if (!this.getState().canClaim) return false;

    ToolInventory.add("magic", 1);
    sys.localStorage.setItem(CLAIMED_KEY, "1");
    this.notify();
    return true;
  }

  public static getState(): SidebarRewardState {
    const claimed = sys.localStorage.getItem(CLAIMED_KEY) === "1";
    return {
      supported: this.supported,
      checking: this.checking,
      returnedFromSidebar: this.returnedFromSidebar,
      claimed,
      canClaim: this.supported && this.returnedFromSidebar && !claimed,
    };
  }

  public static addListener(listener: SidebarStateListener) {
    this.listeners.add(listener);
    listener(this.getState());
  }

  public static removeListener(listener: SidebarStateListener) {
    this.listeners.delete(listener);
  }

  private static getDouyinApi(): any | null {
    if (!EnvTool.isByteDanceMiniGame()) return null;
    return EnvTool.getMiniGameApi() || null;
  }

  private static bindShowListener(api: any) {
    if (typeof api.onShow !== "function") return;
    api.onShow((options: any) => {
      this.captureSidebarLaunch(options);
    });
  }

  private static captureSidebarLaunch(options: any) {
    if (options?.launch_from !== "homepage" || options?.location !== "sidebar_card") {
      return;
    }

    this.returnedFromSidebar = true;
    this.notify();
  }

  private static notify() {
    const state = this.getState();
    for (const listener of this.listeners) {
      listener(state);
    }
  }
}
