import { _decorator, Button, Component, director, Node, NodeEventType, Toggle, ToggleComponent } from "cc";
import UIBase from "../framework/ui/UIBase";
import gameStorage from "../framework/gameStorage";
import PlayData, { EventName } from "../data/PlayData";
import AudioManager from "../framework/AudioManager";
import { soundName } from "../gamePrefabMgr";
const { ccclass, property } = _decorator;

@ccclass("settingPanel")
export class settingPanel extends UIBase {
  @property(Button)
  closeBtn: Button = null;
  @property(Button)
  backBtn: Button = null;
  @property(Button)
  retryBtn: Button = null;
  @property(Toggle)
  musicBtn: Toggle | null = null;

  @property(Toggle)
  soundBtn: Toggle | null = null;
  @property(Toggle)
  shakeBtn: Toggle | null = null;
  enterType: number = 0; //进入方式 0:主界面 1:游戏界面
  private closeCallback: (() => void) | null = null;
  private retryCallback: (() => void) | null = null;
  private backCallback: (() => void) | null = null;
  private actionHandled = false;

  public onOpen(data?: any): void {
    this.actionHandled = false;
    this.closeCallback = typeof data?.onClose === "function" ? data.onClose : null;
    this.retryCallback = typeof data?.onRetry === "function" ? data.onRetry : null;
    this.backCallback = typeof data?.onBack === "function" ? data.onBack : null;

    if (data) {
      this.enterType = data.enterType;

      this.retryBtn.node.active = this.enterType == 1;
      this.backBtn.node.active = this.enterType == 1;
    }

    // 初始化开关状态显示
    if (this.shakeBtn) {
      this.shakeBtn.isChecked = !(gameStorage.getzhendong() == 0);
    }
    if (this.musicBtn) {
      this.musicBtn.isChecked = gameStorage.getMusic() == 1;
    }
    if (this.soundBtn) {
      this.soundBtn.isChecked = gameStorage.getSound() == 1;
    }
    PlayData.Instance.ispause = this.enterType === 1;
  }
  protected onLoad(): void {
    this.closeBtn.node.on(Node.EventType.TOUCH_END, this.onClose, this);
    this.backBtn.node.on(Node.EventType.TOUCH_END, this.onBack, this);
    this.retryBtn.node.on(Node.EventType.TOUCH_END, this.onRetry, this);
    this.musicBtn.node.on("toggle", this.onMusicClick, this);
    this.soundBtn.node.on("toggle", this.onSoundClick, this);
    this.shakeBtn.node.on("toggle", this.onShakeClick, this);
  }

  start() {}

  public onClose() {
    if (!this.actionHandled) {
      this.actionHandled = true;
      PlayData.Instance.ispause = false;
      this.closeCallback?.();
    }
    super.onClose();
  }

  onBack() {
    if (this.actionHandled) return;

    this.actionHandled = true;
    PlayData.Instance.ispause = false;
    super.onClose();
    this.backCallback?.();
  }

  onRetry() {
    if (this.actionHandled) return;

    this.actionHandled = true;
    PlayData.Instance.ispause = false;
    super.onClose();
    this.retryCallback?.();
  }

  onMusicClick(toggle: ToggleComponent) {
    if (toggle.isChecked) {
      // 关闭音乐
      gameStorage.setMusic(1);
      AudioManager.stopMusic();
    } else {
      // 开启音乐
      gameStorage.setMusic(0);

      this.playBgmByEnterType();
    }
  }
  onSoundClick(toggle: ToggleComponent) {
    if (toggle.isChecked) {
      gameStorage.setSound(1); // 关闭音效
      AudioManager.stopAllEffects(); // 停止所有音效
    } else {
      gameStorage.setSound(0); // 开启音效
    }

    director.emit(EventName.Video_sound_changed);
  }
  onShakeClick(toggle: ToggleComponent) {
    if (toggle.isChecked) {
      gameStorage.setzhendong(1); // 关闭振动
    } else {
      gameStorage.setzhendong(0); // 开启振动
    }
  }
  private playBgmByEnterType() {
    if (this.enterType === 1) {
      AudioManager.playMusic(soundName.levelBgm);
      return;
    }

    AudioManager.playMusic(soundName.bgm);
  }
  update(deltaTime: number) {}
}
