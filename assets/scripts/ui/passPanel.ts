import { _decorator, Button, Label, Size, Sprite, SpriteFrame, tween, UITransform, Vec3 } from "cc";
import { ResourceManager } from "../framework/ResourceManager";
import UIBase, { UIOpenAnimType } from "../framework/ui/UIBase";
import UIManager from "../framework/ui/UIManager";
import { uiName } from "../gamePrefabMgr";

const { ccclass, property } = _decorator;

export interface PassPanelData {
  level: number;
  onNext: () => void;
  onHome: () => void;
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

  private requestToken = 0;
  private data: PassPanelData = null;
  private previewBounds = new Size();

  protected onLoad() {
    this.nextButton?.node.on(Button.EventType.CLICK, this.onNext, this);
    this.homeButton?.node.on(Button.EventType.CLICK, this.onHome, this);

    const previewTransform = this.previewSprite?.node.getComponent(UITransform);
    if (previewTransform) {
      this.previewBounds.set(previewTransform.width, previewTransform.height);
    }
  }

  protected onDestroy() {
    this.nextButton?.node.off(Button.EventType.CLICK, this.onNext, this);
    this.homeButton?.node.off(Button.EventType.CLICK, this.onHome, this);
  }

  public onOpen(data?: PassPanelData) {
    this.data = data || null;
    const level = Math.max(1, Number(data?.level) || 1);

    if (this.levelLabel) {
      this.levelLabel.string = `LEVEL ${level}`;
    }
    this.loadPreview(level);
    this.playCelebration();
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
      this.fitPreviewToBounds(frame);
    } catch (err) {
      console.warn(`[passPanel] PreviewLevel${level} 加载失败`, err);
    }
  }

  private fitPreviewToBounds(frame: SpriteFrame) {
    const transform = this.previewSprite?.node.getComponent(UITransform);
    if (!transform) return;

    const sourceSize = frame.originalSize;
    const sourceWidth = Math.max(1, sourceSize.width);
    const sourceHeight = Math.max(1, sourceSize.height);
    const maxWidth = Math.max(1, this.previewBounds.width || transform.width);
    const maxHeight = Math.max(1, this.previewBounds.height || transform.height);
    const scale = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight, 1);

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
    UIManager.instance?.close(uiName.passPanel);
    this.data?.onNext?.();
  }

  private onHome() {
    UIManager.instance?.close(uiName.passPanel);
    this.data?.onHome?.();
  }
}
