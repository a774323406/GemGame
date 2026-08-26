import {
  _decorator,
  Button,
  Color,
  Component,
  game,
  Game,
  Graphics,
  HorizontalTextAlignment,
  Label,
  Node,
  sys,
  UITransform,
  VerticalTextAlignment,
} from "cc";
import UIManager from "./framework/ui/UIManager";
import { uiName } from "./gamePrefabMgr";
import { SidebarRewardService, SidebarRewardState } from "./framework/Platform/SidebarRewardService";
import { GameSceneBundle, GameSceneName } from "./framework/GameSceneBundle";
import { FeedRevisitService, FeedSubscribeResult } from "./framework/Platform/FeedRevisitService";
import { SdkUtils } from "./framework/Platform/sdk/SdkUtils";
import { ToolInventory } from "./ToolInventory";
import { ShareRewardService } from "./framework/Platform/ShareRewardService";
import { GameConfig } from "./GameConfig";
const { ccclass, property } = _decorator;

@ccclass("mainScene")
export class mainScene extends Component {
  @property(Button)
  startBtn: Button = null;
  @property(Button)
  settingBtn: Button = null;

  @property(Label)
  goldLabel: Label = null;

  @property(Button)
  clearBtn: Button = null;

  @property(Button)
  sidebarBtn: Button = null;

  @property(Button)
  shareBtn: Button = null;

  @property(Node)
  shareRedDot: Node = null;
  @property(Button)
  shootingGameBtn: Button = null;
  @property(Button)
  archeryGameBtn: Button = null;
  @property(Button)
  juggleBallGameBtn: Button = null;
  private milkTeaGameBtn: Button | null = null;
  private feedSubscribeBtn: Button | null = null;
  private shareInFlight = false;

  protected onLoad(): void {
    this.startBtn?.node?.on("click", this.startGame, this);
    this.clearBtn?.node?.on(Node.EventType.TOUCH_END, this.clearData, this);
    this.settingBtn?.node?.on(Node.EventType.TOUCH_END, this.showSettingPanel, this);
    this.sidebarBtn?.node?.on(Button.EventType.CLICK, this.showSidebarRewardPanel, this);
    this.shareBtn?.node?.on(Button.EventType.CLICK, this.onShareClicked, this);
    this.shootingGameBtn?.node?.on(Button.EventType.CLICK, this.gotoShootingGlassBottles, this);
    this.archeryGameBtn?.node?.on(Button.EventType.CLICK, this.gotoArcheryGame, this);
    this.juggleBallGameBtn?.node?.on(Button.EventType.CLICK, this.gotoJuggleBallGame, this);
    this.milkTeaGameBtn = this.createMilkTeaTestButton();
    this.milkTeaGameBtn.node.on(Button.EventType.CLICK, this.gotoMilkTeaGame, this);
    game.on(Game.EVENT_SHOW, this.onGameShow, this);

    if (this.sidebarBtn?.node) {
      this.sidebarBtn.node.active = false;
    }
    SidebarRewardService.addListener(this.onSidebarStateChanged);
    SidebarRewardService.init();
    SidebarRewardService.checkAvailability();

    this.feedSubscribeBtn = this.createFeedSubscribeButton();
    void this.refreshFeedSubscribeEntry();
    ShareRewardService.refreshDailyState();
    this.refreshShareEntry();
  }

  protected onDestroy(): void {
    game.off(Game.EVENT_SHOW, this.onGameShow, this);
    SidebarRewardService.removeListener(this.onSidebarStateChanged);
  }
  async startGame() {
    if (this.startBtn) {
      this.startBtn.interactable = false;
    }

    try {
      await GameSceneBundle.loadScene(GameSceneName.Game);
    } catch (err) {
      console.error("[mainScene] GameScene 加载失败", err);
      if (this.startBtn) {
        this.startBtn.interactable = true;
      }
    }
  }

  private async gotoShootingGlassBottles(): Promise<void> {
    const entryButton = this.shootingGameBtn;
    if (!entryButton?.interactable) return;
    entryButton.interactable = false;

    try {
      await GameSceneBundle.loadScene(GameSceneName.ShootingGlassBottles);
    } catch (err) {
      console.error("[mainScene] ShootingGlassBottlesGame 加载失败", err);
      if (entryButton.node?.isValid) {
        entryButton.interactable = true;
      }
    }
  }

  private async gotoArcheryGame(): Promise<void> {
    const entryButton = this.archeryGameBtn;
    if (!entryButton?.interactable) return;
    entryButton.interactable = false;

    try {
      await GameSceneBundle.loadScene(GameSceneName.ArcheryGame);
    } catch (err) {
      console.error("[mainScene] ArcheryGameScene 加载失败", err);
      if (entryButton.node?.isValid) {
        entryButton.interactable = true;
      }
    }
  }

  private async gotoJuggleBallGame(): Promise<void> {
    const entryButton = this.juggleBallGameBtn;
    if (!entryButton?.interactable) return;
    entryButton.interactable = false;

    try {
      await GameSceneBundle.loadScene(GameSceneName.JuggleBallGame);
    } catch (err) {
      console.error("[mainScene] JuggleBallGameScene 加载失败", err);
      if (entryButton.node?.isValid) entryButton.interactable = true;
    }
  }

  private async gotoMilkTeaGame(): Promise<void> {
    const entryButton = this.milkTeaGameBtn;
    if (!entryButton?.interactable) return;
    entryButton.interactable = false;

    try {
      await GameSceneBundle.loadScene(GameSceneName.MilkTeaFeedGame);
    } catch (err) {
      console.error("[mainScene] MilkTeaFeedGameScene 加载失败", err);
      if (entryButton.node?.isValid) entryButton.interactable = true;
    }
  }

  clearData() {
    sys.localStorage.clear();
    this.refreshShareEntry();
  }
  start() {}
  showSettingPanel() {
    UIManager.instance.open(uiName.settingPanel, { enterType: 0 });
  }

  showSidebarRewardPanel() {
    UIManager.instance?.open(uiName.rewardPanel);
  }

  private onSidebarStateChanged = (state: SidebarRewardState) => {
    if (this.sidebarBtn?.node) {
      this.sidebarBtn.node.active = state.supported;
    }
  };

  private async refreshFeedSubscribeEntry() {
    const result = await FeedRevisitService.initialize();
    if (!this.feedSubscribeBtn?.node?.isValid) return;
    this.feedSubscribeBtn.node.active = result.shouldShowSubscribeEntry;
  }

  private onFeedSubscribeClicked() {
    // 官方要求订阅弹窗必须在本次用户点击回调中同步调用。
    void FeedRevisitService.requestSubscribeFromUserGesture().then((result) => {
      this.handleFeedSubscribeResult(result);
    });
  }

  private handleFeedSubscribeResult(result: FeedSubscribeResult) {
    if (result === "subscribed" || result === "already-subscribed") {
      if (this.feedSubscribeBtn?.node) this.feedSubscribeBtn.node.active = false;
      this.showDouyinToast("挑战提醒已开启");
      return;
    }
    if (result === "login-required") {
      this.showDouyinToast("请登录后，再点一次开启挑战提醒");
      return;
    }
    if (result === "rejected") {
      this.showDouyinToast("你可以稍后再开启挑战提醒");
      return;
    }
    if (result === "not-configured") {
      console.warn("[mainScene] 复访 Content ID 尚未配置");
      return;
    }
    if (result === "unsupported") {
      this.showDouyinToast("当前抖音版本暂不支持挑战提醒");
      return;
    }
    this.showDouyinToast("开启失败，请稍后重试");
  }

  private createFeedSubscribeButton(): Button {
    const node = new Node("FeedChallengeSubscribeButton");
    node.layer = this.node.layer;
    node.parent = this.node;
    node.setPosition(306, 388, 0);
    node.addComponent(UITransform).setContentSize(156, 86);

    const graphics = node.addComponent(Graphics);
    graphics.fillColor = new Color(92, 64, 184, 235);
    graphics.strokeColor = new Color(214, 197, 255, 255);
    graphics.lineWidth = 4;
    graphics.roundRect(-78, -43, 156, 86, 22);
    graphics.fill();
    graphics.stroke();

    const labelNode = new Node("Label");
    labelNode.layer = node.layer;
    labelNode.parent = node;
    labelNode.addComponent(UITransform).setContentSize(148, 76);
    const label = labelNode.addComponent(Label);
    label.string = "每日挑战\n提醒";
    label.fontSize = 25;
    label.lineHeight = 30;
    label.color = Color.WHITE;
    label.horizontalAlign = HorizontalTextAlignment.CENTER;
    label.verticalAlign = VerticalTextAlignment.CENTER;

    const button = node.addComponent(Button);
    node.active = false;
    node.on(Button.EventType.CLICK, this.onFeedSubscribeClicked, this);
    return button;
  }

  /** 首页右侧的开发测试入口；正式推荐流仍由 Content_ID 自动路由。 */
  private createMilkTeaTestButton(): Button {
    const node = new Node("milkTeaGameBtn");
    node.layer = this.node.layer;
    node.parent = this.node;
    node.setPosition(306, 6, 0);
    node.addComponent(UITransform).setContentSize(128, 192);

    const graphics = node.addComponent(Graphics);
    graphics.fillColor = new Color(255, 242, 205, 255);
    graphics.strokeColor = new Color(109, 69, 43, 255);
    graphics.lineWidth = 5;
    graphics.roundRect(-48, -46, 96, 116, 16);
    graphics.fill();
    graphics.stroke();
    graphics.strokeColor = new Color(241, 122, 128, 255);
    graphics.lineWidth = 11;
    graphics.moveTo(12, 86);
    graphics.lineTo(-5, 62);
    graphics.lineTo(-5, 30);
    graphics.stroke();
    graphics.fillColor = new Color(85, 48, 31, 255);
    graphics.circle(-24, -20, 8);
    graphics.circle(0, -27, 8);
    graphics.circle(25, -17, 8);
    graphics.fill();

    const labelNode = new Node("Label");
    labelNode.layer = node.layer;
    labelNode.parent = node;
    labelNode.setPosition(0, -76, 0);
    labelNode.addComponent(UITransform).setContentSize(128, 52);
    const label = labelNode.addComponent(Label);
    label.string = "奶茶";
    label.fontSize = 31;
    label.lineHeight = 36;
    label.isBold = true;
    label.enableOutline = true;
    label.outlineColor = new Color(81, 55, 38, 255);
    label.outlineWidth = 3;
    label.horizontalAlign = HorizontalTextAlignment.CENTER;
    label.verticalAlign = VerticalTextAlignment.CENTER;

    const button = node.addComponent(Button);
    button.transition = Button.Transition.SCALE;
    button.zoomScale = 1.08;
    return button;
  }

  private showDouyinToast(title: string) {
    try {
      const api = typeof tt !== "undefined" ? tt : null;
      if (typeof api?.showToast === "function") {
        api.showToast({ title, icon: "none" });
      } else {
        console.log(`[mainScene] ${title}`);
      }
    } catch {
      console.log(`[mainScene] ${title}`);
    }
  }

  private onGameShow() {
    ShareRewardService.refreshDailyState();
    this.refreshShareEntry();
  }

  private refreshShareEntry() {
    if (!this.shareRedDot?.isValid) return;
    this.shareRedDot.active =
      ShareRewardService.isHomeRewardAvailable() && ToolInventory.getCount("magic") < ToolInventory.MAX_COUNT;
  }

  private async onShareClicked() {
    if (this.shareInFlight || !this.shareBtn?.interactable) return;

    this.shareInFlight = true;
    this.shareBtn.interactable = false;
    try {
      const success = await SdkUtils.share({
        channel: "invite",
        templateId: GameConfig.shareTemplateId,
        title: GameConfig.shareTitle,
        desc: GameConfig.shareDescription,
        query: "share_scene=home",
      });
      if (!success) {
        this.showDouyinToast("分享未完成");
        return;
      }

      if (ShareRewardService.claimHomeMagicReward()) {
        this.showDouyinToast("获得魔法棒 ×1");
      } else if (
        ShareRewardService.isHomeRewardAvailable() &&
        ToolInventory.getCount("magic") >= ToolInventory.MAX_COUNT
      ) {
        this.showDouyinToast("分享成功，魔法棒已达上限");
      } else {
        this.showDouyinToast("分享成功，今日奖励已领取");
      }
    } catch (err) {
      console.warn("[mainScene] 分享失败", err);
      this.showDouyinToast("分享失败，请稍后重试");
    } finally {
      this.shareInFlight = false;
      if (this.shareBtn?.node?.isValid) this.shareBtn.interactable = true;
      this.refreshShareEntry();
    }
  }

  update(deltaTime: number) {}
}
