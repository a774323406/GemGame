import { _decorator, Button, director, Label, Node, Size, Sprite, SpriteFrame, tween, Tween, UITransform, Vec3 } from "cc";
import { ResourceManager } from "../framework/ResourceManager";
import UIBase, { UIOpenAnimType } from "../framework/ui/UIBase";
import UIManager from "../framework/ui/UIManager";
import { uiName } from "../gamePrefabMgr";
import { ShareActionResult } from "../framework/Platform/ShareRewardService";
import { adc } from "../framework/Platform/ADController";
import { SdkUtils } from "../framework/Platform/sdk/SdkUtils";

const { ccclass, property } = _decorator;
const PASS_BANNER_OWNER = "ui.passPanel";

export interface PassPanelData {
  level: number;
  onNext: () => void;
  onHome: () => void;
  title?: string;
  levelText?: string;
  nextText?: string;
  shareRewardAvailable?: boolean;
  onShare?: () => Promise<ShareActionResult>;
}

@ccclass("passPanel")
export class passPanel extends UIBase {
  protected uiAnimType = UIOpenAnimType.ScaleFade;

  @property(Label)
  public titleLabel: Label = null;

  @property(Label)
  public levelLabel: Label = null;

  @property(Sprite)
  public previewSprite: Sprite = null;

  @property(Button)
  public nextButton: Button = null;

  @property(Button)
  public homeButton: Button = null;

  @property(Button)
  public shareButton: Button = null;

  @property(Node)
  public shareRewardBadge: Node = null;

  private requestToken = 0;
  private data: PassPanelData = null;
  private previewBounds = new Size();
  private actionHandled = false;
  private shareBusy = false;
  private bannerContentBaseY: number | null = null;

  protected onLoad() {
    const content = this.getContentNode();
    if (content) this.bannerContentBaseY = content.position.y;
    director.on(SdkUtils.EVENT_BANNER_INSET_CHANGED, this.onBannerInsetChanged, this);
    this.nextButton?.node.on(Button.EventType.CLICK, this.onNext, this);
    this.homeButton?.node.on(Button.EventType.CLICK, this.onHome, this);
    this.shareButton?.node.on(Button.EventType.CLICK, this.onShare, this);

    const previewTransform = this.previewSprite?.node.getComponent(UITransform);
    if (previewTransform) {
      this.previewBounds.set(previewTransform.width, previewTransform.height);
    }
  }

  protected onDestroy() {
    director.off(SdkUtils.EVENT_BANNER_INSET_CHANGED, this.onBannerInsetChanged, this);
    adc.setBannerRequested(PASS_BANNER_OWNER, false);
    this.nextButton?.node.off(Button.EventType.CLICK, this.onNext, this);
    this.homeButton?.node.off(Button.EventType.CLICK, this.onHome, this);
    this.shareButton?.node.off(Button.EventType.CLICK, this.onShare, this);
    this.stopShareBadgeAnimation();
  }

  public onOpen(data?: PassPanelData) {
    adc.setBannerRequested(PASS_BANNER_OWNER, true);
    this.applyBannerInset(SdkUtils.getBannerInsetRatio());
    this.data = data || null;
    this.actionHandled = false;
    this.shareBusy = false;
    if (this.nextButton) this.nextButton.interactable = true;
    if (this.homeButton) this.homeButton.interactable = true;
    const hasShareEntry = typeof data?.onShare === "function";
    const shareRewardAvailable = hasShareEntry && data?.shareRewardAvailable === true;
    if (this.shareButton?.node) {
      this.shareButton.node.active = hasShareEntry;
      this.shareButton.interactable = hasShareEntry;
    }
    if (this.titleLabel?.node) {
      this.titleLabel.node.active = true;
    }
    this.setShareBadgeVisible(shareRewardAvailable);
    const level = Math.max(1, Number(data?.level) || 1);

    // 复用面板时先清掉上一关图片，避免缺图关卡显示旧预览。
    if (this.previewSprite) {
      this.previewSprite.spriteFrame = null;
      this.previewSprite.node.active = false;
    }

    if (this.levelLabel) {
      this.levelLabel.string = data?.levelText || `LEVEL ${level}`;
    }
    if (this.titleLabel) {
      this.titleLabel.string = data?.title || "通关成功";
    }
    const nextLabel = this.nextButton?.node?.getComponentInChildren(Label);
    if (nextLabel) {
      nextLabel.string = data?.nextText || "下一关";
    }
    this.loadPreview(level);
    this.playCelebration();
  }

  public onClose() {
    // hide() 开始时 isOpen 会先变为 false；在关闭动画真正完成后释放请求，
    // 使 Banner 在弹窗仍可见期间保持显示。
    if (!this.isOpen) {
      adc.setBannerRequested(PASS_BANNER_OWNER, false);
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

  private async onShare() {
    if (this.shareBusy || !this.shareButton?.interactable || !this.data?.onShare) return;

    this.shareBusy = true;
    this.shareButton.interactable = false;
    try {
      const result = await this.data.onShare();
      if (!this.node?.isValid) return;
      if (!result.success) {
        this.showToast("分享未完成");
        return;
      }
      if (!result.rewarded) {
        this.setShareBadgeVisible(false);
        this.showToast("分享成功，今日通关加时已领取");
        return;
      }

      this.setShareBadgeVisible(false);
      this.showToast("下一关额外增加10秒");
    } catch (err) {
      console.warn("[passPanel] 分享失败", err);
    } finally {
      this.shareBusy = false;
      if (this.shareButton?.node?.isValid && typeof this.data?.onShare === "function") {
        this.shareButton.interactable = true;
      }
    }
  }

  private async loadPreview(level: number) {
    const token = ++this.requestToken;
    try {
      const frame = await ResourceManager.ins.loadBundleAsset(
        "res",
        `Images/LevelPreviews/PreviewLevel${level}/spriteFrame`,
        SpriteFrame,
      );
      if (token !== this.requestToken || !this.previewSprite?.node?.isValid) return;
      this.previewSprite.spriteFrame = frame;
      this.previewSprite.node.active = true;
      this.fitPreviewToBounds(frame);
    } catch (err) {
      console.warn(`[passPanel] PreviewLevel${level} 加载失败`, err);
    }
  }

  private fitPreviewToBounds(frame: SpriteFrame) {
    const transform = this.previewSprite?.node.getComponent(UITransform);
    if (!transform) return;

    /**
     * 关卡预览图带有不同大小的透明留白。使用 originalSize 会把这些透明像素
     * 也算进适配尺寸，像 Level2 这类上下留白较多的图片会被高度提前限制，
     * 最终横向明显变窄。Sprite 当前使用裁剪模式，因此应按实际纹理区域适配。
     */
    this.previewSprite.trim = true;
    const sourceRect = frame.rect;
    const sourceWidth = Math.max(1, sourceRect.width);
    const sourceHeight = Math.max(1, sourceRect.height);
    const maxWidth = Math.max(1, this.previewBounds.width || transform.width);
    const maxHeight = Math.max(1, this.previewBounds.height || transform.height);
    const scale = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight);

    transform.setContentSize(sourceWidth * scale, sourceHeight * scale);
  }

  private playCelebration() {
    if (this.titleLabel?.node) {
      this.titleLabel.node.setScale(0.72, 0.72, 1);
      tween(this.titleLabel.node)
        .to(0.22, { scale: new Vec3(1.08, 1.08, 1) }, { easing: "backOut" })
        .to(0.1, { scale: Vec3.ONE })
        .start();
    }

    if (this.previewSprite?.node) {
      this.previewSprite.node.setScale(0.9, 0.9, 1);
      tween(this.previewSprite.node).delay(0.08).to(0.25, { scale: Vec3.ONE }, { easing: "backOut" }).start();
    }
  }

  private onNext() {
    if (!this.consumeAction()) return;
    UIManager.instance?.close(uiName.passPanel);
    this.data?.onNext?.();
  }

  private onHome() {
    if (!this.consumeAction()) return;
    UIManager.instance?.close(uiName.passPanel);
    this.data?.onHome?.();
  }

  private consumeAction(): boolean {
    if (this.actionHandled) return false;
    this.actionHandled = true;
    if (this.nextButton) this.nextButton.interactable = false;
    if (this.homeButton) this.homeButton.interactable = false;
    return true;
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
        console.log(`[passPanel] ${title}`);
      }
    } catch {
      console.log(`[passPanel] ${title}`);
    }
  }
}
