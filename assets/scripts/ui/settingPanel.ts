import { _decorator, Button, Component, director, Node, NodeEventType, Toggle, ToggleComponent } from "cc";
import UIBase, { UIOpenAnimType } from "../framework/ui/UIBase";
import gameStorage from "../framework/gameStorage";
import PlayData, { EventName } from "../data/PlayData";
import AudioManager from "../framework/AudioManager";
import { SdkUtils } from "../framework/Platform/sdk/SdkUtils";
import { adc } from "../framework/Platform/ADController";
const { ccclass, property } = _decorator;

const SETTING_BANNER_OWNER = "ui.settingPanel";

@ccclass("settingPanel")
export class settingPanel extends UIBase {
  /** 与 multigame 的设置弹窗保持一致：遮罩和内容打开、关闭时淡入淡出。 */
  protected uiAnimType: UIOpenAnimType = UIOpenAnimType.Fade;

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
  private musicEnabledCallback: (() => void) | null = null;
  private actionHandled = false;
  private bannerContentBaseY: number | null = null;

  public onOpen(data?: any): void {
    adc.setBannerRequested(SETTING_BANNER_OWNER, true);
    this.applyBannerInset(SdkUtils.getBannerInsetRatio());
    this.actionHandled = false;
    this.closeCallback = typeof data?.onClose === "function" ? data.onClose : null;
    this.retryCallback = typeof data?.onRetry === "function" ? data.onRetry : null;
    this.backCallback = typeof data?.onBack === "function" ? data.onBack : null;
    this.musicEnabledCallback = typeof data?.onMusicEnabled === "function" ? data.onMusicEnabled : null;

    this.enterType = typeof data?.enterType === "number" ? data.enterType : 0;
    const defaultGameControls = this.enterType === 1;
    this.retryBtn.node.active =
      typeof data?.showRetry === "boolean" ? data.showRetry : defaultGameControls;
    this.backBtn.node.active =
      typeof data?.showBack === "boolean" ? data.showBack : defaultGameControls;

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
    const content = this.getContentNode();
    if (content) this.bannerContentBaseY = content.position.y;
    director.on(SdkUtils.EVENT_BANNER_INSET_CHANGED, this.onBannerInsetChanged, this);
    this.closeBtn.node.on(Node.EventType.TOUCH_END, this.onClose, this);
    this.backBtn.node.on(Node.EventType.TOUCH_END, this.onBack, this);
    this.retryBtn.node.on(Node.EventType.TOUCH_END, this.onRetry, this);
    this.musicBtn.node.on("toggle", this.onMusicClick, this);
    this.soundBtn.node.on("toggle", this.onSoundClick, this);
    this.shakeBtn.node.on("toggle", this.onShakeClick, this);
  }

  start() {}

  public onClose() {
    // UIBase 在关闭动画结束时会再次调用 onClose；此分支完成真正关闭，并兼容外部 close。
    if (!this.isOpen) {
      adc.setBannerRequested(SETTING_BANNER_OWNER, false);
      const shouldNotifyClose = !this.actionHandled;
      this.actionHandled = true;
      super.onClose();
      if (shouldNotifyClose) {
        this.closeCallback?.();
      }
      return;
    }
    if (this.actionHandled) {
      super.onClose();
      return;
    }

    this.actionHandled = true;
    this.hide(() => {
      this.closeCallback?.();
    });
  }

  protected onDestroy(): void {
    director.off(SdkUtils.EVENT_BANNER_INSET_CHANGED, this.onBannerInsetChanged, this);
    adc.setBannerRequested(SETTING_BANNER_OWNER, false);
  }

  private onBannerInsetChanged(ratio: number): void {
    this.applyBannerInset(ratio);
  }

  private applyBannerInset(ratio: number): void {
    const content = this.getContentNode();
    if (!content) return;
    if (this.bannerContentBaseY === null) this.bannerContentBaseY = content.position.y;

    const inset = Math.max(0, Math.min(0.5, Number(ratio) || 0)) * 1334;
    content.setPosition(
      content.position.x,
      this.bannerContentBaseY + inset * 0.5,
      content.position.z,
    );
  }

  onBack() {
    if (this.actionHandled) return;

    this.actionHandled = true;
    this.hide(() => {
      this.backCallback?.();
    });
  }

  onRetry() {
    if (this.actionHandled) return;

    this.actionHandled = true;
    this.hide(() => {
      this.retryCallback?.();
    });
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
    if (this.musicEnabledCallback) {
      this.musicEnabledCallback();
      return;
    }

    // 默认场景共用默认 BGM；特殊玩法可通过 onMusicEnabled 恢复自己的音乐。
    AudioManager.playDefaultBgm();
  }
  update(deltaTime: number) {}
}
