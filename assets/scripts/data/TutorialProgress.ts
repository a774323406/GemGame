import { sys } from "cc";

interface TutorialProgressData {
  version: number;
  coreGuideDone: boolean;
  trayExpandUnlocked: boolean;
  trayExpandGuideDone: boolean;
}

const STORAGE_KEY = "gem_sort_tutorial_progress_v1";
const CURRENT_VERSION = 1;
const DEFAULT_DATA: TutorialProgressData = {
  version: CURRENT_VERSION,
  coreGuideDone: false,
  trayExpandUnlocked: false,
  trayExpandGuideDone: false,
};

/** 独立保存新手流程；道具的解锁、奖励和教学状态由 ToolInventory 原子化保存。 */
export class TutorialProgress {
  public static isCoreGuideDone(): boolean {
    return this.load().coreGuideDone;
  }

  public static completeCoreGuide(): void {
    const data = this.load();
    data.coreGuideDone = true;
    this.save(data);
  }

  public static isTrayExpandUnlocked(): boolean {
    return this.load().trayExpandUnlocked;
  }

  public static unlockTrayExpand(): void {
    const data = this.load();
    data.trayExpandUnlocked = true;
    this.save(data);
  }

  public static isTrayExpandGuideDone(): boolean {
    return this.load().trayExpandGuideDone;
  }

  public static completeTrayExpandGuide(): void {
    const data = this.load();
    data.trayExpandUnlocked = true;
    data.trayExpandGuideDone = true;
    this.save(data);
  }

  public static reset(): void {
    this.save({ ...DEFAULT_DATA });
  }

  private static load(): TutorialProgressData {
    const raw = sys.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_DATA };

    try {
      const saved = JSON.parse(raw) as Partial<TutorialProgressData>;
      return {
        version: CURRENT_VERSION,
        coreGuideDone: saved.coreGuideDone === true,
        trayExpandUnlocked: saved.trayExpandUnlocked === true,
        trayExpandGuideDone: saved.trayExpandGuideDone === true,
      };
    } catch {
      const data = { ...DEFAULT_DATA };
      this.save(data);
      return data;
    }
  }

  private static save(data: TutorialProgressData): void {
    sys.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }
}
