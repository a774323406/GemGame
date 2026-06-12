import { Prefab, AudioClip } from "cc";
import { ResourceManager } from "./framework/ResourceManager";

export enum uiName {
  settingPanel = "settingPanel",
  tipsPanel = "tipsPanel",
  passPanel = "passPanel",
  failPanel = "failPanel",
}

export enum soundName {
  bgm = "bgm",
  buttonClick = "buttonClick",
  fail = "fail",
  levelBgm = "levelBgm",
  up = "up",
  down = "down",
}

const UI_PREFAB_UUIDS: Partial<Record<uiName, string>> = {
  [uiName.passPanel]: "65eb9f3d-bf6f-4aee-ad4b-0fa7a52134fa",
  [uiName.failPanel]: "531ebd07-e609-43e5-95d5-f1924f345cf6",
};

type LoadTask = {
  desc: string;
  loader: () => Promise<void>;
};

export default class gamePrefabMgr {
  private static __instance: gamePrefabMgr;

  public static get Instance() {
    if (this.__instance == null) {
      this.__instance = new gamePrefabMgr();
    }

    return this.__instance;
  }

  private inited = false;

  /**
   * 已完成数量
   */
  public jilv = 0;

  /**
   * 总加载数量
   */
  public allResNum = 0;

  /**
   * UI 预制体缓存
   */
  public uiPre: { [key: string]: Prefab } = {};

  /**
   * 音效缓存
   */
  public soundRes: { [key: string]: AudioClip } = {};

  private loadCompleteCallbacks: (() => void)[] = [];

  private loadTasks: LoadTask[] = [];

  /**
   * 初始化加载器状态
   */
  public resetLoadState() {
    this.jilv = 0;
    this.allResNum = 0;
    this.loadTasks.length = 0;
    this.loadCompleteCallbacks.length = 0;
    this.inited = false;
  }

  /**
   * 注册一个加载任务
   */
  private addTask(desc: string, loader: () => Promise<void>) {
    this.loadTasks.push({
      desc,
      loader,
    });

    this.allResNum = this.loadTasks.length;
  }

  /**
   * 通用 bundle 加载任务
   *
   * 以后你有其他 bundle，就在 loadScene 里面：
   * await gamePrefabMgr.Instance.loadBundle("xxx");
   */
  public async loadBundle(bundleName: string) {
    this.addTask(`加载 Bundle: ${bundleName}`, async () => {
      await ResourceManager.ins.loadBundle(bundleName);
    });

    await this.runLatestTask();
  }

  /**
   * 加载默认资源
   *
   * 这里会加载：
   * 1. uiName 里的所有 UI prefab
   * 2. soundName 里的所有音效
   */
  public async loadDefaultAssets(onComplete?: () => void) {
    if (this.inited) {
      if (onComplete) {
        if (this.isLoadComplete()) {
          onComplete();
        } else {
          this.loadCompleteCallbacks.push(onComplete);
        }
      }
      return;
    }

    this.inited = true;

    if (onComplete) {
      this.loadCompleteCallbacks.push(onComplete);
    }

    this.addUITasks("res");
    this.addSoundTasks("res");

    await this.runRemainTasks();

    this.callLoadCompleteCallbacks();
  }

  /**
   * 兼容你之前的 Initial 写法
   */
  public async Initial(onComplete?: () => void) {
    await this.loadDefaultAssets(onComplete);
  }

  /**
   * 添加 UI prefab 加载任务
   */
  private addUITasks(bundleName: string) {
    for (const key in uiName) {
      if (!Object.prototype.hasOwnProperty.call(uiName, key)) {
        continue;
      }

      const uiname = (uiName as any)[key] as string;
      const path = "prefab/ui/" + uiname;

      this.addTask(`加载 UI: ${uiname}`, async () => {
        console.log("[gamePrefabMgr] 开始加载 UI =", uiname, "path =", path);

        let asset: Prefab;
        try {
          asset = await ResourceManager.ins.loadBundleAsset<Prefab>(bundleName, path, Prefab);
        } catch (pathError) {
          const uuid = UI_PREFAB_UUIDS[uiname as uiName];
          if (!uuid) throw pathError;
          asset = await ResourceManager.ins.loadAssetByUuid<Prefab>(uuid);
        }

        if (!asset) {
          throw new Error(`[gamePrefabMgr] UI 资源为空: ${uiname}, path=${path}`);
        }

        this.uiPre[uiname] = asset;

        console.log("[gamePrefabMgr] UI加载成功 =", uiname);
      });
    }
  }

  /**
   * 添加音效加载任务
   *
   * 你的目录是：
   * assets/res/sound/bgm
   * assets/res/sound/buttonClick
   * assets/res/sound/fail
   * assets/res/sound/levelBgm
   *
   * 所以路径就是：
   * sound/bgm
   * sound/buttonClick
   * sound/fail
   * sound/levelBgm
   */
  private addSoundTasks(bundleName: string) {
    for (const key in soundName) {
      if (!Object.prototype.hasOwnProperty.call(soundName, key)) {
        continue;
      }

      const sname = (soundName as any)[key] as string;
      const path = "sound/" + sname;

      this.addTask(`加载音效: ${sname}`, async () => {
        console.log("[gamePrefabMgr] 开始加载音效 =", sname, "path =", path);

        const asset = await ResourceManager.ins.loadBundleAsset<AudioClip>(bundleName, path, AudioClip);

        if (!asset) {
          throw new Error(`[gamePrefabMgr] 音效资源为空: ${sname}, path=${path}`);
        }

        this.soundRes[sname] = asset;

        console.log("[gamePrefabMgr] 音效加载成功 =", sname);
      });
    }
  }

  /**
   * 执行最新添加的一个任务
   *
   * 用于：
   * await gamePrefabMgr.Instance.loadBundle("res");
   * await gamePrefabMgr.Instance.loadBundle("xxx");
   */
  private async runLatestTask() {
    const task = this.loadTasks[this.loadTasks.length - 1];

    if (!task) {
      return;
    }

    await this.runTask(task);
  }

  /**
   * 执行还没执行的任务
   */
  private async runRemainTasks() {
    while (this.jilv < this.loadTasks.length) {
      const task = this.loadTasks[this.jilv];

      if (!task) {
        break;
      }

      await this.runTask(task);
    }
  }

  /**
   * 执行单个任务
   */
  private async runTask(task: LoadTask) {
    console.log("[gamePrefabMgr]", task.desc);

    try {
      await task.loader();
    } catch (err) {
      console.error("[gamePrefabMgr] 加载失败:", task.desc, err);
      throw err;
    } finally {
      this.jilv++;
      this.allResNum = this.loadTasks.length;
      console.log("[gamePrefabMgr] 进度:", this.jilv, "/", this.allResNum);
    }
  }

  private callLoadCompleteCallbacks() {
    while (this.loadCompleteCallbacks.length > 0) {
      const callback = this.loadCompleteCallbacks.shift();

      if (callback) {
        callback();
      }
    }
  }

  /**
   * 获取资源加载进度
   *
   * 返回 0 - 100
   */
  public getLoadProgress(): number {
    if (this.allResNum <= 0) {
      return 0;
    }

    return Math.floor((this.jilv / this.allResNum) * 100);
  }

  /**
   * 是否加载完成
   */
  public isLoadComplete(): boolean {
    return this.allResNum > 0 && this.jilv >= this.allResNum;
  }
}
