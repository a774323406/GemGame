/*
 * @author: wch
 * @date: yyyy-MM-dd HH:mm:ss
 */
import { _decorator, Component, Node, UIOpacity, tween, Vec3, Tween } from "cc";

const { ccclass, property } = _decorator;

/**
 * UI 打开 / 关闭动画类型
 *
 * None = 0:
 * - 默认值
 * - 不播放动画
 * - 不影响已经写好的旧 Panel
 *
 * Fade = 1:
 * - mask 和 content 一起做透明度渐变
 * - 适合普通提示、弱弹窗
 *
 * ScaleFade = 2:
 * - mask 淡入
 * - content 缩放 + 淡入 + 轻微回弹
 * - 适合设置、胜利、失败、奖励、确认弹窗
 */
export enum UIOpenAnimType {
  None = 0,
  Fade = 1,
  ScaleFade = 2,
}

@ccclass("UIBase")
export default class UIBase extends Component {
  /**
   * 关闭时是否销毁，不复用。
   *
   * 适合：
   * 1. VideoPlayer 界面
   * 2. WebView 界面
   * 3. 原生层 UI
   * 4. 不希望保留旧状态的复杂弹窗
   */
  @property({
    tooltip: "关闭时是否销毁，不复用。适合 VideoPlayer / WebView 等特殊原生层界面。",
  })
  public destroyOnClose: boolean = false;

  /**
   * 当前 UI 使用的动画类型。
   *
   * 默认 None，不影响旧界面。
   *
   * 子类只需要写：
   * protected uiAnimType: UIOpenAnimType = UIOpenAnimType.ScaleFade;
   */
  protected uiAnimType: UIOpenAnimType = UIOpenAnimType.None;

  protected _isOpen = false;

  /**
   * 是否正在播放关闭动画。
   * 避免重复点击关闭按钮时，重复播放关闭动画。
   */
  private _isClosingAnim = false;

  /**
   * 是否正在执行内部真正关闭。
   * 因为 onClose 现在会先播放动画，
   * 动画结束后还需要真正 active=false，
   * 所以用这个变量避免递归。
   */
  private _isInnerClose = false;

  /**
   * 关闭动画结束回调。
   * UIManager.close / closeAndDestroy 可以用它等待动画播完。
   */
  private _closeFinishCallback: (() => void) | null = null;

  /**
   * 打开 UI。
   *
   * 注意：
   * 旧 Panel 可以继续重写 onOpen(data)，不需要 super.onOpen(data)。
   * 因为 show() 里已经先处理了 node.active 和打开动画。
   */
  public onOpen(data?: any) {
    this._isOpen = true;
    this.node.active = true;
  }

  /**
   * 关闭 UI。
   *
   * 注意：
   * 旧 Panel 里面直接 this.onClose() 也可以触发关闭动画。
   * 不需要强制改成 UIManager.instance.close(...)。
   */
  public onClose() {
    if (this._isInnerClose) {
      this.realClose();
      return;
    }

    this.hide();
  }

  /**
   * UIManager.open 统一调用 show。
   */
  public show(data?: any) {
    this.stopUIAnimTween();

    this.node.active = true;
    this._isOpen = true;
    this._isClosingAnim = false;
    this._isInnerClose = false;
    this._closeFinishCallback = null;

    this.prepareOpenAnimState();

    /**
     * 先执行子类 onOpen。
     * 这样旧 Panel 的初始化逻辑不用改。
     */
    this.onOpen(data);

    /**
     * 再播放打开动画。
     * 就算子类 onOpen 没有 super.onOpen，也不影响动画。
     */
    this.playOpenAnim();
  }

  /**
   * UIManager.close 可以调用 hide。
   * 旧 Panel 直接调用 this.onClose() 时，也会走到这里。
   */
  public hide(onFinish?: () => void) {
    if (!this.node.active) {
      if (onFinish) {
        onFinish();
      }
      return;
    }

    if (this._isClosingAnim) {
      return;
    }

    this.stopUIAnimTween();

    this._isOpen = false;
    this._isClosingAnim = true;
    this._closeFinishCallback = onFinish ?? null;

    this.playCloseAnim();
  }

  /**
   * @description: 是否打开
   */
  public get isOpen() {
    return this._isOpen;
  }

  /**
   * 获取 mask 节点。
   *
   * 约定：
   * UI 根节点下面放一个名字叫 mask 的节点。
   */
  protected getMaskNode(): Node | null {
    return this.node.getChildByName("mask");
  }

  /**
   * 获取 content 节点。
   *
   * 约定：
   * UI 根节点下面放一个名字叫 content 的节点。
   */
  protected getContentNode(): Node | null {
    return this.node.getChildByName("content");
  }

  /**
   * 停止当前 UI 相关动画。
   *
   * 解决：
   * 1. 快速重复打开 / 关闭时动画叠加
   * 2. 复用 UI 时状态残留
   */
  private stopUIAnimTween() {
    const mask = this.getMaskNode();
    const content = this.getContentNode();

    Tween.stopAllByTarget(this.node);

    if (mask) {
      Tween.stopAllByTarget(mask);
      Tween.stopAllByTarget(this.getOrAddOpacity(mask));
    }

    if (content) {
      Tween.stopAllByTarget(content);
      Tween.stopAllByTarget(this.getOrAddOpacity(content));
    }
  }

  /**
   * 打开动画播放前，设置初始状态。
   */
  private prepareOpenAnimState() {
    const mask = this.getMaskNode();
    const content = this.getContentNode();

    if (mask) {
      mask.active = true;
    }

    if (content) {
      content.active = true;
    }

    switch (this.uiAnimType) {
      case UIOpenAnimType.Fade:
        this.prepareFadeOpenState(mask, content);
        break;

      case UIOpenAnimType.ScaleFade:
        this.prepareScaleFadeOpenState(mask, content);
        break;

      case UIOpenAnimType.None:
      default:
        this.prepareNoneOpenState(mask, content);
        break;
    }
  }

  /**
   * 播放打开动画。
   */
  private playOpenAnim() {
    const mask = this.getMaskNode();
    const content = this.getContentNode();

    switch (this.uiAnimType) {
      case UIOpenAnimType.Fade:
        this.playFadeOpenAnim(mask, content);
        break;

      case UIOpenAnimType.ScaleFade:
        this.playScaleFadeOpenAnim(mask, content);
        break;

      case UIOpenAnimType.None:
      default:
        this.finishOpenAnim();
        break;
    }
  }

  /**
   * 播放关闭动画。
   */
  private playCloseAnim() {
    const mask = this.getMaskNode();
    const content = this.getContentNode();

    switch (this.uiAnimType) {
      case UIOpenAnimType.Fade:
        this.playFadeCloseAnim(mask, content);
        break;

      case UIOpenAnimType.ScaleFade:
        this.playScaleFadeCloseAnim(mask, content);
        break;

      case UIOpenAnimType.None:
      default:
        this.finishCloseAnim();
        break;
    }
  }

  /**
   * 无动画打开状态。
   */
  private prepareNoneOpenState(mask: Node | null, content: Node | null) {
    // if (mask) {
    //   this.getOrAddOpacity(mask).opacity = 255;
    // }

    if (content) {
      content.setScale(1, 1, 1);
      this.getOrAddOpacity(content).opacity = 255;
    }
  }

  /**
   * Fade 打开初始状态。
   */
  private prepareFadeOpenState(mask: Node | null, content: Node | null) {
    if (mask) {
      this.getOrAddOpacity(mask).opacity = 0;
    }

    if (content) {
      content.setScale(1, 1, 1);
      this.getOrAddOpacity(content).opacity = 0;
    }
  }

  /**
   * Fade 打开动画。
   *
   * 参数都放在这里，后面调效果时比较直观。
   */
  private playFadeOpenAnim(mask: Node | null, content: Node | null) {
    const maskTargetOpacity = 200;
    const maskDuration = 0.16;
    const contentDuration = 0.18;

    if (mask) {
      tween(this.getOrAddOpacity(mask)).to(maskDuration, { opacity: maskTargetOpacity }).start();
    }

    if (content) {
      tween(this.getOrAddOpacity(content))
        .to(contentDuration, { opacity: 255 }, { easing: "quadOut" })
        .call(() => {
          this.finishOpenAnim();
        })
        .start();
    } else {
      this.finishOpenAnim();
    }
  }

  /**
   * Fade 关闭动画。
   */
  private playFadeCloseAnim(mask: Node | null, content: Node | null) {
    const maskDuration = 0.16;
    const contentDuration = 0.14;

    if (mask) {
      tween(this.getOrAddOpacity(mask)).to(maskDuration, { opacity: 0 }).start();
    }

    if (content) {
      tween(this.getOrAddOpacity(content))
        .to(contentDuration, { opacity: 0 }, { easing: "quadIn" })
        .call(() => {
          this.finishCloseAnim();
        })
        .start();
    } else {
      this.finishCloseAnim();
    }
  }

  /**
   * ScaleFade 打开初始状态。
   */
  private prepareScaleFadeOpenState(mask: Node | null, content: Node | null) {
    if (mask) {
      this.getOrAddOpacity(mask).opacity = 0;
    }

    if (content) {
      content.setScale(0.88, 0.88, 1);
      this.getOrAddOpacity(content).opacity = 0;
    }
  }

  /**
   * ScaleFade 打开动画。
   *
   * 效果：
   * - mask 先快速淡入
   * - content 缩放 + 淡入
   * - 轻微 1.03 回弹到 1
   */
  private playScaleFadeOpenAnim(mask: Node | null, content: Node | null) {
    const maskTargetOpacity = 200;
    const maskDuration = 0.15;

    const contentFadeDuration = 0.18;
    const contentScaleDuration = 0.22;
    const contentBackDuration = 0.08;

    if (mask) {
      tween(this.getOrAddOpacity(mask)).to(maskDuration, { opacity: maskTargetOpacity }).start();
    }

    if (content) {
      const contentOpacity = this.getOrAddOpacity(content);

      tween(contentOpacity).to(contentFadeDuration, { opacity: 255 }, { easing: "quadOut" }).start();

      tween(content)
        .to(contentScaleDuration, { scale: new Vec3(1.03, 1.03, 1) }, { easing: "backOut" })
        .to(contentBackDuration, { scale: new Vec3(1, 1, 1) }, { easing: "quadOut" })
        .call(() => {
          this.finishOpenAnim();
        })
        .start();
    } else {
      this.finishOpenAnim();
    }
  }

  /**
   * ScaleFade 关闭动画。
   */
  private playScaleFadeCloseAnim(mask: Node | null, content: Node | null) {
    const maskDuration = 0.16;
    const contentFadeDuration = 0.14;
    const contentScaleDuration = 0.16;

    if (mask) {
      tween(this.getOrAddOpacity(mask)).to(maskDuration, { opacity: 0 }).start();
    }

    if (content) {
      const contentOpacity = this.getOrAddOpacity(content);

      tween(contentOpacity).to(contentFadeDuration, { opacity: 0 }, { easing: "quadIn" }).start();

      tween(content)
        .to(contentScaleDuration, { scale: new Vec3(0.9, 0.9, 1) }, { easing: "quadIn" })
        .call(() => {
          this.finishCloseAnim();
        })
        .start();
    } else {
      this.finishCloseAnim();
    }
  }

  /**
   * 打开动画结束。
   */
  private finishOpenAnim() {
    this._isOpen = true;
    this._isClosingAnim = false;
  }

  /**
   * 关闭动画结束。
   *
   * 这里才真正 active=false。
   */
  private finishCloseAnim() {
    this._isInnerClose = true;
    this.onClose();
    this._isInnerClose = false;

    this._isOpen = false;
    this._isClosingAnim = false;

    const callback = this._closeFinishCallback;
    this._closeFinishCallback = null;

    if (callback) {
      callback();
    }
  }

  /**
   * 真正关闭节点。
   *
   * 不要在外部直接调用。
   */
  private realClose() {
    this._isOpen = false;
    this.node.active = false;
  }

  /**
   * 获取或者添加 UIOpacity。
   *
   * Cocos Creator 3.x 推荐用 UIOpacity 控制 UI 透明度。
   */
  protected getOrAddOpacity(node: Node): UIOpacity {
    let opacity = node.getComponent(UIOpacity);

    if (!opacity) {
      opacity = node.addComponent(UIOpacity);
    }

    return opacity;
  }
}
