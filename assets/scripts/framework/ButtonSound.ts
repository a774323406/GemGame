/*
 * @author: wch
 */
import { _decorator, Component, Node, Button, director } from "cc";

const { ccclass, property } = _decorator;

@ccclass("ButtonSound")
export class ButtonSound extends Component {
  @property({
    tooltip: "是否启用按钮点击音效",
  })
  private enableClickSound: boolean = true;

  @property({
    tooltip: "是否只在 Button 可交互时播放音效",
  })
  private onlyPlayWhenInteractable: boolean = true;

  /**
   * 本次按下时，按钮是否允许播放音效。
   *
   * 不能在 TOUCH_END 才判断 interactable。
   * 因为有些按钮点击后会立刻刷新状态，
   * 比如翻页按钮点到最后一页后，nextPageBtn 会马上变成 interactable=false。
   */
  private canPlaySoundThisTouch: boolean = false;

  onEnable() {
    this.node.on(Node.EventType.TOUCH_START, this.onTouchStart, this);

    /**
     * 重点：
     * TOUCH_END 使用捕获阶段。
     *
     * 这样 close 按钮在业务逻辑里 this.onClose() 之前，
     * ButtonSound 可以先收到 TOUCH_END 并播放音效。
     */
    this.node.on(Node.EventType.TOUCH_END, this.onTouchEnd, this, true);
    this.node.on(Node.EventType.TOUCH_CANCEL, this.onTouchCancel, this, true);
  }

  onDisable() {
    this.node.off(Node.EventType.TOUCH_START, this.onTouchStart, this);
    this.node.off(Node.EventType.TOUCH_END, this.onTouchEnd, this, true);
    this.node.off(Node.EventType.TOUCH_CANCEL, this.onTouchCancel, this, true);
  }

  private onTouchStart() {
    this.canPlaySoundThisTouch = false;

    if (!this.enableClickSound) {
      return;
    }

    if (this.onlyPlayWhenInteractable) {
      const button = this.node.getComponent(Button);

      if (button && !button.interactable) {
        return;
      }
    }

    this.canPlaySoundThisTouch = true;
  }

  private onTouchEnd() {
    if (!this.canPlaySoundThisTouch) {
      return;
    }

    this.canPlaySoundThisTouch = false;

    director.emit("click");
  }

  private onTouchCancel() {
    this.canPlaySoundThisTouch = false;
  }
}
