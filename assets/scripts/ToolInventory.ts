import { _decorator, Component, sys } from "cc";

const { ccclass } = _decorator;

export type ToolId = "magic" | "brush" | "magnet";

export interface ToolInventorySnapshot {
  magic: number;
  brush: number;
  magnet: number;
}

export interface ToolFlagSnapshot {
  magic: boolean;
  brush: boolean;
  magnet: boolean;
}

interface ToolInventoryData extends ToolInventorySnapshot {
  unlocked: ToolFlagSnapshot;
  rewardGranted: ToolFlagSnapshot;
  rewardPresented: ToolFlagSnapshot;
  guideDone: ToolFlagSnapshot;
}

const STORAGE_KEY = "gem_sort_tool_inventory_v1";
const DEFAULT_INVENTORY: ToolInventorySnapshot = {
  magic: 0,
  brush: 0,
  magnet: 0,
};
const DEFAULT_FLAGS: ToolFlagSnapshot = {
  magic: false,
  brush: false,
  magnet: false,
};

@ccclass("ToolInventory")
export class ToolInventory extends Component {
  public static readonly MAX_COUNT = 3;

  public static getAll(): ToolInventorySnapshot {
    const data = ToolInventory.load();
    return {
      magic: data.magic,
      brush: data.brush,
      magnet: data.magnet,
    };
  }

  public static getCount(tool: ToolId): number {
    return ToolInventory.load()[tool];
  }

  public static has(tool: ToolId, amount = 1): boolean {
    return ToolInventory.getCount(tool) >= ToolInventory.normalizeAmount(amount);
  }

  /**
   * 只增加库存，不改变 unlocked/guideDone 等进度标记。
   * 分享、活动等提前发放的道具会先存入背包，仍需到正式解锁关卡后才能使用。
   */
  public static add(tool: ToolId, amount = 1): number {
    const inventory = ToolInventory.load();
    inventory[tool] = ToolInventory.clampStoredCount(
      inventory[tool] + ToolInventory.normalizeAmount(amount),
    );
    ToolInventory.save(inventory);
    return inventory[tool];
  }

  public static addMany(reward: Partial<ToolInventorySnapshot>): ToolInventorySnapshot {
    const inventory = ToolInventory.load();
    for (const tool of ToolInventory.tools()) {
      inventory[tool] = ToolInventory.clampStoredCount(
        inventory[tool] + ToolInventory.normalizeAmount(reward[tool] || 0),
      );
    }
    ToolInventory.save(inventory);
    return {
      magic: inventory.magic,
      brush: inventory.brush,
      magnet: inventory.magnet,
    };
  }

  public static consume(tool: ToolId, amount = 1): boolean {
    const cost = ToolInventory.normalizeAmount(amount);
    const inventory = ToolInventory.load();
    if (inventory[tool] < cost) return false;

    inventory[tool] -= cost;
    ToolInventory.save(inventory);
    return true;
  }

  public static setCount(tool: ToolId, amount: number): number {
    const inventory = ToolInventory.load();
    inventory[tool] = ToolInventory.clampStoredCount(amount);
    ToolInventory.save(inventory);
    return inventory[tool];
  }

  public static isUnlocked(tool: ToolId): boolean {
    return ToolInventory.load().unlocked[tool] === true;
  }

  public static unlock(tool: ToolId): boolean {
    const inventory = ToolInventory.load();
    if (inventory.unlocked[tool]) return false;

    inventory.unlocked[tool] = true;
    ToolInventory.save(inventory);
    return true;
  }

  public static isUnlockRewardGranted(tool: ToolId): boolean {
    return ToolInventory.load().rewardGranted[tool] === true;
  }

  public static isUnlockRewardPresented(tool: ToolId): boolean {
    return ToolInventory.load().rewardPresented[tool] === true;
  }

  public static markUnlockRewardPresented(tool: ToolId): void {
    const inventory = ToolInventory.load();
    if (inventory.rewardPresented[tool]) return;

    inventory.rewardPresented[tool] = true;
    ToolInventory.save(inventory);
  }

  /**
   * 首次解锁时一次性写入解锁、奖励发放标记和数量。
   * 先落存档再播放引导表现，退出重进不会重复领奖或丢失奖励。
   */
  public static grantUnlockReward(tool: ToolId, amount = 1): boolean {
    const inventory = ToolInventory.load();
    if (inventory.rewardGranted[tool]) {
      if (!inventory.unlocked[tool]) {
        inventory.unlocked[tool] = true;
        ToolInventory.save(inventory);
      }
      return false;
    }

    inventory.unlocked[tool] = true;
    inventory.rewardGranted[tool] = true;
    inventory[tool] = ToolInventory.clampStoredCount(
      inventory[tool] + ToolInventory.normalizeAmount(amount),
    );
    ToolInventory.save(inventory);
    return true;
  }

  public static isGuideDone(tool: ToolId): boolean {
    return ToolInventory.load().guideDone[tool] === true;
  }

  public static markGuideDone(tool: ToolId): void {
    const inventory = ToolInventory.load();
    if (inventory.guideDone[tool]) return;

    inventory.guideDone[tool] = true;
    inventory.unlocked[tool] = true;
    ToolInventory.save(inventory);
  }

  public static reset() {
    ToolInventory.save(ToolInventory.createDefaultData());
  }

  private static load(): ToolInventoryData {
    const inventory = ToolInventory.createDefaultData();
    const raw = sys.localStorage.getItem(STORAGE_KEY);
    if (!raw) return inventory;

    try {
      const saved = JSON.parse(raw) as Partial<ToolInventoryData>;
      for (const tool of ToolInventory.tools()) {
        inventory[tool] = ToolInventory.clampStoredCount(saved[tool] || 0);
        inventory.unlocked[tool] = saved.unlocked?.[tool] === true;
        inventory.rewardGranted[tool] = saved.rewardGranted?.[tool] === true;
        inventory.rewardPresented[tool] = saved.rewardPresented?.[tool] === true;
        inventory.guideDone[tool] = saved.guideDone?.[tool] === true;
      }
    } catch {
      ToolInventory.save(inventory);
    }

    return inventory;
  }

  private static save(inventory: ToolInventoryData) {
    sys.localStorage.setItem(STORAGE_KEY, JSON.stringify(inventory));
  }

  private static createDefaultData(): ToolInventoryData {
    return {
      ...DEFAULT_INVENTORY,
      unlocked: { ...DEFAULT_FLAGS },
      rewardGranted: { ...DEFAULT_FLAGS },
      rewardPresented: { ...DEFAULT_FLAGS },
      guideDone: { ...DEFAULT_FLAGS },
    };
  }

  private static tools(): ToolId[] {
    return ["magic", "brush", "magnet"];
  }

  private static normalizeAmount(amount: number): number {
    return Math.max(0, Math.floor(Number(amount) || 0));
  }

  private static clampStoredCount(amount: number): number {
    return Math.min(ToolInventory.MAX_COUNT, ToolInventory.normalizeAmount(amount));
  }
}
