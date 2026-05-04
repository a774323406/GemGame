import { _decorator, Component, Node, director, instantiate, Prefab, UITransform, Widget, Canvas } from "cc";
import UIBase from "./UIBase";
import gamePrefabMgr from "../../gamePrefabMgr";

const { ccclass } = _decorator;

export enum UILayer {
  Normal = "Normal",
  Popup = "Popup",
  Top = "Top",
  Tips = "Tips",
}

@ccclass("UIManager")
export default class UIManager extends Component {
  private static _instance: UIManager | null = null;
  private static readonly ROOT_NAME = "__UIManager__";

  public static get instance(): UIManager | null {
    if (this._instance && this._instance.isValid) {
      this._instance.ensureSceneUIRoot();
      return this._instance;
    }

    const scene = director.getScene();

    if (!scene) {
      console.error("[UIManager] 当前场景不存在");
      return null;
    }

    /**
     * UIManager 自己不要挂在 Canvas 下。
     * 它作为一个独立的常驻节点。
     */
    let mgrNode = scene.getChildByName(UIManager.ROOT_NAME);

    if (!mgrNode) {
      mgrNode = new Node(UIManager.ROOT_NAME);
      mgrNode.parent = scene;
    }

    let mgr = mgrNode.getComponent(UIManager);

    if (!mgr) {
      mgr = mgrNode.addComponent(UIManager);
    }

    this._instance = mgr;
    this._instance.ensureSceneUIRoot();

    return this._instance;
  }

  private uiRoot: Node | null = null;
  private canvas: Node | null = null;

  /**
   * 自动管理所有 UI 层级。
   *
   * key: UILayer.Normal / UILayer.Popup / UILayer.Top / UILayer.Tips
   * value: 对应的节点 Canvas/UIRoot/Normal ...
   */
  private layerMap: Map<UILayer, Node> = new Map();

  /**
   * 已打开的 UI
   */
  private openedMap: Map<string | number, Node> = new Map();

  /**
   * 记录每个 UI 当前所在层级。
   * 用于切换场景后重新挂回对应层级。
   */
  private openedLayerMap: Map<string | number, UILayer> = new Map();

  onLoad() {
    if (UIManager._instance && UIManager._instance !== this) {
      this.node.destroy();
      return;
    }

    UIManager._instance = this;
    director.addPersistRootNode(this.node);

    this.ensureSceneUIRoot();
  }

  onDestroy() {
    if (UIManager._instance === this) {
      UIManager._instance = null;
    }
  }

  /**
   * 确保存在常驻 UI Root。
   *
   * 注意：
   * 这里不再使用场景里的 Canvas。
   * 所有 UI 都挂在 __UIManager__/GlobalCanvas/UIRoot 下。
   * 这样切换场景时 UI 不会丢失。
   */
  private ensureSceneUIRoot() {
    /**
     * UIManager 自己已经是常驻节点。
     * 这里在它下面创建一个常驻 Canvas。
     */
    let canvasNode = this.node.getChildByName("GlobalCanvas");

    if (!canvasNode) {
      canvasNode = new Node("GlobalCanvas");
      canvasNode.parent = this.node;
    }

    let canvas = canvasNode.getComponent(Canvas);

    if (!canvas) {
      canvas = canvasNode.addComponent(Canvas);
    }

    /**
     * 这个 canvasNode 就作为 UIManager 的全局 Canvas。
     */
    this.canvas = canvasNode;

    this.makeFullScreenLayer(canvasNode);

    this.uiRoot = canvasNode.getChildByName("UIRoot");

    if (!this.uiRoot) {
      this.uiRoot = new Node("UIRoot");
      this.uiRoot.parent = canvasNode;
    }

    this.makeFullScreenLayer(this.uiRoot);

    /**
     * 根据 UILayer 枚举自动创建：
     * Normal / Popup / Top / Tips
     */
    this.createLayersByEnum();
  }

  /**
   * 根据 UILayer 枚举自动创建所有层级。
   *
   * 枚举顺序就是层级顺序：
   * Normal -> Popup -> Top -> Tips
   *
   * 后面的 siblingIndex 更大，所以 Tips 会在最上层。
   */
  private createLayersByEnum() {
    if (!this.uiRoot) {
      return;
    }

    this.layerMap.clear();

    const layerList = this.getAllUILayers();

    for (let i = 0; i < layerList.length; i++) {
      const layer = layerList[i] as UILayer;
      const layerNode = this.getOrCreateLayer(layer);

      layerNode.setSiblingIndex(i);

      this.layerMap.set(layer, layerNode);
    }
  }

  /**
   * 获取或者创建某个 UI 层级节点
   */
  private getOrCreateLayer(layer: UILayer): Node {
    let layerNode = this.uiRoot!.getChildByName(layer);

    if (!layerNode) {
      layerNode = new Node(layer);
      layerNode.parent = this.uiRoot!;
    }

    this.makeFullScreenLayer(layerNode);

    return layerNode;
  }

  /**
   * 让节点铺满父节点
   */
  private makeFullScreenLayer(node: Node) {
    let uiTransform = node.getComponent(UITransform);

    if (!uiTransform) {
      uiTransform = node.addComponent(UITransform);
    }

    let widget = node.getComponent(Widget);

    if (!widget) {
      widget = node.addComponent(Widget);
    }

    widget.isAlignTop = true;
    widget.isAlignBottom = true;
    widget.isAlignLeft = true;
    widget.isAlignRight = true;

    widget.top = 0;
    widget.bottom = 0;
    widget.left = 0;
    widget.right = 0;

    node.setPosition(0, 0, 0);
  }

  /**
   * 场景切换后，把所有已打开 UI 重新挂到新场景的对应层级。
   */
  private rebindOpenedUIs() {
    if (!this.uiRoot) {
      return;
    }

    this.openedMap.forEach((node, uiKey) => {
      if (!node || !node.isValid) {
        return;
      }

      const layer = this.openedLayerMap.get(uiKey) ?? UILayer.Popup;

      this.moveToLayer(node, layer);
    });
  }

  /**
   * 打开 UI
   *
   * @param uiKey uiName.xxx
   * @param data 传给 UIBase.onOpen 的参数
   * @param layer UI层级，默认 Popup
   */
  public open(uiKey: string | number, data?: any, layer: UILayer = UILayer.Popup): Node | null {
    this.ensureSceneUIRoot();

    let node = this.openedMap.get(uiKey);

    /**
     * 已经打开过，直接复用。
     */
    if (node && node.isValid) {
      this.moveToLayer(node, layer);

      this.openedLayerMap.set(uiKey, layer);

      node.active = true;

      const ui = node.getComponent(UIBase);

      if (ui) {
        ui.show(data);
      }

      return node;
    }

    const prefab = gamePrefabMgr.Instance.uiPre[uiKey];

    if (!prefab) {
      console.warn("[UIManager] 预制体未加载完成, uiKey =", uiKey);
      return null;
    }

    node = instantiate(prefab as Prefab);

    this.moveToLayer(node, layer);

    this.openedMap.set(uiKey, node);
    this.openedLayerMap.set(uiKey, layer);

    const ui = node.getComponent(UIBase);

    if (ui) {
      ui.show(data);
    } else {
      node.active = true;
    }

    return node;
  }

  /**
   * 关闭 UI
   *
   * 注意：
   * 这里只是隐藏，不销毁。
   */
  public close(uiKey: string | number) {
    const node = this.openedMap.get(uiKey);

    if (!node || !node.isValid) {
      return;
    }

    const ui = node.getComponent(UIBase);

    if (ui) {
      ui.hide();
    } else {
      node.active = false;
    }
  }

  /**
   * 销毁 UI
   */
  public destroyUI(uiKey: string | number) {
    const node = this.openedMap.get(uiKey);

    if (!node || !node.isValid) {
      return;
    }

    this.openedMap.delete(uiKey);
    this.openedLayerMap.delete(uiKey);

    node.destroy();
  }

  /**
   * 获取已经打开过的 UI 节点
   */
  public getUI(uiKey: string | number): Node | null {
    const node = this.openedMap.get(uiKey);

    return node && node.isValid ? node : null;
  }

  /**
   * 移动 UI 到指定层级，并放到该层级最上面
   */
  private moveToLayer(node: Node, layer: UILayer) {
    const parent = this.layerMap.get(layer);

    if (!parent) {
      console.warn("[UIManager] 找不到 UI 层级", layer);
      return;
    }

    node.parent = parent;
    node.setPosition(0, 0, 0);

    /**
     * 重点：
     * 每次 open / 重新 open 的时候，都把这个 UI 放到当前层级最上面。
     */
    node.setSiblingIndex(parent.children.length - 1);
  }

  /**
   * 获取所有 UILayer。
   *
   */
  private getAllUILayers(): UILayer[] {
    const list: UILayer[] = [];

    for (const key in UILayer) {
      list.push(UILayer[key as keyof typeof UILayer]);
    }

    return list;
  }
}
