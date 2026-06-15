/**
 * 音效、音乐管理工具
 * 功能说明：
 * - 注册全局音效事件监听
 * - 统一管理背景音乐和音效播放
 * - 根据用户设置控制音效开关
 */

import { _decorator, director, AudioClip, AudioSource, Node } from "cc";
import gameStorage from "./gameStorage";
import gamePrefabMgr, { soundName } from "../gamePrefabMgr";
import { ResourceManager } from "./ResourceManager";

export default class AudioManager {
  // 背景音乐的 AudioSource 组件
  private static bgmAudioSource: AudioSource | null = null;
  // 音效的 AudioSource 组件
  private static effectAudioSource: AudioSource | null = null;
  // 音频管理节点
  private static audioNode: Node | null = null;
  private static hasSetSoundEvent: boolean = false;
  /** 当前正在播放的背景音乐名称，避免同一首 BGM 反复从头播放 */
  private static currentBgmName: soundName | null = null;
  /** 音效兜底加载队列，避免同一个音效被重复加载 */
  private static effectClipLoadingMap = new Map<string, Promise<AudioClip | null>>();
  /**
   * 初始化音频组件
   * 创建用于播放背景音乐和音效的 AudioSource 组件
   */
  private static initAudioSources() {
    if (!this.audioNode) {
      // 创建一个持久的音频管理节点
      // 使用 director.addPersistRootNode 保证节点在场景切换时不被销毁
      this.audioNode = new Node("AudioManager");
      director.addPersistRootNode(this.audioNode);
      // 创建背景音乐 AudioSource
      this.bgmAudioSource = this.audioNode.addComponent(AudioSource);
      this.bgmAudioSource.loop = true;
      this.bgmAudioSource.volume = 1;
      // 创建音效 AudioSource
      this.effectAudioSource = this.audioNode.addComponent(AudioSource);
      this.effectAudioSource.loop = false;
      this.effectAudioSource.volume = 1;
    }
  }

  /**
   * 初始化振动事件监听
   * 注册各种游戏操作的振动反馈
   */
  private static initVibrateEvents() {
    // 轻微振动（点击反馈）- 10ms
    director.on(
      "vibrate_light",
      () => {
        this.vibrate(10);
      },
      this,
    );

    // 中等振动（答对/成功）- 30ms
    director.on(
      "vibrate_medium",
      () => {
        this.vibrate(30);
      },
      this,
    );

    // 强烈振动（失败/错误）- 50ms
    director.on(
      "vibrate_heavy",
      () => {
        this.vibrate(50);
      },
      this,
    );

    // 特殊振动模式（胜利）- 多次短振
    director.on(
      "vibrate_success",
      () => {
        this.vibratePattern([50, 30, 50]);
      },
      this,
    );
  }

  /**
   * 设置音效事件监听
   * 注册全局事件，其他模块通过 director.emit() 触发音效播放
   */
  static setSoundEvent() {
    if (this.hasSetSoundEvent) {
      return;
    }

    this.hasSetSoundEvent = true;

    this.initAudioSources();
    this.initVibrateEvents();

    /**
     * 批量注册普通音效。
     *
     * 用法：
     * director.emit(soundName.puzzleMove);
     * director.emit(soundName.puzzleFinish);
     * director.emit(soundName.buttonClick);
     */
    this.registerSoundNameEvents();
    this.registerGemMoveSoundEvents();

    /**
     * 兼容旧的 click 事件。
     *
     * 你现在 ButtonSound 里用的是 director.emit("click")，
     * 但真正按钮音效资源是 buttonClick。
     */
    director.on(
      "click",
      () => {
        this.playEffect(soundName.buttonClick);
        this.vibrate(10);
      },
      this,
    );

    /**
     * 默认主界面 BGM。
     * 兼容旧写法：director.emit("bgm")
     */
    director.on(
      "bgm",
      () => {
        this.playMusic(soundName.bgm);
      },
      this,
    );

    /**
     * 拼图关卡 BGM。
     * 兼容旧写法：director.emit("puzzle_level_bgm")
     */
    director.on(
      "levelBgm",
      () => {
        // this.playMusic(soundName.levelBgm);
      },
      this,
    );

    /**
     * 兼容旧 game_bg0 ~ game_bg3。
     * 目前都播放 bgm。
     */
    for (let i = 0; i <= 3; i++) {
      director.on(
        `game_bg${i}`,
        () => {
          this.playMusic(soundName.bgm);
        },
        this,
      );
    }
  }
  /**
   * 批量注册 soundName 里的普通音效事件。
   *
   * 规则：
   * - enum soundName 的 value 就是事件名
   * - 例如：
   *   director.emit(soundName.puzzleMove)
   *   director.emit(soundName.puzzleFinish)
   *   director.emit(soundName.buttonClick)
   *
   * 注意：
   * - 这里只注册“音效”
   * - 背景音乐建议单独调用 playMusic，或者用特殊事件映射
   */
  private static registerSoundNameEvents() {
    // const musicSet = new Set<string>([soundName.bgm, soundName.levelBgm]);

    for (const key in soundName) {
      const eventName = (soundName as any)[key] as soundName;

      /**
       * 跳过 BGM。
       * 因为 BGM 要走 playMusic，不是 playEffect。
       */
      // if (musicSet.has(eventName)) {
      //   continue;
      // }

      director.on(
        eventName,
        () => {
          this.playEffectByName(eventName);
        },
        this,
      );
    }
  }
  /**
   * 钻石操作音效。
   *
   * up：点击钻石抬起时播放一次。
   * down：钻石真实移动到另一个位置时播放一次。
   *
   * 这里不用强依赖 soundName 枚举，避免你只新增了 res/sound/up、res/sound/down
   * 但忘记改 enum 时导致没有监听。
  */
  private static registerGemMoveSoundEvents() {
    const soundEvents = new Set<string>();
    for (const key in soundName) {
      if (Object.prototype.hasOwnProperty.call(soundName, key)) {
        soundEvents.add((soundName as any)[key] as string);
      }
    }

    if (!soundEvents.has("up")) {
      director.on(
        "up",
        () => {
          this.playEffectByName("up");
        },
        this,
      );
    }

    if (!soundEvents.has("down")) {
      director.on(
        "down",
        () => {
          this.playEffectByName("down");
        },
        this,
      );
    }
  }

  /**
   * 按字符串播放音效。
   *
   * 兼容两种情况：
   * 1. gamePrefabMgr 已经预加载 soundRes[name]。
   * 2. 没有预加载时，第一次播放会从 res/sound/name 兜底加载。
   */
  static async playEffectByName(name: string) {
    this.initAudioSources();

    if (!this.effectAudioSource) {
      return;
    }

    if (!this.canPlaySound()) {
      return;
    }

    let clip = gamePrefabMgr.Instance.soundRes[name] as AudioClip;

    if (!clip) {
      clip = await this.loadEffectClipByName(name);
    }

    if (!clip || !this.effectAudioSource) {
      return;
    }

    if (!this.canPlaySound()) {
      return;
    }

    this.effectAudioSource.playOneShot(clip, 1);
  }

  private static async loadEffectClipByName(name: string): Promise<AudioClip | null> {
    const cachedClip = gamePrefabMgr.Instance.soundRes[name] as AudioClip;

    if (cachedClip) {
      return cachedClip;
    }

    if (this.effectClipLoadingMap.has(name)) {
      return this.effectClipLoadingMap.get(name)!;
    }

    const task = (async () => {
      try {
        await ResourceManager.ins.loadBundle("res");
        const clip = await ResourceManager.ins.loadBundleAsset<AudioClip>("res", `sound/${name}`, AudioClip);

        if (clip) {
          gamePrefabMgr.Instance.soundRes[name] = clip;
        }

        return clip || null;
      } catch (err) {
        console.warn(`[AudioManager] 音效资源 ${name} 加载失败`, err);
        return null;
      } finally {
        this.effectClipLoadingMap.delete(name);
      }
    })();

    this.effectClipLoadingMap.set(name, task);
    return task;
  }

  /**
   * 播放背景音乐
   * @param name 音乐名称
   *
   * 规则：
   * - 音乐开关关闭时，任何地方调用都不播放
   * - 同一首 BGM 已经在播时，不重新从头播放
   */
  static playMusic(name: soundName) {
    this.initAudioSources();

    if (!this.bgmAudioSource) {
      return;
    }

    /**
     * 关键：
     * 最底层做一次音乐开关判断。
     * 这样不管是 director.emit("bgm")、playDefaultBgm、resumeBgmAfterVideo，
     * 还是其他地方直接 playMusic，都不会绕过设置。
     */
    if (!this.canPlayMusic()) {
      this.stopMusic();
      return;
    }

    const clip = gamePrefabMgr.Instance.soundRes[name] as AudioClip;

    if (clip) {
      /**
       * 如果当前已经是同一个 clip，就不要重新播放。
       * 避免切场景回 StartScene 时 BGM 从头开始。
       */
      if (this.bgmAudioSource.clip === clip) {
        if (!(this.bgmAudioSource as any).playing) {
          this.bgmAudioSource.play();
        }
        return;
      }

      this.bgmAudioSource.stop();
      this.bgmAudioSource.clip = clip;
      this.bgmAudioSource.loop = true;
      this.bgmAudioSource.play();
      return;
    }

    console.warn(`[AudioManager] 音频资源 ${name} 尚未加载，1秒后重试`);

    setTimeout(() => {
      if (!this.canPlayMusic()) {
        this.stopMusic();
        return;
      }

      const retryClip = gamePrefabMgr.Instance.soundRes[name] as AudioClip;

      if (!retryClip || !this.bgmAudioSource) {
        return;
      }

      if (this.bgmAudioSource.clip === retryClip) {
        if (!(this.bgmAudioSource as any).playing) {
          this.bgmAudioSource.play();
        }
        return;
      }

      console.log(`[AudioManager] 重试播放背景音乐成功: ${name}`);

      this.bgmAudioSource.stop();
      this.bgmAudioSource.clip = retryClip;
      this.bgmAudioSource.loop = true;
      this.bgmAudioSource.play();
    }, 1000);
  }

  /**
   * 播放音效
   * @param name 音效名称
   */
  static playEffect(name: soundName) {
    this.playEffectByName(name);
  }

  /**
   * 停止当前背景音乐
   */
  static stopMusic() {
    if (this.bgmAudioSource) {
      this.bgmAudioSource.stop();
      this.bgmAudioSource.clip = null;
    }
  }

  /**
   * 停止所有音效
   */
  static stopAllEffects() {
    if (this.effectAudioSource) {
      this.effectAudioSource.stop();
    }
  }

  /**
   * 暂停所有音频
   */
  static pauseAll() {
    if (this.bgmAudioSource) {
      this.bgmAudioSource.pause();
    }
    if (this.effectAudioSource) {
      this.effectAudioSource.pause();
    }
  }

  /**
   * 恢复所有音频
   */
  static resumeAll() {
    if (this.bgmAudioSource && this.bgmAudioSource.clip) {
      this.bgmAudioSource.play();
    }
    if (this.effectAudioSource && this.effectAudioSource.clip) {
      this.effectAudioSource.play();
    }
  }

  /**
   * 触发振动
   * @param duration 振动持续时间（毫秒）
   */
  static vibrate(duration: number = 30) {
    // 检查振动开关：0为开启，1为关闭
    if (gameStorage.getzhendong() == 1) return;

    // 使用Web Vibration API（支持大多数移动浏览器）
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(duration);
      // console.log(`[振动] ${duration}ms`)
    }

    // 抖音小游戏平台振动
    // @ts-ignore
    if (typeof tt !== "undefined" && tt.vibrateShort) {
      // @ts-ignore
      tt.vibrateShort({
        success() {
          // console.log('[振动] 抖音平台振动成功')
        },
      });
    }

    // 微信小游戏平台振动
    // @ts-ignore
    // if (typeof wx !== "undefined" && wx.vibrateShort) {
    //   // @ts-ignore
    //   wx.vibrateShort({
    //     success() {
    //       console.log("[振动] 微信平台振动成功");
    //     },
    //   });
    // }
  }
  /**
   * 播放默认背景音乐
   */
  static playDefaultBgm() {
    this.setSoundEvent();

    if (!this.canPlayMusic()) {
      this.stopMusic();
      return;
    }

    this.playMusic(soundName.bgm);
  }
  /**
   * 视频播放期间暂停背景音乐
   *
   * 用途：
   * - 通关视频
   * - 原始故事视频
   *
   * 注意：
   * - 这里只暂停 BGM，不暂停音效
   * - 视频播完或者界面关闭后，调用 resumeBgmAfterVideo()
   */
  static pauseBgmForVideo() {
    this.initAudioSources();

    if (!this.bgmAudioSource) {
      return;
    }

    if (this.bgmAudioSource.clip) {
      this.bgmAudioSource.pause();
    }
  }

  /**
   * 视频结束后恢复背景音乐
   */
  static resumeBgmAfterVideo() {
    this.initAudioSources();

    if (!this.canPlayMusic()) {
      this.stopMusic();
      return;
    }

    if (this.bgmAudioSource && this.bgmAudioSource.clip) {
      this.bgmAudioSource.play();
      setTimeout(() => {
        if (this.canPlayMusic() && this.bgmAudioSource?.clip && !(this.bgmAudioSource as any).playing) {
          this.bgmAudioSource.play();
        }
      }, 300);
      return;
    }

    this.playDefaultBgm();
  }

  private static canPlayMusic(): boolean {
    return gameStorage.getMusic() !== 1;
  }
  /**
   * 当前是否允许播放音效
   *
   * gameStorage.getSound():
   * 0 = 开启音效
   * 1 = 关闭音效
   */
  static canPlaySound(): boolean {
    return gameStorage.getSound() !== 1;
  }

  /**
   * 获取视频音量
   *
   * 用途：
   * - VideoPlayer 不走 AudioSource 音效播放
   * - 所以视频声音需要单独根据 soundBtn 设置 volume
   */
  static getVideoVolume(): number {
    return this.canPlaySound() ? 1 : 0;
  }
  /**
   * 触发振动模式（多次振动）
   * @param pattern 振动模式数组，如 [50, 30, 50] 表示振50ms，停30ms，再振50ms
   */
  static vibratePattern(pattern: number[]) {
    // 检查振动开关
    if (gameStorage.getzhendong() == 1) return;

    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(pattern);
      console.log(`[振动模式] ${pattern.join(",")}`);
    }
  }
}
