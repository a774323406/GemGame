/*
 * @author: wch
 */
import { _decorator, Label, Node, NodePool, instantiate, tween, Vec3, find, UIOpacity, Tween } from "cc";
import UIBase from "../framework/ui/UIBase";

const { ccclass, property } = _decorator;

@ccclass("tipsPanel")
export class tipsPanel extends UIBase {
  /**
   * 单个 tips 的模板节点
   *
   * 结构：
   * tipsPanel
   *   tipItem
   *     str
   */
  @property(Node)
  tipItem: Node | null = null;

  /** 最多同时显示几个 */
  private readonly maxShowCount: number = 5;

  /** 每条 tips 之间的距离 */
  private readonly itemGapY: number = 42;

  /** 最下面一条 tips 的位置 */
  private readonly startY: number = -120;

  /** 新 tips 从更下面一点进入 */
  private readonly enterOffsetY: number = -30;

  /** 位置移动动画时间 */
  private readonly moveTime: number = 0.15;

  /** 停留时间 */
  private readonly stayTime: number = 0.45;

  /** 淡出时间 */
  private readonly fadeTime: number = 0.75;

  /** 等待队列 */
  private waitQueue: string[] = [];

  /** 节点池 */
  private pool: NodePool = new NodePool("TipsItemPool");

  /**
   * 当前正在显示的 tips
   *
   * 顺序：
   * activeItems[0] 是最早出现的，也就是最上面的
   * activeItems[activeItems.length - 1] 是最新出现的，也就是最下面的
   */
  private activeItems: Node[] = [];

  public onOpen(data?: any): void {
    super.onOpen(data);

    if (this.tipItem) {
      this.tipItem.active = false;
    }

    const content = data?.content ?? "";

    if (!content) {
      return;
    }

    this.addTips(content);
  }

  /**
   * 添加一条 tips
   */
  private addTips(content: string) {
    if (this.activeItems.length >= this.maxShowCount) {
      this.waitQueue.push(content);
      return;
    }

    this.createTipsItem(content);
  }

  /**
   * 创建 tips item
   */
  private createTipsItem(content: string) {
    if (!this.tipItem) {
      console.warn("[tipsPanel] tipItem 没有绑定");
      return;
    }

    let item = this.pool.get();

    if (!item) {
      item = instantiate(this.tipItem);
    }

    item.parent = this.node;
    item.active = true;
    item.setSiblingIndex(999);

    /**
     * 重点：
     * 从池子里拿出来的节点，必须先停掉旧 tween。
     * 否则旧动画可能把它拉回之前的位置。
     */
    Tween.stopAllByTarget(item);

    let opacity = item.getComponent(UIOpacity);
    if (!opacity) {
      opacity = item.addComponent(UIOpacity);
    }

    Tween.stopAllByTarget(opacity);

    opacity.opacity = 255;

    const labelNode = find("str", item);
    const label = labelNode?.getComponent(Label);

    if (label) {
      label.string = content;
    }

    /**
     * 新 item 先放在最下面的进入位置。
     */
    item.setPosition(0, this.startY + this.enterOffsetY, 0);
    item.setScale(1, 1, 1);

    /**
     * 加入显示列表。
     */
    this.activeItems.push(item);

    /**
     * 重新排版所有 item。
     * 注意这里是绝对位置，不是 position.y + gap。
     */
    this.relayoutActiveItems();

    /**
     * 每条 tips 自己只负责透明度消失。
     * 位置只由 relayoutActiveItems 控制。
     */
    tween(opacity)
      .delay(this.stayTime)
      .to(this.fadeTime, {
        opacity: 0,
      })
      .call(() => {
        this.recycleTipsItem(item);
      })
      .start();
  }

  /**
   * 重新排版当前所有 tips
   *
   * 用绝对位置，避免出现：
   * 从 0 -> 10 后，又被旧动画拉回 0 的问题。
   */
  private relayoutActiveItems() {
    const count = this.activeItems.length;

    for (let i = 0; i < count; i++) {
      const item = this.activeItems[i];

      if (!item || !item.isValid) {
        continue;
      }

      /**
       * 越早出现的越靠上。
       *
       * 例如 count = 3：
       * i = 0 => y = startY + 2 * gap
       * i = 1 => y = startY + 1 * gap
       * i = 2 => y = startY
       */
      const targetY = this.startY + (count - 1 - i) * this.itemGapY;

      /**
       * 只停止 item 的位置动画。
       * opacity 的淡出动画挂在 UIOpacity 上，不会被这里停止。
       */
      Tween.stopAllByTarget(item);

      tween(item)
        .to(this.moveTime, {
          position: new Vec3(0, targetY, 0),
        })
        .start();
    }
  }

  /**
   * 回收 tips item
   */
  private recycleTipsItem(item: Node) {
    if (!item || !item.isValid) {
      return;
    }

    const index = this.activeItems.indexOf(item);

    if (index >= 0) {
      this.activeItems.splice(index, 1);
    }

    Tween.stopAllByTarget(item);

    const opacity = item.getComponent(UIOpacity);
    if (opacity) {
      Tween.stopAllByTarget(opacity);
      opacity.opacity = 255;
    }

    item.removeFromParent();
    item.active = false;

    this.pool.put(item);

    this.checkQueue();

    /**
     * 全部播放完了，就隐藏 panel，不销毁。
     */
    if (this.activeItems.length <= 0 && this.waitQueue.length <= 0) {
      this.onClose();
    }
  }

  /**
   * 检查等待队列
   */
  private checkQueue() {
    while (this.waitQueue.length > 0 && this.activeItems.length < this.maxShowCount) {
      const content = this.waitQueue.shift();

      if (!content) {
        continue;
      }

      this.createTipsItem(content);
    }
  }

  public onClose(): void {
    this._isOpen = false;
    this.node.active = false;
  }
}
