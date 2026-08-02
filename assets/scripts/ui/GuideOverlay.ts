import {
  BlockInputEvents,
  Color,
  EventTouch,
  Graphics,
  HorizontalTextAlignment,
  Label,
  Layers,
  Node,
  Sprite,
  SpriteFrame,
  Tween,
  tween,
  UITransform,
  Vec2,
  Vec3,
  VerticalTextAlignment,
} from "cc";
import { ResourceManager } from "../framework/ResourceManager";

export type GuideFingerMode = "tap" | "drag" | "none";

/**
 * 单步新手引导的显示参数。
 *
 * 坐标约定：promptPosition / dragTo 都使用 root 的本地坐标。
 * fingerOffset / dragEndOffset 表示手指尖相对操作点的额外偏移。
 */
export interface GuideOverlayOptions {
  root: Node;
  target: Node;
  name?: string;

  prompt?: string;
  promptPosition?: Vec2 | Vec3;
  promptOffset?: Vec2;
  promptWidth?: number;

  holePadding?: Vec2;
  touchPadding?: Vec2;
  shadeOpacity?: number;
  allowTargetInput?: boolean;
  animateHole?: boolean;
  holeAnimationDuration?: number;

  /**
   * 引导位于最高 UI 层时，不能依赖事件穿透到场景中的目标。
   * 配置以下回调后，引导会在目标区域主动接收触摸并转发给业务层。
   */
  inputTarget?: Node | null;
  onTargetTap?: () => void;
  onTargetTouchStart?: (event: EventTouch) => void;
  onTargetTouchMove?: (event: EventTouch) => void;
  onTargetTouchEnd?: (event: EventTouch) => void;
  onTargetTouchCancel?: (event: EventTouch) => void;

  fingerMode?: GuideFingerMode;
  /** 手指动画起点；省略时与聚光 target 相同。 */
  fingerTarget?: Node | null;
  fingerOffset?: Vec2;
  fingerSize?: Vec2;

  /** 拖动引导的终点。dragTarget 优先于 dragTo。 */
  dragTarget?: Node | null;
  dragTo?: Vec2 | Vec3;
  dragEndOffset?: Vec2;
  dragDuration?: number;
}

export interface GuideClickOptions
  extends Omit<GuideOverlayOptions, "fingerMode" | "fingerTarget" | "dragTarget" | "dragTo"> {
  /** prompt 的便捷别名。两者同时填写时优先使用 prompt。 */
  text?: string;
}

export interface GuideDragOptions
  extends Omit<
    GuideOverlayOptions,
    "target" | "fingerMode" | "fingerTarget" | "dragTarget" | "dragTo"
  > {
  startTarget: Node;
  endTarget: Node;
  /**
   * 单孔聚光和输入缺口使用的节点，默认是 startTarget。
   * allowedArea 是 interactionTarget 的语义别名。
   */
  interactionTarget?: Node | null;
  allowedArea?: Node | null;
  /** prompt 的便捷别名。两者同时填写时优先使用 prompt。 */
  text?: string;
}

interface LocalBounds {
  left: number;
  right: number;
  bottom: number;
  top: number;
  center: Vec3;
  width: number;
  height: number;
}

interface GuideRuntimeState {
  tweenTargets: object[];
}

interface GuideHoleVisual {
  transform: UITransform;
  redraw: (progress: number) => void;
}

type GuideNode = Node & {
  __guideOverlayState?: GuideRuntimeState;
};

/**
 * 运行时创建的新手引导视觉层。
 *
 * - 目标区域从中心动态挖孔，其余区域变暗；
 * - 挖孔四周分别使用 BlockInputEvents，目标仍可正常点击；
 * - 支持点击脉冲和起点到终点的拖动手指动画；
 * - 所有 Tween 都在 update / hide 时显式停止。
 */
export class GuideOverlay {
  public static readonly DEFAULT_NAME = "__GuideOverlay__";

  private static readonly FINGER_PATH = "texture/UIs/Finger/spriteFrame";
  private static readonly DEFAULT_FINGER_SIZE = new Vec2(84, 100);
  private static readonly DEFAULT_PROMPT_WIDTH = 560;
  private static readonly PROMPT_HEIGHT = 104;
  private static readonly INPUT_CATCHER_NAME = "__guide_input";

  private static fingerFrame: SpriteFrame | null = null;
  private static fingerLoadPromise: Promise<SpriteFrame> | null = null;
  private static activeRoots: Map<string, Node> = new Map();

  public static async showClick(options: GuideClickOptions): Promise<Node | null> {
    const { text, ...rest } = options;
    return this.show({
      ...rest,
      prompt: options.prompt ?? text,
      fingerMode: "tap",
    });
  }

  public static async showDrag(options: GuideDragOptions): Promise<Node | null> {
    const {
      startTarget,
      endTarget,
      interactionTarget,
      allowedArea,
      inputTarget,
      text,
      ...rest
    } = options;
    return this.show({
      ...rest,
      target: interactionTarget ?? allowedArea ?? startTarget,
      inputTarget: inputTarget ?? startTarget,
      fingerTarget: startTarget,
      dragTarget: endTarget,
      prompt: options.prompt ?? text,
      fingerMode: "drag",
    });
  }

  /** 首次显示。默认带聚光孔展开动画。 */
  public static async show(options: GuideOverlayOptions): Promise<Node | null> {
    return this.render({
      ...options,
      animateHole: options.animateHole !== false,
    });
  }

  /** 切换步骤。默认不重复播放聚光孔展开动画。 */
  public static async update(options: GuideOverlayOptions): Promise<Node | null> {
    return this.render({
      ...options,
      animateHole: options.animateHole === true,
    });
  }

  /** 不重建遮罩，只更新当前引导的提示文字。 */
  public static setPrompt(
    root: Node | null,
    prompt: string,
    name = GuideOverlay.DEFAULT_NAME,
  ): void {
    const overlay = root?.getChildByName(name);
    if (!overlay?.isValid) return;

    const promptRoot = overlay.getChildByName("__guide_prompt");
    const label = promptRoot?.getChildByName("Label")?.getComponent(Label);
    if (!promptRoot || !label) return;

    label.string = prompt || "";
    promptRoot.active = !!prompt;
  }

  /** 隐藏一个引导。root 可省略，此时使用该 name 最近一次 show 的根节点。 */
  public static hide(
    root?: Node | null,
    name = GuideOverlay.DEFAULT_NAME,
  ): void {
    const resolvedRoot = root ?? this.activeRoots.get(name) ?? null;
    const overlay = resolvedRoot?.getChildByName(name) as GuideNode | null;

    if (overlay?.isValid) {
      this.stopOverlayTweens(overlay);
      // 立即脱离父节点，避免同一帧 update 后 getChildByName 仍拿到旧节点。
      overlay.removeFromParent();
      overlay.destroy();
    }

    if (this.activeRoots.get(name) === resolvedRoot) {
      this.activeRoots.delete(name);
    }
  }

  public static hideAll(): void {
    const entries = Array.from(this.activeRoots.entries());
    entries.forEach(([name, root]) => this.hide(root, name));
    this.activeRoots.clear();
  }

  public static isShowing(
    root?: Node | null,
    name = GuideOverlay.DEFAULT_NAME,
  ): boolean {
    const resolvedRoot = root ?? this.activeRoots.get(name) ?? null;
    return !!resolvedRoot?.getChildByName(name)?.isValid;
  }

  private static async render(options: GuideOverlayOptions): Promise<Node | null> {
    const { root, target } = options;
    const name = options.name || this.DEFAULT_NAME;

    if (
      !root?.isValid ||
      !target?.isValid ||
      !root.activeInHierarchy ||
      !target.activeInHierarchy
    ) {
      return null;
    }

    const rootTransform = root.getComponent(UITransform);
    const targetTransform = target.getComponent(UITransform);
    if (!rootTransform || !targetTransform) {
      console.warn("[GuideOverlay] root 和 target 都必须带有 UITransform");
      return null;
    }

    // 同名引导可能来自上一个场景/根节点，先清掉映射中的旧实例。
    this.hide(undefined, name);
    this.hide(root, name);

    const overlay = this.createNode(name, root);
    overlay.setPosition(0, 0, 0);
    overlay.setSiblingIndex(root.children.length - 1);

    const overlayTransform = overlay.addComponent(UITransform);
    overlayTransform.setContentSize(rootTransform.contentSize);
    overlayTransform.setAnchorPoint(rootTransform.anchorX, rootTransform.anchorY);

    const state: GuideRuntimeState = { tweenTargets: [] };
    (overlay as GuideNode).__guideOverlayState = state;
    this.activeRoots.set(name, root);

    // 用世界四角换算目标在 overlay 中的 AABB。这样父级缩放、旋转和层级缩放都能正确反映到孔尺寸。
    const targetBounds = this.getLocalBounds(targetTransform, overlayTransform);
    const holePadding = options.holePadding ?? new Vec2(14, 14);
    const holeBounds = this.expandBounds(targetBounds, holePadding);
    const rootBounds = this.getTransformLocalBounds(overlayTransform);
    const visibleHole = this.clampBounds(holeBounds, rootBounds);
    if (visibleHole.width <= 1 || visibleHole.height <= 1) {
      console.warn("[GuideOverlay] 引导目标不在可见区域，已取消本次遮罩", target.name);
      this.hide(root, name);
      return null;
    }

    const holeVisual = this.createShadeAndHole(
      overlay,
      overlayTransform,
      rootBounds,
      holeBounds,
      options.shadeOpacity,
    );

    if (options.allowTargetInput === false) {
      this.addInputBlocker(
        overlay,
        "__block_all",
        rootBounds.left,
        rootBounds.bottom,
        rootBounds.width,
        rootBounds.height,
      );
    } else {
      // 可交互区域不能小于视觉孔洞，否则玩家点在已经露出的亮边缘上会像“没反应”。
      const requestedTouchPadding = options.touchPadding ?? Vec2.ZERO;
      const touchPadding = new Vec2(
        Math.max(requestedTouchPadding.x, holePadding.x),
        Math.max(requestedTouchPadding.y, holePadding.y),
      );
      const touchBounds = this.expandBounds(targetBounds, touchPadding);
      this.createInputBlockers(overlay, rootBounds, touchBounds);

      const inputTransform = options.inputTarget?.isValid
        ? options.inputTarget.getComponent(UITransform)
        : null;
      const inputBounds = inputTransform
        ? this.expandBounds(
            this.getLocalBounds(inputTransform, overlayTransform),
            touchPadding,
          )
        : touchBounds;

      // 使用主动业务回调时，孔洞中 inputTarget 之外的区域不能继续穿透到棋盘。
      // 点击引导的 catcher 会覆盖整个孔；拖拽引导则只允许从指定起点开始。
      if (this.hasInputHandler(options)) {
        const guardedHole = this.clampBounds(touchBounds, rootBounds);
        this.addInputBlocker(
          overlay,
          "__block_hole_passthrough",
          guardedHole.left,
          guardedHole.bottom,
          guardedHole.width,
          guardedHole.height,
        );
      }
      this.createInputCatcher(overlay, rootBounds, inputBounds, options);
    }

    this.createPrompt(overlay, rootBounds, holeBounds, options);

    const fingerMode = options.fingerMode ?? "tap";
    let finger: Node | null = null;
    if (fingerMode !== "none") {
      finger = this.createFingerNode(overlay, options.fingerSize);
      // 手指必须立即可见。聚光动画只是装饰，不能成为交互提示出现的前置条件。
      finger.active = true;
      const fingerTargetTransform = options.fingerTarget?.isValid
        ? options.fingerTarget.getComponent(UITransform)
        : null;
      const fingerStartBounds = fingerTargetTransform
        ? this.getLocalBounds(fingerTargetTransform, overlayTransform)
        : targetBounds;
      this.positionAndAnimateFinger(
        finger,
        overlayTransform,
        fingerStartBounds,
        options,
      );
    }

    const finishShowing = () => {
      if (!overlay.isValid || overlay.parent !== root) return;
    };

    if (options.animateHole !== false) {
      this.animateHole(
        holeVisual,
        Math.max(0.05, Number(options.holeAnimationDuration) || 0.3),
        state,
        finishShowing,
      );
    } else {
      holeVisual.redraw(1);
      finishShowing();
    }

    if (finger) {
      try {
        const frame = await this.loadFingerFrame();
        if (
          overlay.isValid &&
          overlay.parent === root &&
          root.getChildByName(name) === overlay &&
          finger.isValid
        ) {
          const sprite = finger.getComponent(Sprite);
          if (sprite) sprite.spriteFrame = frame;
          const fallback = finger.getChildByName("__finger_fallback");
          if (fallback?.isValid) fallback.active = false;
        }
      } catch (err) {
        // 资源异常时保留程序绘制的触点，避免整个引导因图片加载失败而消失。
        console.warn("[GuideOverlay] 加载 Finger.png 失败，使用触点占位图", err);
      }
    }

    if (!root.isValid || !overlay.isValid || overlay.parent !== root) {
      return null;
    }
    return overlay;
  }

  private static createShadeAndHole(
    overlay: Node,
    overlayTransform: UITransform,
    rootBounds: LocalBounds,
    holeBounds: LocalBounds,
    shadeOpacity?: number,
  ): GuideHoleVisual {
    // 不再使用 inverted Mask。部分小游戏运行环境在动态改变 Mask 尺寸时不会
    // 及时刷新 stencil，结果会变成整屏遮黑且永远没有点击缺口。
    // 直接绘制孔洞四周的四块遮罩，视觉和输入区域都保持稳定。
    const hole = this.clampBounds(holeBounds, rootBounds);
    const shade = this.createNode("__guide_shade", overlay);
    shade.setPosition(0, 0, 0);
    const shadeTransform = shade.addComponent(UITransform);
    shadeTransform.setContentSize(overlayTransform.contentSize);
    shadeTransform.setAnchorPoint(overlayTransform.anchorX, overlayTransform.anchorY);

    const graphics = shade.addComponent(Graphics);
    graphics.fillColor = new Color(
      0,
      0,
      0,
      Math.max(0, Math.min(255, shadeOpacity ?? 178)),
    );
    const redraw = (rawProgress: number) => {
      const progress = this.clamp(rawProgress, 0, 1);
      const halfWidth = hole.width * 0.5 * progress;
      const halfHeight = hole.height * 0.5 * progress;
      const animatedHole = this.makeBounds(
        hole.center.x - halfWidth,
        hole.center.x + halfWidth,
        hole.center.y - halfHeight,
        hole.center.y + halfHeight,
      );

      graphics.clear();
      this.addShadeRect(
        graphics,
        rootBounds.left,
        animatedHole.top,
        rootBounds.width,
        rootBounds.top - animatedHole.top,
      );
      this.addShadeRect(
        graphics,
        rootBounds.left,
        rootBounds.bottom,
        rootBounds.width,
        animatedHole.bottom - rootBounds.bottom,
      );
      this.addShadeRect(
        graphics,
        rootBounds.left,
        animatedHole.bottom,
        animatedHole.left - rootBounds.left,
        animatedHole.height,
      );
      this.addShadeRect(
        graphics,
        animatedHole.right,
        animatedHole.bottom,
        rootBounds.right - animatedHole.right,
        animatedHole.height,
      );
      graphics.fill();
    };
    redraw(1);
    shade.setSiblingIndex(0);

    const highlight = this.createNode("__guide_hole", overlay);
    highlight.setPosition(hole.center);
    const highlightTransform = highlight.addComponent(UITransform);
    highlightTransform.setContentSize(hole.width, hole.height);
    const outline = highlight.addComponent(Graphics);
    outline.strokeColor = new Color(255, 235, 155, 245);
    outline.lineWidth = 4;
    outline.roundRect(
      -hole.width * 0.5,
      -hole.height * 0.5,
      hole.width,
      hole.height,
      Math.min(18, hole.width * 0.2, hole.height * 0.2),
    );
    outline.stroke();
    highlight.setSiblingIndex(1);

    return {
      transform: highlightTransform,
      redraw,
    };
  }

  private static addShadeRect(
    graphics: Graphics,
    left: number,
    bottom: number,
    width: number,
    height: number,
  ): void {
    if (width <= 0.01 || height <= 0.01) return;
    graphics.rect(left, bottom, width, height);
  }

  private static createInputBlockers(
    overlay: Node,
    root: LocalBounds,
    requestedHole: LocalBounds,
  ): void {
    const hole = this.clampBounds(requestedHole, root);

    // 目标完全在屏幕外时不应留下任何输入缺口。
    if (hole.width <= 0 || hole.height <= 0) {
      this.addInputBlocker(
        overlay,
        "__block_all",
        root.left,
        root.bottom,
        root.width,
        root.height,
      );
      return;
    }

    this.addInputBlocker(
      overlay,
      "__block_top",
      root.left,
      hole.top,
      root.width,
      root.top - hole.top,
    );
    this.addInputBlocker(
      overlay,
      "__block_bottom",
      root.left,
      root.bottom,
      root.width,
      hole.bottom - root.bottom,
    );
    this.addInputBlocker(
      overlay,
      "__block_left",
      root.left,
      hole.bottom,
      hole.left - root.left,
      hole.height,
    );
    this.addInputBlocker(
      overlay,
      "__block_right",
      hole.right,
      hole.bottom,
      root.right - hole.right,
      hole.height,
    );
  }

  private static addInputBlocker(
    parent: Node,
    name: string,
    left: number,
    bottom: number,
    width: number,
    height: number,
  ): void {
    if (width <= 0.01 || height <= 0.01) return;

    const blocker = this.createNode(name, parent);
    blocker.setPosition(left + width * 0.5, bottom + height * 0.5, 0);
    blocker.addComponent(UITransform).setContentSize(width, height);
    blocker.addComponent(BlockInputEvents);
    blocker.setSiblingIndex(1);
  }

  private static createInputCatcher(
    overlay: Node,
    rootBounds: LocalBounds,
    requestedBounds: LocalBounds,
    options: GuideOverlayOptions,
  ): void {
    if (!this.hasInputHandler(options)) return;

    const bounds = this.clampBounds(requestedBounds, rootBounds);
    if (bounds.width <= 0 || bounds.height <= 0) return;

    const catcher = this.createNode(this.INPUT_CATCHER_NAME, overlay);
    catcher.setPosition(bounds.center);
    catcher.addComponent(UITransform).setContentSize(bounds.width, bounds.height);

    let touchStart: Vec2 | null = null;
    const stop = (event: EventTouch) => {
      event.propagationStopped = true;
    };

    catcher.on(Node.EventType.TOUCH_START, (event: EventTouch) => {
      stop(event);
      const point = event.getUILocation();
      touchStart = new Vec2(point.x, point.y);
      options.onTargetTouchStart?.(event);
    });
    catcher.on(Node.EventType.TOUCH_MOVE, (event: EventTouch) => {
      stop(event);
      options.onTargetTouchMove?.(event);
    });
    catcher.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
      stop(event);
      options.onTargetTouchEnd?.(event);
      if (!options.onTargetTouchEnd && options.onTargetTap) {
        const point = event.getUILocation();
        const dx = point.x - (touchStart?.x ?? point.x);
        const dy = point.y - (touchStart?.y ?? point.y);
        if (dx * dx + dy * dy <= 100) options.onTargetTap();
      }
      touchStart = null;
    });
    catcher.on(Node.EventType.TOUCH_CANCEL, (event: EventTouch) => {
      stop(event);
      options.onTargetTouchCancel?.(event);
      touchStart = null;
    });
    catcher.setSiblingIndex(5);
  }

  private static hasInputHandler(options: GuideOverlayOptions): boolean {
    return !!(
      options.onTargetTap ||
      options.onTargetTouchStart ||
      options.onTargetTouchMove ||
      options.onTargetTouchEnd ||
      options.onTargetTouchCancel
    );
  }

  private static createPrompt(
    overlay: Node,
    rootBounds: LocalBounds,
    holeBounds: LocalBounds,
    options: GuideOverlayOptions,
  ): void {
    const width = Math.max(
      180,
      Math.min(options.promptWidth ?? this.DEFAULT_PROMPT_WIDTH, rootBounds.width - 32),
    );
    const height = this.PROMPT_HEIGHT;
    const promptRoot = this.createNode("__guide_prompt", overlay);
    const transform = promptRoot.addComponent(UITransform);
    transform.setContentSize(width, height);

    const position = options.promptPosition
      ? new Vec3(options.promptPosition.x, options.promptPosition.y, 0)
      : this.getDefaultPromptPosition(rootBounds, holeBounds, width, height);
    const offset = options.promptOffset ?? Vec2.ZERO;
    position.x += offset.x;
    position.y += offset.y;
    position.x = this.clamp(
      position.x,
      rootBounds.left + width * 0.5 + 12,
      rootBounds.right - width * 0.5 - 12,
    );
    position.y = this.clamp(
      position.y,
      rootBounds.bottom + height * 0.5 + 12,
      rootBounds.top - height * 0.5 - 12,
    );
    promptRoot.setPosition(position);

    const background = promptRoot.addComponent(Graphics);
    background.fillColor = new Color(50, 35, 88, 242);
    background.strokeColor = new Color(224, 207, 255, 255);
    background.lineWidth = 3;
    background.roundRect(-width * 0.5, -height * 0.5, width, height, 24);
    background.fill();
    background.stroke();

    const labelNode = this.createNode("Label", promptRoot);
    labelNode.addComponent(UITransform).setContentSize(width - 34, height - 20);
    const label = labelNode.addComponent(Label);
    label.string = options.prompt || "";
    label.fontSize = 30;
    label.lineHeight = 39;
    label.color = Color.WHITE;
    label.horizontalAlign = HorizontalTextAlignment.CENTER;
    label.verticalAlign = VerticalTextAlignment.CENTER;
    label.overflow = Label.Overflow.SHRINK;
    label.enableWrapText = true;
    promptRoot.active = !!options.prompt;
    promptRoot.setSiblingIndex(2);
  }

  private static createFingerNode(parent: Node, requestedSize?: Vec2): Node {
    const size = requestedSize ?? this.DEFAULT_FINGER_SIZE;
    const finger = this.createNode("__guide_finger", parent);
    finger.addComponent(UITransform).setContentSize(
      Math.max(24, size.x),
      Math.max(28, size.y),
    );

    const sprite = finger.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;

    // 图片尚未加载时的轻量占位触点，加载完成后自动关闭。
    // Graphics 放在子节点，避免与 Sprite 两个 UIRenderer 挂在同一节点。
    const fallbackNode = this.createNode("__finger_fallback", finger);
    fallbackNode.addComponent(UITransform).setContentSize(size.x, size.y);
    const fallback = fallbackNode.addComponent(Graphics);
    fallback.fillColor = new Color(255, 255, 255, 100);
    fallback.strokeColor = new Color(255, 231, 103, 245);
    fallback.lineWidth = 5;
    fallback.circle(-size.x * 0.22, size.y * 0.38, Math.max(12, size.x * 0.2));
    fallback.fill();
    fallback.stroke();

    finger.setSiblingIndex(3);
    return finger;
  }

  private static positionAndAnimateFinger(
    finger: Node,
    overlayTransform: UITransform,
    targetBounds: LocalBounds,
    options: GuideOverlayOptions,
  ): void {
    const fingerTransform = finger.getComponent(UITransform)!;
    const mode = options.fingerMode ?? "tap";
    const startTouch = targetBounds.center.clone();
    const startExtra = options.fingerOffset ?? Vec2.ZERO;
    startTouch.x += startExtra.x;
    startTouch.y += startExtra.y;
    const start = this.getFingerCenterForTouch(startTouch, fingerTransform);

    finger.setPosition(start);
    finger.setScale(1, 1, 1);

    if (mode === "drag") {
      let endTouch = startTouch.clone();
      const dragTargetTransform = options.dragTarget?.getComponent(UITransform);
      if (dragTargetTransform && options.dragTarget?.isValid) {
        endTouch = this.getLocalBounds(dragTargetTransform, overlayTransform).center;
      } else if (options.dragTo) {
        endTouch.set(options.dragTo.x, options.dragTo.y, 0);
      }
      const endOffset = options.dragEndOffset ?? Vec2.ZERO;
      endTouch.x += endOffset.x;
      endTouch.y += endOffset.y;
      const end = this.getFingerCenterForTouch(endTouch, fingerTransform);
      this.playDragFinger(
        finger,
        start,
        end,
        Math.max(0.25, Number(options.dragDuration) || 0.85),
      );
      return;
    }

    this.playTapFinger(finger);
  }

  private static playTapFinger(finger: Node): void {
    const loop = tween(finger)
      .repeatForever(
        tween(finger)
          .to(0.18, { scale: new Vec3(0.82, 0.82, 1) }, { easing: "sineIn" })
          .to(0.2, { scale: Vec3.ONE }, { easing: "backOut" })
          .delay(0.55),
      )
      .start();
    this.rememberTweenTarget(finger, finger);
    void loop;
  }

  private static playDragFinger(
    finger: Node,
    start: Vec3,
    end: Vec3,
    duration: number,
  ): void {
    const loop = tween(finger)
      .repeatForever(
        tween(finger)
          .set({ position: start, scale: Vec3.ONE })
          .delay(0.25)
          .to(0.16, { scale: new Vec3(0.82, 0.82, 1) }, { easing: "sineIn" })
          .to(duration, { position: end }, { easing: "sineInOut" })
          .to(0.18, { scale: Vec3.ONE }, { easing: "backOut" })
          .delay(0.42)
          .set({ position: start })
          .delay(0.25),
      )
      .start();
    this.rememberTweenTarget(finger, finger);
    void loop;
  }

  private static animateHole(
    visual: GuideHoleVisual,
    duration: number,
    runtime: GuideRuntimeState,
    onComplete: () => void,
  ): void {
    const target = visual.transform.node;
    const opening = { progress: 0 };
    runtime.tweenTargets.push(target, opening);
    visual.redraw(0);
    target.setScale(0.05, 0.05, 1);

    tween(target)
      .to(duration, { scale: Vec3.ONE }, { easing: "backOut" })
      .start();

    tween(opening)
      .to(
        duration,
        { progress: 1 },
        {
          easing: "quadOut",
          onUpdate: (value) => visual.redraw(value?.progress ?? 1),
        },
      )
      .call(() => {
        if (target?.isValid) target.setScale(Vec3.ONE);
        visual.redraw(1);
        onComplete();
      })
      .start();
  }

  private static async loadFingerFrame(): Promise<SpriteFrame> {
    if (this.fingerFrame?.isValid) return this.fingerFrame;

    if (!this.fingerLoadPromise) {
      const promise = ResourceManager.ins.loadBundleAsset<SpriteFrame>(
        "res",
        this.FINGER_PATH,
        SpriteFrame,
      );
      this.fingerLoadPromise = promise;
      void promise.then(
        (frame) => {
          this.fingerFrame = frame;
          if (this.fingerLoadPromise === promise) this.fingerLoadPromise = null;
        },
        () => {
          if (this.fingerLoadPromise === promise) this.fingerLoadPromise = null;
        },
      );
    }

    return this.fingerLoadPromise;
  }

  /**
   * 通过四个世界坐标角点计算 AABB，避免直接读取 contentSize 时漏掉父级 scale。
   */
  private static getLocalBounds(
    source: UITransform,
    destination: UITransform,
  ): LocalBounds {
    const left = -source.width * source.anchorX;
    const right = source.width * (1 - source.anchorX);
    const bottom = -source.height * source.anchorY;
    const top = source.height * (1 - source.anchorY);
    const corners = [
      new Vec3(left, bottom, 0),
      new Vec3(right, bottom, 0),
      new Vec3(right, top, 0),
      new Vec3(left, top, 0),
    ];

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    corners.forEach((corner) => {
      const world = source.convertToWorldSpaceAR(corner);
      const local = destination.convertToNodeSpaceAR(world);
      minX = Math.min(minX, local.x);
      minY = Math.min(minY, local.y);
      maxX = Math.max(maxX, local.x);
      maxY = Math.max(maxY, local.y);
    });

    return this.makeBounds(minX, maxX, minY, maxY);
  }

  private static getTransformLocalBounds(transform: UITransform): LocalBounds {
    const left = -transform.width * transform.anchorX;
    const right = transform.width * (1 - transform.anchorX);
    const bottom = -transform.height * transform.anchorY;
    const top = transform.height * (1 - transform.anchorY);
    return this.makeBounds(left, right, bottom, top);
  }

  private static expandBounds(bounds: LocalBounds, padding: Vec2): LocalBounds {
    return this.makeBounds(
      bounds.left - Math.max(0, padding.x),
      bounds.right + Math.max(0, padding.x),
      bounds.bottom - Math.max(0, padding.y),
      bounds.top + Math.max(0, padding.y),
    );
  }

  private static clampBounds(bounds: LocalBounds, limit: LocalBounds): LocalBounds {
    const left = Math.max(bounds.left, limit.left);
    const right = Math.min(bounds.right, limit.right);
    const bottom = Math.max(bounds.bottom, limit.bottom);
    const top = Math.min(bounds.top, limit.top);
    if (right <= left || top <= bottom) {
      return this.makeBounds(0, 0, 0, 0);
    }
    return this.makeBounds(left, right, bottom, top);
  }

  private static makeBounds(
    left: number,
    right: number,
    bottom: number,
    top: number,
  ): LocalBounds {
    return {
      left,
      right,
      bottom,
      top,
      width: Math.max(0, right - left),
      height: Math.max(0, top - bottom),
      center: new Vec3((left + right) * 0.5, (bottom + top) * 0.5, 0),
    };
  }

  /** Finger.png 的指尖在图片中心左上方，将图片中心反向偏移到触点。 */
  private static getFingerCenterForTouch(
    touchPoint: Vec3,
    transform: UITransform,
  ): Vec3 {
    return new Vec3(
      touchPoint.x + transform.width * 0.22,
      touchPoint.y - transform.height * 0.38,
      touchPoint.z,
    );
  }

  private static getDefaultPromptPosition(
    root: LocalBounds,
    hole: LocalBounds,
    width: number,
    height: number,
  ): Vec3 {
    const gap = 48;
    const above = hole.top + gap + height * 0.5;
    const below = hole.bottom - gap - height * 0.5;
    const y = above <= root.top - 12 ? above : below;
    const x = this.clamp(
      hole.center.x,
      root.left + width * 0.5 + 12,
      root.right - width * 0.5 - 12,
    );
    return new Vec3(x, y, 0);
  }

  private static stopOverlayTweens(overlay: GuideNode): void {
    const state = overlay.__guideOverlayState;
    state?.tweenTargets.forEach((target) => Tween.stopAllByTarget(target));

    const stopNode = (node: Node) => {
      Tween.stopAllByTarget(node);
      node.children.forEach(stopNode);
    };
    stopNode(overlay);
    overlay.__guideOverlayState = undefined;
  }

  private static rememberTweenTarget(owner: Node, target: object): void {
    let current: Node | null = owner;
    while (current) {
      const state = (current as GuideNode).__guideOverlayState;
      if (state) {
        state.tweenTargets.push(target);
        return;
      }
      current = current.parent;
    }
  }

  private static createNode(name: string, parent: Node): Node {
    const node = new Node(name);
    node.layer = parent.layer || Layers.Enum.UI_2D;
    node.parent = parent;
    return node;
  }

  private static clamp(value: number, min: number, max: number): number {
    if (min > max) return (min + max) * 0.5;
    return Math.max(min, Math.min(max, value));
  }
}

export default GuideOverlay;
