import {
  _decorator,
  BlockInputEvents,
  Color,
  Component,
  Graphics,
  Layers,
  Node,
  Sprite,
  SpriteFrame,
  UITransform,
  Widget,
} from "cc";
import { ResourceManager } from "../framework/ResourceManager";
import UIManager, { UILayer } from "../framework/ui/UIManager";

const { ccclass, property } = _decorator;

/**
 * 激励视频拉起前的全屏加载遮罩。
 *
 * 参考原项目 adLoadPanel 的旋转方式，但改为运行时创建，避免每个场景都手工挂 Prefab。
 */
@ccclass("adLoadPanel")
export class adLoadPanel extends Component {
  private static panelNode: Node | null = null;
  private static spinnerLoadPromise: Promise<SpriteFrame | null> | null = null;

  @property(Node)
  public loadingIcon: Node | null = null;

  @property
  public speed = 360;

  protected onEnable(): void {
    if (this.loadingIcon?.isValid) {
      this.loadingIcon.angle = 0;
    }
  }

  protected update(deltaTime: number): void {
    if (this.loadingIcon?.activeInHierarchy) {
      this.loadingIcon.angle -= this.speed * deltaTime;
    }
  }

  public static show(): void {
    const layer = UIManager.instance?.getLayerNode(UILayer.Guide);
    if (!layer) return;

    let panel = this.panelNode;
    if (!panel?.isValid) {
      panel = this.createPanel(layer);
      this.panelNode = panel;
    } else if (panel.parent !== layer) {
      panel.parent = layer;
    }

    panel.active = true;
    panel.setSiblingIndex(layer.children.length - 1);

    const component = panel.getComponent(adLoadPanel);
    if (component?.loadingIcon?.isValid) {
      component.loadingIcon.angle = 0;
    }
  }

  public static hide(): void {
    if (this.panelNode?.isValid) {
      this.panelNode.active = false;
    }
  }

  private static createPanel(parent: Node): Node {
    const panel = new Node("adLoadPanel");
    panel.layer = Layers.Enum.UI_2D;
    panel.parent = parent;
    panel.setPosition(0, 0, 0);
    panel.addComponent(UITransform).setContentSize(750, 1334);
    this.stretchToParent(panel);
    panel.addComponent(BlockInputEvents);

    const mask = new Node("mask");
    mask.layer = Layers.Enum.UI_2D;
    mask.parent = panel;
    mask.addComponent(UITransform).setContentSize(750, 1334);
    this.stretchToParent(mask);
    const maskGraphics = mask.addComponent(Graphics);
    maskGraphics.fillColor = new Color(0, 0, 0, 155);
    // 留足范围，横竖屏和异形屏调整时也不会露底。
    maskGraphics.rect(-2000, -2000, 4000, 4000);
    maskGraphics.fill();

    const loadingIcon = new Node("loadingIcon");
    loadingIcon.layer = Layers.Enum.UI_2D;
    loadingIcon.parent = panel;
    loadingIcon.addComponent(UITransform).setContentSize(96, 96);
    this.drawFallbackSpinner(loadingIcon);

    const component = panel.addComponent(adLoadPanel);
    component.loadingIcon = loadingIcon;
    component.speed = 360;

    void this.applySpinnerTexture(loadingIcon);
    return panel;
  }

  private static stretchToParent(node: Node): void {
    const widget = node.addComponent(Widget);
    widget.isAlignTop = true;
    widget.isAlignBottom = true;
    widget.isAlignLeft = true;
    widget.isAlignRight = true;
    widget.top = 0;
    widget.bottom = 0;
    widget.left = 0;
    widget.right = 0;
  }

  private static drawFallbackSpinner(node: Node): void {
    const graphics = node.addComponent(Graphics);
    graphics.lineWidth = 7;

    for (let i = 0; i < 12; i++) {
      const angle = (Math.PI * 2 * i) / 12;
      const alpha = 70 + Math.floor((185 * (i + 1)) / 12);
      graphics.strokeColor = new Color(255, 255, 255, alpha);
      graphics.moveTo(Math.cos(angle) * 28, Math.sin(angle) * 28);
      graphics.lineTo(Math.cos(angle) * 41, Math.sin(angle) * 41);
      graphics.stroke();
    }
  }

  private static async applySpinnerTexture(node: Node): Promise<void> {
    if (!this.spinnerLoadPromise) {
      this.spinnerLoadPromise = ResourceManager.ins
        .loadBundleAsset("res", "texture/UIs/ad_loading_spinner/spriteFrame", SpriteFrame)
        .catch((err) => {
          console.warn("[adLoadPanel] 转圈图片加载失败，继续使用程序绘制图标", err);
          return null;
        });
    }

    const frame = await this.spinnerLoadPromise;
    if (!frame || !node?.isValid) return;

    const sprite = node.getComponent(Sprite) ?? node.addComponent(Sprite);
    sprite.spriteFrame = frame;
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;

    const fallback = node.getComponent(Graphics);
    if (fallback) fallback.enabled = false;
  }
}
