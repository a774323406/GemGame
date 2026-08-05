import {
  _decorator,
  Button,
  Color,
  Component,
  director,
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
import { adc } from "./framework/Platform/ADController";
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
  gotoGetUserSceneBtn: Button = null;
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

  private feedSubscribeBtn: Button | null = null;
  private startButtonBaseY: number | null = null;
  private shareInFlight = false;

  protected onLoad(): void {
    this.startBtn?.node?.on("click", this.startGame, this);
    this.gotoGetUserSceneBtn?.node?.on(Button.EventType.CLICK, this.gotoGetUserScene, this);
    this.clearBtn?.node?.on(Node.EventType.TOUCH_END, this.clearData, this);
    this.settingBtn?.node?.on(Node.EventType.TOUCH_END, this.showSettingPanel, this);
    this.sidebarBtn?.node?.on(Button.EventType.CLICK, this.showSidebarRewardPanel, this);
    this.shareBtn?.node?.on(Button.EventType.CLICK, this.onShareClicked, this);
    game.on(Game.EVENT_SHOW, this.onGameShow, this);

    if (this.startBtn?.node) {
      this.startButtonBaseY = this.startBtn.node.position.y;
    }
    director.on(SdkUtils.EVENT_BANNER_INSET_CHANGED, this.onBannerInsetChanged, this);
    adc.setBannerEnabled(true);
    this.applyBannerInset(SdkUtils.getBannerInsetRatio());

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
    director.off(SdkUtils.EVENT_BANNER_INSET_CHANGED, this.onBannerInsetChanged, this);
    this.gotoGetUserSceneBtn?.node?.off(
      Button.EventType.CLICK,
      this.gotoGetUserScene,
      this,
    );
    this.sidebarBtn?.node?.off(Button.EventType.CLICK, this.showSidebarRewardPanel, this);
    this.shareBtn?.node?.off(Button.EventType.CLICK, this.onShareClicked, this);
    game.off(Game.EVENT_SHOW, this.onGameShow, this);
    SidebarRewardService.removeListener(this.onSidebarStateChanged);
    this.feedSubscribeBtn?.node?.off(Button.EventType.CLICK, this.onFeedSubscribeClicked, this);
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

  private async gotoGetUserScene(): Promise<void> {
    if (!this.gotoGetUserSceneBtn?.interactable) return;
    this.gotoGetUserSceneBtn.interactable = false;

    try {
      await GameSceneBundle.loadScene(GameSceneName.GetUser);
    } catch (err) {
      console.error("[mainScene] GetUserScene 加载失败", err);
      if (this.gotoGetUserSceneBtn?.node?.isValid) {
        this.gotoGetUserSceneBtn.interactable = true;
      }
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

  private onBannerInsetChanged(ratio: number) {
    this.applyBannerInset(ratio);
  }

  private applyBannerInset(ratio: number) {
    const node = this.startBtn?.node;
    if (!node || this.startButtonBaseY === null) return;

    // 场景设计高度是 1334，底部原本已留有约 72 设计像素空白。
    const inset = Math.max(0, Math.min(0.5, Number(ratio) || 0)) * 1334;
    const offset = Math.max(0, inset - 72);
    node.setPosition(node.position.x, this.startButtonBaseY + offset, node.position.z);
  }

  update(deltaTime: number) {}
}
