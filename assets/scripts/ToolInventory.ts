import { _decorator, Component, sys } from "cc";

const { ccclass } = _decorator;

export type ToolId = "magic" | "brush" | "magnet";

export interface ToolInventorySnapshot {
  magic: number;
  brush: number;
  magnet: number;
}

const STORAGE_KEY = "gem_sort_tool_inventory_v1";
const DEFAULT_INVENTORY: ToolInventorySnapshot = {
  magic: 0,
  brush: 0,
  magnet: 0,
};

@ccclass("ToolInventory")
export class ToolInventory extends Component {
  public static getAll(): ToolInventorySnapshot {
    return ToolInventory.load();
  }

  public static getCount(tool: ToolId): number {
    return ToolInventory.load()[tool];
  }

  public static has(tool: ToolId, amount = 1): boolean {
    return ToolInventory.getCount(tool) >= ToolInventory.normalizeAmount(amount);
  }

  public static add(tool: ToolId, amount = 1): number {
    const inventory = ToolInventory.load();
    inventory[tool] += ToolInventory.normalizeAmount(amount);
    ToolInventory.save(inventory);
    return inventory[tool];
  }

  public static addMany(reward: Partial<ToolInventorySnapshot>): ToolInventorySnapshot {
    const inventory = ToolInventory.load();
    for (const tool of ToolInventory.tools()) {
      inventory[tool] += ToolInventory.normalizeAmount(reward[tool] || 0);
    }
    ToolInventory.save(inventory);
    return inventory;
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
    inventory[tool] = ToolInventory.normalizeAmount(amount);
    ToolInventory.save(inventory);
    return inventory[tool];
  }

  public static reset() {
    ToolInventory.save({ ...DEFAULT_INVENTORY });
  }

  private static load(): ToolInventorySnapshot {
    const inventory = { ...DEFAULT_INVENTORY };
    const raw = sys.localStorage.getItem(STORAGE_KEY);
    if (!raw) return inventory;

    try {
      const saved = JSON.parse(raw) as Partial<ToolInventorySnapshot>;
      for (const tool of ToolInventory.tools()) {
        inventory[tool] = ToolInventory.normalizeAmount(saved[tool] || 0);
      }
    } catch {
      ToolInventory.save(inventory);
    }

    return inventory;
  }

  private static save(inventory: ToolInventorySnapshot) {
    sys.localStorage.setItem(STORAGE_KEY, JSON.stringify(inventory));
  }

  private static tools(): ToolId[] {
    return ["magic", "brush", "magnet"];
  }

  private static normalizeAmount(amount: number): number {
    return Math.max(0, Math.floor(Number(amount) || 0));
  }
}
