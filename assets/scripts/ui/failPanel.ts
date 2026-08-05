import { _decorator, Button, director, Label, Node, tween, Tween, Vec3 } from "cc";
import UIBase, { UIOpenAnimType } from "../framework/ui/UIBase";
import UIManager from "../framework/ui/UIManager";
import { uiName } from "../gamePrefabMgr";
import { ShareActionResult } from "../framework/Platform/ShareRewardService";
import { adc } from "../framework/Platform/ADController";
import { SdkUtils } from "../framework/Platform/sdk/SdkUtils";

const { ccclass, property } = _decorator;
const FAIL_BANNER_OWNER = "ui.failPanel";

export interface FailPanelData {
  level: number;
  bonusSeconds: number;
  onRevive: () => boolean | Promise<boolean>;
  onHome: () => void;
  shareRewardAvailable?: boolean;
  onShareRevive?: () => Promise<ShareActionResult>;
}

@ccclass("failPanel")
export class failPanel extends UIBase {
  protected uiAnimType = UIOpenAnimType.ScaleFade;

  @property(Label)
  public levelLabel: Label = null;

  @property(Label)
  public bonusLabel: Label = null;

  @property(Button)
  public reviveButton: Button = null;

  @property(Button)
  public homeButton: Button = null;

  @property(Button)
  public shareButton: Button = null;

  @property(Node)
  public shareRewardBadge: Node = null;

  private data: FailPanelData = null;
  private shareBusy = false;
  private bannerContentBaseY: number | null = null;

  protected onLoad() {
    const content = this.getContentNode();
    if (content) this.bannerContentBaseY = content.position.y;
    director.on(SdkUtils.EVENT_BANNER_INSET_CHANGED, this.onBannerInsetChanged, this);
    this.reviveButton?.node.on(Button.EventType.CLICK, this.onRevive, this);
    this.homeButton?.node.on(Button.EventType.CLICK, this.onHome, this);
    this.shareButton?.node.on(Button.EventType.CLICK, this.onShareRevive, this);
  }

  protected onDestroy() {
    director.off(SdkUtils.EVENT_BANNER_INSET_CHANGED, this.onBannerInsetChanged, this);
    adc.setBannerRequested(FAIL_BANNER_OWNER, false);
    this.reviveButton?.node.off(Button.EventType.CLICK, this.onRevive, this);
    this.homeButton?.node.off(Button.EventType.CLICK, this.onHome, this);
    this.shareButton?.node.off(Button.EventType.CLICK, this.onShareRevive, this);
    this.stopShareBadgeAnimation();
  }

  public onOpen(data?: FailPanelData) {
    adc.setBannerRequested(FAIL_BANNER_OWNER, true);
    this.applyBannerInset(SdkUtils.getBannerInsetRatio());
    this.data = data || null;
    this.shareBusy = false;
    if (this.reviveButton) this.reviveButton.interactable = true;
    const hasShareEntry = typeof data?.onShareRevive === "function";
    const shareRewardAvailable = hasShareEntry && data?.shareRewardAvailable === true;
    if (this.shareButton?.node) {
      this.shareButton.node.active = hasShareEntry;
      this.shareButton.interactable = hasShareEntry;
    }
    const titleNode = this.levelLabel?.node?.parent?.getChildByName("Title");
    if (titleNode) titleNode.active = true;
    this.setShareBadgeVisible(shareRewardAvailable);

    const level = Math.max(1, Number(data?.level) || 1);
    const bonusSeconds = Math.max(0, Number(data?.bonusSeconds) || 0);
    if (this.levelLabel) {
      this.levelLabel.string = `LEVEL ${level}`;
    }
    if (this.bonusLabel) {
      this.bonusLabel.string = `额外获得 ${this.formatTime(bonusSeconds)}`;
    }
  }

  public onClose() {
    if (!this.isOpen) {
      adc.setBannerRequested(FAIL_BANNER_OWNER, false);
    }
    super.onClose();
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

  private async onShareRevive() {
    if (this.shareBusy || !this.shareButton?.interactable || !this.data?.onShareRevive) return;

    this.shareBusy = true;
    this.shareButton.interactable = false;
    try {
      const result = await this.data.onShareRevive();
      if (!this.node?.isValid) return;
      if (!result.success) {
        this.showToast("分享未完成");
        return;
      }
      if (!result.rewarded) {
        this.setShareBadgeVisible(false);
        this.showToast("分享成功，今日分享复活已使用");
        return;
      }

      this.setShareBadgeVisible(false);
      UIManager.instance?.close(uiName.failPanel);
    } catch (err) {
      console.warn("[failPanel] 分享复活失败", err);
    } finally {
      this.shareBusy = false;
      if (this.shareButton?.node?.isValid && typeof this.data?.onShareRevive === "function") {
        this.shareButton.interactable = true;
      }
    }
  }

  private async onRevive() {
    if (!this.data?.onRevive || !this.reviveButton?.interactable) return;

    this.reviveButton.interactable = false;
    try {
      const rewarded = await this.data.onRevive();
      if (!rewarded) {
        this.reviveButton.interactable = true;
        return;
      }
      UIManager.instance?.close(uiName.failPanel);
    } catch (err) {
      this.reviveButton.interactable = true;
      console.warn("[failPanel] 激励视频播放失败", err);
    }
  }

  private onHome() {
    UIManager.instance?.close(uiName.failPanel);
    this.data?.onHome?.();
  }

  private formatTime(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const remainSeconds = seconds % 60;
    const minuteText = minutes < 10 ? `0${minutes}` : String(minutes);
    const secondText = remainSeconds < 10 ? `0${remainSeconds}` : String(remainSeconds);
    return `${minuteText}:${secondText}`;
  }

  private setShareBadgeVisible(visible: boolean) {
    if (!this.shareRewardBadge?.isValid) return;
    this.shareRewardBadge.active = visible;
    if (visible) {
      this.playShareBadgeAnimation();
    } else {
      this.stopShareBadgeAnimation();
    }
  }

  private playShareBadgeAnimation() {
    const node = this.shareRewardBadge;
    if (!node?.isValid) return;
    Tween.stopAllByTarget(node);
    node.angle = 0;
    node.setScale(Vec3.ONE);
    tween(node)
      .repeatForever(
        tween(node)
          .to(0.1, { angle: -6, scale: new Vec3(1.04, 1.04, 1) })
          .to(0.1, { angle: 6, scale: new Vec3(1.08, 1.08, 1) })
          .to(0.1, { angle: -3, scale: new Vec3(1.04, 1.04, 1) })
          .to(0.12, { angle: 0, scale: Vec3.ONE })
          .delay(1.55),
      )
      .start();
  }

  private stopShareBadgeAnimation() {
    const node = this.shareRewardBadge;
    if (!node?.isValid) return;
    Tween.stopAllByTarget(node);
    node.angle = 0;
    node.setScale(Vec3.ONE);
  }

  private showToast(title: string) {
    try {
      const api = typeof tt !== "undefined" ? tt : null;
      if (typeof api?.showToast === "function") {
        api.showToast({ title, icon: "none" });
      } else {
        console.log(`[failPanel] ${title}`);
      }
    } catch {
      console.log(`[failPanel] ${title}`);
    }
  }
}
