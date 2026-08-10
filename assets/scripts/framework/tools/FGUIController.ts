import {
  _decorator,
  CCClass,
  CCFloat,
  CCInteger,
  CCString,
  Color,
  Component,
  Enum,
  Label,
  Node,
  Size,
  Sprite,
  SpriteFrame,
  UITransform,
  Vec3,
} from "cc";
import { EDITOR_NOT_IN_PREVIEW } from "cc/env";

const { ccclass, property, executeInEditMode, menu } = _decorator;

export enum FGUIControllerPageIndex {}

Enum(FGUIControllerPageIndex);

export enum FGUIControllerStatePageIndex {}

Enum(FGUIControllerStatePageIndex);

@ccclass("FGUIControllerPage")
export class FGUIControllerPage {
  @property(CCString)
  name: string = "";

  @property({ type: CCInteger, displayName: "Index", readonly: true })
  id: number = 0;

  constructor(name: string = "", id: number = 0) {
    this.name = name;
    this.id = id;
  }
}

@ccclass("FGUIControllerState")
export class FGUIControllerState {
  @property({ type: CCString, visible: false })
  pageName: string = "";

  @property({
    type: FGUIControllerStatePageIndex,
    displayName: "Page Name",
    tooltip: "对应 Pages 里的状态名",
  })
  pageIndex: number = -1;

  @property({ tooltip: "是否覆盖节点显隐" })
  useActive: boolean = true;

  @property({
    tooltip: "当前状态下节点是否显示",
    visible() {
      return this.useActive;
    },
  })
  active: boolean = true;

  @property({ tooltip: "是否覆盖节点位置" })
  usePosition: boolean = false;

  @property({
    tooltip: "当前状态下节点位置",
    visible() {
      return this.usePosition;
    },
  })
  position: Vec3 = new Vec3();

  @property({ tooltip: "是否覆盖 Sprite.spriteFrame" })
  useSpriteFrame: boolean = false;

  @property({
    type: SpriteFrame,
    tooltip: "当前状态下使用的图片",
    visible() {
      return this.useSpriteFrame;
    },
  })
  spriteFrame: SpriteFrame | null = null;

  @property({ tooltip: "是否覆盖 Label.string" })
  useLabel: boolean = false;

  @property({
    displayName: "Label Text",
    tooltip: "当前状态下使用的文字",
    visible() {
      return this.useLabel;
    },
  })
  label: string = "";

  @property({ tooltip: "是否覆盖 Label 的字体大小" })
  useLabelFontSize: boolean = false;

  @property({
    type: CCInteger,
    displayName: "Label Font Size",
    tooltip: "当前状态下 Label 使用的字体大小",
    visible() {
      return this.useLabelFontSize;
    },
  })
  labelFontSize: number = 40;

  @property({ tooltip: "是否覆盖 Label 的颜色" })
  useLabelColor: boolean = false;

  @property({
    displayName: "Label Color",
    tooltip: "当前状态下 Label 使用的颜色",
    visible() {
      return this.useLabelColor;
    },
  })
  labelColor: Color = new Color(255, 255, 255, 255);

  @property({ tooltip: "是否覆盖 Label 的外边框设置" })
  useLabelOutline: boolean = false;

  @property({
    displayName: "Enable Outline",
    tooltip: "当前状态下 Label 是否显示外边框",
    visible() {
      return this.useLabelOutline;
    },
  })
  labelOutline: boolean = false;

  @property({
    displayName: "Outline Color",
    tooltip: "当前状态下 Label 外边框颜色",
    visible() {
      return this.useLabelOutline && this.labelOutline;
    },
  })
  labelOutlineColor: Color = new Color(0, 0, 0, 255);

  @property({
    type: CCFloat,
    displayName: "Outline Width",
    tooltip: "当前状态下 Label 外边框宽度",
    visible() {
      return this.useLabelOutline && this.labelOutline;
    },
  })
  labelOutlineWidth: number = 2;

  @property({ tooltip: "是否覆盖 Sprite/Label 的颜色" })
  useColor: boolean = false;

  @property({
    tooltip: "当前状态下使用的颜色",
    visible() {
      return this.useColor;
    },
  })
  color: Color = new Color(255, 255, 255, 255);

  public syncPage(pages: FGUIControllerPage[]): void {
    if (pages.length <= 0) {
      this.pageIndex = -1;
      return;
    }

    if (this.pageIndex < 0 && this.pageName) {
      const legacyIndex = pages.findIndex((page) => page.name === this.pageName);
      if (legacyIndex >= 0) {
        this.pageIndex = legacyIndex;
      }
    }

    if (!Number.isInteger(this.pageIndex) || this.pageIndex < 0 || this.pageIndex >= pages.length) {
      this.pageIndex = 0;
    }

    this.pageName = pages[this.pageIndex]?.name ?? this.pageName;
  }

  public getPageName(pages: FGUIControllerPage[]): string {
    return pages[this.pageIndex]?.name ?? this.pageName;
  }
}

@ccclass("FGUIControllerTarget")
export class FGUIControllerTarget {
  @property({ type: Node, tooltip: "被控制的节点" })
  target: Node | null = null;

  @property({ type: [FGUIControllerState], tooltip: "该节点在各状态下的表现" })
  states: FGUIControllerState[] = [];
}

@ccclass("FGUIControllerRecordedNode")
export class FGUIControllerRecordedNode {
  @property({ type: Node })
  target: Node | null = null;

  @property
  useActive: boolean = true;

  @property
  active: boolean = true;

  @property
  usePosition: boolean = false;

  @property
  position: Vec3 = new Vec3();

  @property
  useScale: boolean = false;

  @property
  scale: Vec3 = new Vec3(1, 1, 1);

  @property
  useContentSize: boolean = false;

  @property
  contentSize: Size = new Size();

  @property
  hasSprite: boolean = false;

  @property({ type: SpriteFrame })
  spriteFrame: SpriteFrame | null = null;

  @property
  spriteColor: Color = new Color(255, 255, 255, 255);

  @property
  hasLabel: boolean = false;

  @property
  label: string = "";

  @property
  labelFontSize: number = 40;

  @property
  labelColor: Color = new Color(255, 255, 255, 255);

  @property
  labelOutline: boolean = false;

  @property
  labelOutlineColor: Color = new Color(0, 0, 0, 255);

  @property
  labelOutlineWidth: number = 2;
}

@ccclass("FGUIControllerRecordedPage")
export class FGUIControllerRecordedPage {
  @property
  pageIndex: number = -1;

  @property({ type: [FGUIControllerRecordedNode] })
  nodes: FGUIControllerRecordedNode[] = [];
}

@ccclass("FGUIController")
@executeInEditMode(true)
@menu("Framework/FGUIController")
export default class FGUIController extends Component {
  @property({ visible: false })
  private _selectedIndex: number = 0;

  @property({ visible: false })
  private _pages: FGUIControllerPage[] = [];

  @property({ visible: false, type: [FGUIControllerRecordedPage] })
  private _recordedPages: FGUIControllerRecordedPage[] = [];

  @property({ type: [FGUIControllerTarget], tooltip: "被该控制器影响的节点" })
  targets: FGUIControllerTarget[] = [];

  @property({ tooltip: "编辑器下切换 selectedIndex 时，自动记录上一状态并应用新状态" })
  autoRecord: boolean = false;

  @property({
    type: Node,
    displayName: "Auto Record Root",
    tooltip: "拖入一个根节点；切换 selectedIndex 时会记录该节点及所有子节点的状态。为空时使用当前节点",
    visible() {
      return this.autoRecord;
    },
  })
  autoRecordRoot: Node | null = null;

  @property({
    displayName: "Record Self",
    tooltip: "是否记录根节点自身；关闭后只记录根节点的子节点",
    visible() {
      return this.autoRecord;
    },
  })
  autoRecordSelf: boolean = true;

  @property({
    displayName: "Record Active",
    tooltip: "自动记录节点显隐",
    visible() {
      return this.autoRecord;
    },
  })
  autoRecordActive: boolean = true;

  @property({
    displayName: "Record Position",
    tooltip: "自动记录节点位置。List、Layout、Widget、屏幕适配控制的位置建议保持关闭",
    visible() {
      return this.autoRecord;
    },
  })
  autoRecordPosition: boolean = false;

  @property({
    displayName: "Record Scale",
    tooltip: "自动记录节点缩放。适配或动画控制缩放时建议保持关闭",
    visible() {
      return this.autoRecord;
    },
  })
  autoRecordScale: boolean = false;

  @property({
    displayName: "Record Content Size",
    tooltip: "自动记录 UITransform Content Size。Layout、Widget、适配控制尺寸时建议保持关闭",
    visible() {
      return this.autoRecord;
    },
  })
  autoRecordContentSize: boolean = false;

  @property({ tooltip: "手动刷新状态" })
  get refresh(): boolean {
    return false;
  }
  private set refresh(value: boolean) {
    if (value) {
      this.refreshPageEnum();
      this.recordCurrentPageInEditor();
      this.apply();
    }
  }

  @property({
    type: FGUIControllerPageIndex,
    displayName: "selectedIndex",
    tooltip: "当前选中的状态索引，从 0 开始，对应 Pages 数组下标，显示格式为 index:name",
  })
  get selectedIndex(): number {
    return this._selectedIndex;
  }
  set selectedIndex(value: number) {
    this.ensurePages();
    const nextIndex = this.clampPageIndex(value);
    if (this._selectedIndex !== nextIndex) {
      this.recordCurrentPageInEditor();
    }

    if (this._selectedIndex !== nextIndex) {
      this._selectedIndex = nextIndex;
    }

    this.apply();
  }

  @property({ type: [FGUIControllerPage], tooltip: "该控制器拥有的状态列表，不是控制器数量" })
  get pages(): FGUIControllerPage[] {
    this.ensurePages();
    return this._pages;
  }
  private set pages(value: FGUIControllerPage[]) {
    this._pages = value || [];
    this.ensurePages();
    this.normalizePages();
    this._selectedIndex = this.clampPageIndex(this._selectedIndex);
    this.refreshPageEnum();
    this.apply();
  }

  public get selectedPage(): string {
    this.ensurePages();
    return this._pages[this._selectedIndex]?.name ?? "";
  }
  public set selectedPage(value: string) {
    this.setSelectedPage(value);
  }

  protected __preload(): void {
    this.ensurePages();
    this.normalizePages();
    this.refreshPageEnum();
    this.apply();
  }

  protected onLoad(): void {
    this.ensurePages();
    this.refreshPageEnum();
    this.apply();
  }

  protected onEnable(): void {
    this.ensurePages();
    this.refreshPageEnum();
    this.apply();
  }

  public setSelectedIndex(index: number): void {
    this.selectedIndex = index;
  }

  public setSelectedPage(pageName: string): void {
    this.ensurePages();
    const index = this._pages.findIndex((page) => page.name === pageName);
    if (index < 0) {
      console.warn(`[FGUIController] 找不到状态: ${pageName}`);
      return;
    }

    this.selectedIndex = index;
  }

  public nextPage(): void {
    this.selectedIndex = this._selectedIndex + 1;
  }

  public previousPage(): void {
    this.selectedIndex = this._selectedIndex - 1;
  }

  public apply(): void {
    this.ensurePages();
    this.syncStatePages();
    const pageName = this.selectedPage;
    if (!pageName) {
      return;
    }

    this.applyRecordedPage(this._selectedIndex);

    for (const targetConfig of this.targets) {
      this.applyTarget(pageName, targetConfig);
    }
  }

  public recordCurrentPage(): void {
    this.ensurePages();
    this.captureRecordedPage(this._selectedIndex);
  }

  private applyTarget(pageName: string, targetConfig: FGUIControllerTarget): void {
    const target = targetConfig.target;
    if (!target?.isValid) {
      return;
    }

    const hasActiveRule = targetConfig.states.some((item) => item.useActive);
    const state = targetConfig.states.find((item) => item.getPageName(this._pages) === pageName);
    if (!state) {
      if (hasActiveRule) {
        target.active = false;
      }
      return;
    }

    if (state.useActive) {
      target.active = state.active;
    } else if (hasActiveRule) {
      target.active = false;
    }

    if (state.usePosition) {
      target.setPosition(state.position);
    }

    if (state.useSpriteFrame) {
      const sprite = target.getComponent(Sprite);
      if (sprite) {
        sprite.spriteFrame = state.spriteFrame;
      }
    }

    if (state.useLabel) {
      const label = target.getComponent(Label);
      if (label) {
        label.string = state.label;
      }
    }

    if (state.useLabelFontSize) {
      const label = target.getComponent(Label);
      if (label) {
        label.fontSize = Math.max(0, state.labelFontSize);
      }
    }

    if (state.useColor) {
      const sprite = target.getComponent(Sprite);
      if (sprite) {
        sprite.color = state.color;
      }

      const label = target.getComponent(Label);
      if (label) {
        label.color = state.color;
      }
    }

    if (state.useLabelColor) {
      const label = target.getComponent(Label);
      if (label) {
        label.color = state.labelColor;
      }
    }

    if (state.useLabelOutline) {
      const label = target.getComponent(Label);
      if (label) {
        label.enableOutline = state.labelOutline;
        label.outlineColor = state.labelOutlineColor;
        label.outlineWidth = Math.max(0, state.labelOutlineWidth);
      }
    }
  }

  private ensurePages(): void {
    if (this._pages.length > 0) {
      return;
    }

    this._pages = [new FGUIControllerPage("default", 0)];
  }

  private recordCurrentPageInEditor(): void {
    if (!EDITOR_NOT_IN_PREVIEW || !this.autoRecord) {
      return;
    }

    this.captureRecordedPage(this._selectedIndex);
  }

  private captureRecordedPage(pageIndex: number): void {
    const root = this.getAutoRecordRoot();
    if (!root?.isValid) {
      return;
    }

    const page = this.getOrCreateRecordedPage(pageIndex);
    page.nodes = this.collectRecordTargets(root).map((target) => this.createRecordedNode(target));
  }

  private applyRecordedPage(pageIndex: number): void {
    const page = this._recordedPages.find((item) => item.pageIndex === pageIndex);
    if (!page) {
      return;
    }

    for (const record of page.nodes) {
      this.applyRecordedNode(record);
    }
  }

  private getOrCreateRecordedPage(pageIndex: number): FGUIControllerRecordedPage {
    let page = this._recordedPages.find((item) => item.pageIndex === pageIndex);
    if (!page) {
      page = new FGUIControllerRecordedPage();
      page.pageIndex = pageIndex;
      this._recordedPages.push(page);
    }

    return page;
  }

  private getAutoRecordRoot(): Node | null {
    return this.autoRecordRoot || this.node;
  }

  private collectRecordTargets(root: Node): Node[] {
    const nodes: Node[] = [];
    const visit = (node: Node, includeSelf: boolean) => {
      if (includeSelf) {
        nodes.push(node);
      }

      for (const child of node.children) {
        visit(child, true);
      }
    };

    visit(root, this.autoRecordSelf);
    return nodes;
  }

  private createRecordedNode(target: Node): FGUIControllerRecordedNode {
    const record = new FGUIControllerRecordedNode();
    record.target = target;
    record.useActive = this.autoRecordActive;
    record.active = target.active;

    record.usePosition = this.autoRecordPosition;
    if (record.usePosition) {
      record.position = target.position.clone();
    }

    record.useScale = this.autoRecordScale;
    if (record.useScale) {
      record.scale = target.scale.clone();
    }

    record.useContentSize = this.autoRecordContentSize;
    if (record.useContentSize) {
      const transform = target.getComponent(UITransform);
      if (transform) {
        record.contentSize = transform.contentSize.clone();
      } else {
        record.useContentSize = false;
      }
    }

    const sprite = target.getComponent(Sprite);
    if (sprite) {
      record.hasSprite = true;
      record.spriteFrame = sprite.spriteFrame;
      record.spriteColor = sprite.color.clone();
    }

    const label = target.getComponent(Label);
    if (label) {
      record.hasLabel = true;
      record.label = label.string;
      record.labelFontSize = label.fontSize;
      record.labelColor = label.color.clone();
      record.labelOutline = label.enableOutline;
      record.labelOutlineColor = label.outlineColor.clone();
      record.labelOutlineWidth = label.outlineWidth;
    }

    return record;
  }

  private applyRecordedNode(record: FGUIControllerRecordedNode): void {
    const target = record.target;
    if (!target?.isValid) {
      return;
    }

    if (record.useActive) {
      target.active = record.active;
    }

    if (record.usePosition) {
      target.setPosition(record.position);
    }

    if (record.useScale) {
      target.setScale(record.scale);
    }

    if (record.useContentSize) {
      const transform = target.getComponent(UITransform);
      if (transform) {
        transform.setContentSize(record.contentSize);
      }
    }

    if (record.hasSprite) {
      const sprite = target.getComponent(Sprite);
      if (sprite) {
        sprite.spriteFrame = record.spriteFrame;
        sprite.color = record.spriteColor;
      }
    }

    if (record.hasLabel) {
      const label = target.getComponent(Label);
      if (label) {
        label.string = record.label;
        label.fontSize = Math.max(0, record.labelFontSize);
        label.color = record.labelColor;
        label.enableOutline = record.labelOutline;
        label.outlineColor = record.labelOutlineColor;
        label.outlineWidth = Math.max(0, record.labelOutlineWidth);
      }
    }
  }

  private normalizePages(): void {
    const usedNames: Record<string, boolean> = {};

    for (let i = 0; i < this._pages.length; i++) {
      const page = this._pages[i];
      if (!page.name) {
        page.name = `state${i}`;
      }

      if (usedNames[page.name]) {
        page.name = `${page.name}_${i}`;
      }
      usedNames[page.name] = true;

      page.id = i;
    }
  }

  private refreshPageEnum(): void {
    this.ensurePages();
    const enumList = this._pages.map((page, index) => ({
      name: page.name,
      value: index,
    }));
    const selectedEnumList = this._pages.map((page, index) => ({
      name: `${index}:${page.name}`,
      value: index,
    }));

    CCClass.Attr.setClassAttr(this, "selectedIndex", "enumList", selectedEnumList);
    CCClass.Attr.setClassAttr(FGUIControllerState, "pageIndex", "enumList", enumList);
    for (const targetConfig of this.targets) {
      for (const state of targetConfig.states) {
        CCClass.Attr.setClassAttr(state, "pageIndex", "enumList", enumList);
      }
    }
  }

  private syncStatePages(): void {
    for (const targetConfig of this.targets) {
      for (const state of targetConfig.states) {
        state.syncPage(this._pages);
      }
    }
  }

  private clampPageIndex(index: number): number {
    if (this._pages.length <= 0) {
      return 0;
    }

    return Math.min(Math.max(0, Math.floor(index)), this._pages.length - 1);
  }
}
