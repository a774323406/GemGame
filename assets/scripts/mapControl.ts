import {
  _decorator,
  Component,
  Node,
  UITransform,
  EventTouch,
  EventMouse,
  Vec3,
  v3,
} from "cc";

const { ccclass, property } = _decorator;

@ccclass("mapControl")
export class mapControl extends Component {
  @property({ tooltip: "是否允许双指缩放" })
  public enablePinchZoom: boolean = true;

  @property({ tooltip: "是否允许鼠标滚轮缩放，主要用于编辑器 / PC 预览测试" })
  public enableMouseWheelZoom: boolean = true;

  @property({ tooltip: "是否允许单指 / 鼠标拖动地图" })
  public enableDrag: boolean = true;

  @property({ tooltip: "原始缩放。scale 小于等于这个值时，不允许拖动，并自动回中心。" })
  public baseScale: number = 1;

  @property({ tooltip: "最小缩放。建议设置为 1，避免缩小后拖动范围异常。" })
  public minScale: number = 1;

  @property({ tooltip: "最大缩放" })
  public maxScale: number = 1.8;

  @property({ tooltip: "滚轮缩放速度，数值越大缩放越快" })
  public mouseWheelZoomSpeed: number = 0.0015;

  @property({ tooltip: "移动超过多少像素后，才判定为拖动。避免影响普通点击格子。" })
  public dragStartDistance: number = 5;

  @property({ tooltip: "边界回弹缓冲。0 表示完全不能露空白，数值越大越能拖出一点边缘。" })
  public dragExtraPadding: number = 0;

  /** 棋盘整体根节点。缩放 / 拖动只作用在这个节点上。 */
  public gameRoot: Node = null;

  /** 棋盘根节点。 */
  public boardRoot: Node = null;

  /** 棋盘底座层。 */
  public boardBaseRoot: Node = null;

  /** 格子层。 */
  public tileRoot: Node = null;

  /** 钻石 / 方块层。 */
  public blockRoot: Node = null;

  private designWidth: number = 750;
  private designHeight: number = 1334;

  private isInited: boolean = false;

  private isPinching: boolean = false;
  private pinchStartDistance: number = 0;
  private pinchStartScale: number = 1;
  private pinchStartRootPos: Vec3 = new Vec3();

  private isTouchDown: boolean = false;
  private isDragging: boolean = false;
  private touchStartLocal: Vec3 = new Vec3();
  private lastTouchLocal: Vec3 = new Vec3();

  private isMouseDown: boolean = false;
  private isMouseDragging: boolean = false;
  private mouseStartLocal: Vec3 = new Vec3();
  private lastMouseLocal: Vec3 = new Vec3();

  public init(designWidth: number = 750, designHeight: number = 1334) {
    if (this.isInited) {
      return;
    }

    this.isInited = true;
    this.designWidth = designWidth;
    this.designHeight = designHeight;

    if (this.minScale < this.baseScale) {
      this.minScale = this.baseScale;
    }

    this.ensureSelfTransform();
    this.createMapNodes();
    this.bindEvents();
    this.resetView();
  }

  private ensureSelfTransform() {
    let transform = this.node.getComponent(UITransform);

    if (!transform) {
      transform = this.node.addComponent(UITransform);
    }

    transform.setContentSize(this.designWidth, this.designHeight);
  }

  private createMapNodes() {
    this.gameRoot = this.getOrCreateNode("GameRoot", this.node, this.designWidth, this.designHeight);

    this.boardRoot = this.getOrCreateNode("BoardRoot", this.gameRoot, this.designWidth, 760);
    this.boardBaseRoot = this.getOrCreateNode("BoardBaseRoot", this.boardRoot, this.designWidth, 760);
    this.tileRoot = this.getOrCreateNode("TileRoot", this.boardRoot, this.designWidth, 760);

    /**
     * BlockRoot 必须在 GameRoot 下。
     * 这样缩放 / 拖动时，格子和钻石会一起动。
     */
    this.blockRoot = this.getOrCreateNode("BlockRoot", this.gameRoot, this.designWidth, this.designHeight);
  }

  private getOrCreateNode(name: string, parent: Node, width: number, height: number): Node {
    let node = parent.getChildByName(name);

    if (!node) {
      node = new Node(name);
      parent.addChild(node);
    }

    let transform = node.getComponent(UITransform);

    if (!transform) {
      transform = node.addComponent(UITransform);
    }

    transform.setContentSize(width, height);

    return node;
  }

  private bindEvents() {
    this.node.on(Node.EventType.TOUCH_START, this.onTouchStart, this);
    this.node.on(Node.EventType.TOUCH_MOVE, this.onTouchMove, this);
    this.node.on(Node.EventType.TOUCH_END, this.onTouchEnd, this);
    this.node.on(Node.EventType.TOUCH_CANCEL, this.onTouchEnd, this);

    /** 编辑器 / PC 预览鼠标事件 */
    this.node.on(Node.EventType.MOUSE_DOWN, this.onMouseDown, this);
    this.node.on(Node.EventType.MOUSE_MOVE, this.onMouseMove, this);
    this.node.on(Node.EventType.MOUSE_UP, this.onMouseUp, this);
    this.node.on(Node.EventType.MOUSE_LEAVE, this.onMouseUp, this);
    this.node.on(Node.EventType.MOUSE_WHEEL, this.onMouseWheel, this);
  }

  private onTouchStart(event: EventTouch) {
    if (!this.gameRoot) {
      return;
    }

    const touches = event.getTouches();

    if (this.enablePinchZoom && touches.length >= 2) {
      this.startPinch(event);
      event.propagationStopped = true;
      return;
    }

    if (!this.canDragNow() || touches.length !== 1) {
      return;
    }

    const local = this.getTouchLocal(event);

    if (!local) {
      return;
    }

    this.isTouchDown = true;
    this.isDragging = false;
    this.touchStartLocal.set(local);
    this.lastTouchLocal.set(local);
  }

  private onTouchMove(event: EventTouch) {
    if (!this.gameRoot) {
      return;
    }

    const touches = event.getTouches();

    if (this.enablePinchZoom && touches.length >= 2) {
      if (!this.isPinching) {
        this.startPinch(event);
      } else {
        this.updatePinch(event);
      }

      event.propagationStopped = true;
      return;
    }

    if (!this.canDragNow() || !this.isTouchDown) {
      return;
    }

    const local = this.getTouchLocal(event);

    if (!local) {
      return;
    }

    const totalDx = local.x - this.touchStartLocal.x;
    const totalDy = local.y - this.touchStartLocal.y;
    const totalDistance = Math.sqrt(totalDx * totalDx + totalDy * totalDy);

    if (!this.isDragging) {
      if (totalDistance < this.dragStartDistance) {
        return;
      }

      this.isDragging = true;
    }

    const dx = local.x - this.lastTouchLocal.x;
    const dy = local.y - this.lastTouchLocal.y;

    this.moveGameRoot(dx, dy);
    this.lastTouchLocal.set(local);

    event.propagationStopped = true;
  }

  private onTouchEnd(event: EventTouch) {
    if (this.isPinching) {
      this.isPinching = false;
      event.propagationStopped = true;
    }

    if (this.isDragging) {
      event.propagationStopped = true;
    }

    this.isTouchDown = false;
    this.isDragging = false;
  }

  private onMouseDown(event: EventMouse) {
    if (!this.canDragNow() || !this.gameRoot) {
      return;
    }

    if (event.getButton() !== EventMouse.BUTTON_LEFT) {
      return;
    }

    const local = this.getMouseLocal(event);

    if (!local) {
      return;
    }

    this.isMouseDown = true;
    this.isMouseDragging = false;
    this.mouseStartLocal.set(local);
    this.lastMouseLocal.set(local);
  }

  private onMouseMove(event: EventMouse) {
    if (!this.canDragNow() || !this.gameRoot || !this.isMouseDown) {
      return;
    }

    const local = this.getMouseLocal(event);

    if (!local) {
      return;
    }

    const totalDx = local.x - this.mouseStartLocal.x;
    const totalDy = local.y - this.mouseStartLocal.y;
    const totalDistance = Math.sqrt(totalDx * totalDx + totalDy * totalDy);

    if (!this.isMouseDragging) {
      if (totalDistance < this.dragStartDistance) {
        return;
      }

      this.isMouseDragging = true;
    }

    const dx = local.x - this.lastMouseLocal.x;
    const dy = local.y - this.lastMouseLocal.y;

    this.moveGameRoot(dx, dy);
    this.lastMouseLocal.set(local);

    event.propagationStopped = true;
  }

  private onMouseUp(event: EventMouse) {
    if (this.isMouseDragging) {
      event.propagationStopped = true;
    }

    this.isMouseDown = false;
    this.isMouseDragging = false;
  }

  private onMouseWheel(event: EventMouse) {
    if (!this.enableMouseWheelZoom || !this.gameRoot) {
      return;
    }

    const scrollY = event.getScrollY();

    if (scrollY === 0) {
      return;
    }

    const oldScale = this.gameRoot.scale.x;
    const targetScale = this.clamp(oldScale + scrollY * this.mouseWheelZoomSpeed, this.minScale, this.maxScale);

    if (Math.abs(targetScale - oldScale) <= 0.0001) {
      return;
    }

    const mouseLocal = this.getMouseLocal(event);

    if (!mouseLocal) {
      this.setScaleAndLimitPosition(targetScale, this.gameRoot.position.x, this.gameRoot.position.y);
      event.propagationStopped = true;
      return;
    }

    this.zoomAtLocalPoint(mouseLocal, oldScale, targetScale);
    event.propagationStopped = true;
  }

  private canDragNow(): boolean {
    if (!this.enableDrag || !this.gameRoot) {
      return false;
    }

    /** 必须放大后才能拖动。 */
    return this.gameRoot.scale.x > this.baseScale + 0.0001;
  }

  private moveGameRoot(dx: number, dy: number) {
    if (!this.gameRoot) {
      return;
    }

    const scale = this.gameRoot.scale.x;

    if (scale <= this.baseScale + 0.0001) {
      this.gameRoot.setPosition(0, 0, this.gameRoot.position.z);
      return;
    }

    const targetX = this.gameRoot.position.x + dx;
    const targetY = this.gameRoot.position.y + dy;
    const limitedPos = this.getLimitedPosition(targetX, targetY, scale);

    this.gameRoot.setPosition(limitedPos.x, limitedPos.y, this.gameRoot.position.z);
  }

  private startPinch(event: EventTouch) {
    const touches = event.getTouches();

    if (touches.length < 2) {
      return;
    }

    this.isPinching = true;
    this.isTouchDown = false;
    this.isDragging = false;

    this.pinchStartDistance = this.getTouchDistance(event);
    this.pinchStartScale = this.gameRoot.scale.x;
    this.pinchStartRootPos.set(this.gameRoot.position);
  }

  private updatePinch(event: EventTouch) {
    if (!this.isPinching || this.pinchStartDistance <= 0) {
      return;
    }

    const currentDistance = this.getTouchDistance(event);
    const scaleRatio = currentDistance / this.pinchStartDistance;
    const targetScale = this.clamp(this.pinchStartScale * scaleRatio, this.minScale, this.maxScale);
    const centerLocal = this.getTouchCenterLocal(event);

    if (!centerLocal) {
      this.setScaleAndLimitPosition(targetScale, this.gameRoot.position.x, this.gameRoot.position.y);
      return;
    }

    const finalRatio = targetScale / this.pinchStartScale;
    const newX = centerLocal.x + (this.pinchStartRootPos.x - centerLocal.x) * finalRatio;
    const newY = centerLocal.y + (this.pinchStartRootPos.y - centerLocal.y) * finalRatio;

    this.setScaleAndLimitPosition(targetScale, newX, newY);
  }

  private zoomAtLocalPoint(localPoint: Vec3, oldScale: number, newScale: number) {
    if (!this.gameRoot || oldScale <= 0) {
      return;
    }

    const ratio = newScale / oldScale;
    const oldPos = this.gameRoot.position;
    const newX = localPoint.x + (oldPos.x - localPoint.x) * ratio;
    const newY = localPoint.y + (oldPos.y - localPoint.y) * ratio;

    this.setScaleAndLimitPosition(newScale, newX, newY);
  }

  private setScaleAndLimitPosition(scale: number, x: number, y: number) {
    if (!this.gameRoot) {
      return;
    }

    if (scale <= this.baseScale + 0.0001) {
      this.gameRoot.setScale(this.baseScale, this.baseScale, 1);
      this.gameRoot.setPosition(0, 0, this.gameRoot.position.z);
      return;
    }

    const limitedPos = this.getLimitedPosition(x, y, scale);

    this.gameRoot.setScale(scale, scale, 1);
    this.gameRoot.setPosition(limitedPos.x, limitedPos.y, this.gameRoot.position.z);
  }

  private getLimitedPosition(x: number, y: number, scale: number): Vec3 {
    /**
     * 以 MapControl 节点自身尺寸作为可视区域。
     * 如果编辑器里 MapControl 节点不是 750x1334，也可以自动适配。
     */
    const transform = this.node.getComponent(UITransform);
    const viewWidth = transform?.width || this.designWidth;
    const viewHeight = transform?.height || this.designHeight;

    /** 放大后多出来的区域，才是允许拖动的范围。 */
    const scaledWidth = this.designWidth * scale;
    const scaledHeight = this.designHeight * scale;

    const maxX = Math.max(0, (scaledWidth - viewWidth) * 0.5 + this.dragExtraPadding);
    const maxY = Math.max(0, (scaledHeight - viewHeight) * 0.5 + this.dragExtraPadding);

    return new Vec3(this.clamp(x, -maxX, maxX), this.clamp(y, -maxY, maxY), 0);
  }

  private getTouchDistance(event: EventTouch): number {
    const touches = event.getTouches();

    if (touches.length < 2) {
      return 0;
    }

    const p1 = touches[0].getUILocation();
    const p2 = touches[1].getUILocation();
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;

    return Math.sqrt(dx * dx + dy * dy);
  }

  private getTouchCenterLocal(event: EventTouch): Vec3 | null {
    const touches = event.getTouches();

    if (touches.length < 2) {
      return null;
    }

    const p1 = touches[0].getUILocation();
    const p2 = touches[1].getUILocation();
    return this.convertUILocationToLocal((p1.x + p2.x) * 0.5, (p1.y + p2.y) * 0.5);
  }

  private getTouchLocal(event: EventTouch): Vec3 | null {
    const location = event.getUILocation();
    return this.convertUILocationToLocal(location.x, location.y);
  }

  private getMouseLocal(event: EventMouse): Vec3 | null {
    const anyEvent = event as any;

    if (anyEvent.getUILocation) {
      const location = anyEvent.getUILocation();
      return this.convertUILocationToLocal(location.x, location.y);
    }

    const location = event.getLocation();
    return this.convertUILocationToLocal(location.x, location.y);
  }

  private convertUILocationToLocal(x: number, y: number): Vec3 | null {
    const transform = this.node.getComponent(UITransform);

    if (!transform) {
      return null;
    }

    return transform.convertToNodeSpaceAR(v3(x, y, 0));
  }

  public resetView() {
    if (!this.gameRoot) {
      return;
    }

    this.gameRoot.setScale(this.baseScale, this.baseScale, 1);
    this.gameRoot.setPosition(0, 0, 0);
  }

  public setViewScale(scale: number) {
    if (!this.gameRoot) {
      return;
    }

    const finalScale = this.clamp(scale, this.minScale, this.maxScale);
    this.setScaleAndLimitPosition(finalScale, this.gameRoot.position.x, this.gameRoot.position.y);
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  protected onDestroy() {
    this.node.off(Node.EventType.TOUCH_START, this.onTouchStart, this);
    this.node.off(Node.EventType.TOUCH_MOVE, this.onTouchMove, this);
    this.node.off(Node.EventType.TOUCH_END, this.onTouchEnd, this);
    this.node.off(Node.EventType.TOUCH_CANCEL, this.onTouchEnd, this);

    this.node.off(Node.EventType.MOUSE_DOWN, this.onMouseDown, this);
    this.node.off(Node.EventType.MOUSE_MOVE, this.onMouseMove, this);
    this.node.off(Node.EventType.MOUSE_UP, this.onMouseUp, this);
    this.node.off(Node.EventType.MOUSE_LEAVE, this.onMouseUp, this);
    this.node.off(Node.EventType.MOUSE_WHEEL, this.onMouseWheel, this);
  }
}
