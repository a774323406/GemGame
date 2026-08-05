import { sys } from "cc";
import { ToolInventory } from "../../ToolInventory";

export const SHARE_PASS_BONUS_SECONDS = 10;
export const SHARE_FAIL_REVIVE_SECONDS = 30;

export interface ShareActionResult {
  success: boolean;
  rewarded: boolean;
}

interface ShareRewardData {
  dateKey: string;
  homeRewardClaimed: boolean;
  passRewardClaimed: boolean;
  failRewardClaimed: boolean;
  pendingNextLevelBonusSeconds: number;
}

const STORAGE_KEY = "gem_sort_share_rewards_v1";

/**
 * 无服务端版本的每日分享奖励状态。
 *
 * 每日资格使用本机自然日，在启动、回到前台和领奖前都会重新读取。系统时间
 * 回拨时不重置资格，避免简单回拨重复领奖；清存档和跨设备无法彻底防刷。
 */
export class ShareRewardService {
  public static isHomeRewardAvailable(): boolean {
    return !this.load().homeRewardClaimed;
  }

  public static isPassRewardAvailable(): boolean {
    return !this.load().passRewardClaimed;
  }

  public static isFailRewardAvailable(): boolean {
    return !this.load().failRewardClaimed;
  }

  public static claimHomeMagicReward(): boolean {
    const data = this.load();
    if (data.homeRewardClaimed) return false;
    if (ToolInventory.getCount("magic") >= ToolInventory.MAX_COUNT) return false;

    data.homeRewardClaimed = true;
    this.save(data);
    ToolInventory.add("magic", 1);
    return true;
  }

  public static claimPassBonus(): boolean {
    const data = this.load();
    if (data.passRewardClaimed) return false;

    data.passRewardClaimed = true;
    data.pendingNextLevelBonusSeconds = SHARE_PASS_BONUS_SECONDS;
    this.save(data);
    return true;
  }

  public static consumeNextLevelBonus(): number {
    const data = this.load();
    const bonus = Math.max(0, Math.floor(Number(data.pendingNextLevelBonusSeconds) || 0));
    if (bonus <= 0) return 0;

    data.pendingNextLevelBonusSeconds = 0;
    this.save(data);
    return bonus;
  }

  public static claimFailRevive(): boolean {
    const data = this.load();
    if (data.failRewardClaimed) return false;

    data.failRewardClaimed = true;
    this.save(data);
    return true;
  }

  public static refreshDailyState(): void {
    this.load();
  }

  private static load(): ShareRewardData {
    const today = this.getLocalDateKey();
    let data = this.createDefault(today);
    const raw = sys.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const saved = JSON.parse(raw) as Partial<ShareRewardData>;
        data = {
          dateKey: typeof saved.dateKey === "string" && saved.dateKey ? saved.dateKey : today,
          homeRewardClaimed: saved.homeRewardClaimed === true,
          passRewardClaimed: saved.passRewardClaimed === true,
          failRewardClaimed: saved.failRewardClaimed === true,
          pendingNextLevelBonusSeconds: Math.max(
            0,
            Math.min(
              SHARE_PASS_BONUS_SECONDS,
              Math.floor(Number(saved.pendingNextLevelBonusSeconds) || 0),
            ),
          ),
        };
      } catch {
        data = this.createDefault(today);
      }
    }

    // YYYY-MM-DD 可以直接按字典序比较。回拨日期不重置，跨到未来自然日才重置。
    if (!data.dateKey || today > data.dateKey) {
      data.dateKey = today;
      data.homeRewardClaimed = false;
      data.passRewardClaimed = false;
      data.failRewardClaimed = false;
    }
    this.save(data);
    return data;
  }

  private static save(data: ShareRewardData): void {
    sys.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  private static createDefault(dateKey: string): ShareRewardData {
    return {
      dateKey,
      homeRewardClaimed: false,
      passRewardClaimed: false,
      failRewardClaimed: false,
      pendingNextLevelBonusSeconds: 0,
    };
  }

  private static getLocalDateKey(): string {
    const now = new Date();
    const year = now.getFullYear();
    const monthValue = now.getMonth() + 1;
    const dayValue = now.getDate();
    const month = monthValue < 10 ? `0${monthValue}` : String(monthValue);
    const day = dayValue < 10 ? `0${dayValue}` : String(dayValue);
    return `${year}-${month}-${day}`;
  }
}
