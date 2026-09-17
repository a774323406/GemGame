import { _decorator, Button, Component, game, Game, Node, ScrollView } from "cc";
import AudioManager from "./framework/AudioManager";
import { GameSceneBundle, GameSceneName } from "./framework/GameSceneBundle";
import { SidebarRewardService, SidebarRewardState } from "./framework/Platform/SidebarRewardService";
import { ShareRewardService } from "./framework/Platform/ShareRewardService";
import { SdkUtils } from "./framework/Platform/sdk/SdkUtils";
import UIManager from "./framework/ui/UIManager";
import { GameConfig } from "./GameConfig";
import { uiName } from "./gamePrefabMgr";
import { ToolInventory } from "./ToolInventory";

const { ccclass, property } = _decorator;

/**
 * 新主界面控制器。
 *
 * 所有固定 UI、尺寸和排版均保存在 NewMainScene.scene；这里只绑定交互，
 * 避免运行时创建节点后无法在 Creator 编辑器里直接调整。
 */
@ccclass("newMainScene")
export class newMainScene extends Component {
  @property(Button)
  settingButton: Button = null;

  @property(Button)
  shareButton: Button = null;

  @property(Button)
  sidebarButton: Button = null;

  @property(Node)
  shareRedDot: Node = null;

  @property(ScrollView)
  gameList: ScrollView = null;

  @property(Button)
  puzzleButton: Button = null;

  @property(Button)
  penguinButton: Button = null;

  @property(Button)
  shootingButton: Button = null;

  @property(Button)
  archeryButton: Button = null;

  @property(Button)
  milkTeaButton: Button = null;

  @property(Button)
  penRefillButton: Button = null;

  @property(Button)
  nailHammerButton: Button = null;

  @property(Button)
  balloonWheelButton: Button = null;

  private navigating = false;
  private shareInFlight = false;

  protected onLoad(): void {
    this.settingButton?.node?.on(Button.EventType.CLICK, this.openSettings, this);
    this.shareButton?.node?.on(Button.EventType.CLICK, this.onShareClicked, this);
    this.sidebarButton?.node?.on(Button.EventType.CLICK, this.openSidebarReward, this);
    this.puzzleButton?.node?.on(Button.EventType.CLICK, this.openPuzzle, this);
    this.penguinButton?.node?.on(Button.EventType.CLICK, this.openPenguin, this);
    this.shootingButton?.node?.on(Button.EventType.CLICK, this.openShooting, this);
    this.archeryButton?.node?.on(Button.EventType.CLICK, this.openArchery, this);
    this.milkTeaButton?.node?.on(Button.EventType.CLICK, this.openMilkTea, this);
    this.penRefillButton?.node?.on(Button.EventType.CLICK, this.openPenRefill, this);
    this.nailHammerButton?.node?.on(Button.EventType.CLICK, this.openNailHammer, this);
    this.balloonWheelButton?.node?.on(Button.EventType.CLICK, this.openBalloonWheel, this);
    game.on(Game.EVENT_SHOW, this.onGameShow, this);

    SidebarRewardService.addListener(this.onSidebarStateChanged);
    SidebarRewardService.init();
    void SidebarRewardService.checkAvailability();
    ShareRewardService.refreshDailyState();
    this.refreshShareEntry();
  }

  protected start(): void {
    AudioManager.setSoundEvent();
    AudioManager.playDefaultBgm();
    this.scheduleOnce(() => this.gameList?.scrollToTop(0), 0);
  }

  protected onDestroy(): void {
    game.off(Game.EVENT_SHOW, this.onGameShow, this);
    SidebarRewardService.removeListener(this.onSidebarStateChanged);
    this.settingButton?.node?.off(Button.EventType.CLICK, this.openSettings, this);
    this.shareButton?.node?.off(Button.EventType.CLICK, this.onShareClicked, this);
    this.sidebarButton?.node?.off(Button.EventType.CLICK, this.openSidebarReward, this);
    this.puzzleButton?.node?.off(Button.EventType.CLICK, this.openPuzzle, this);
    this.penguinButton?.node?.off(Button.EventType.CLICK, this.openPenguin, this);
    this.shootingButton?.node?.off(Button.EventType.CLICK, this.openShooting, this);
    this.archeryButton?.node?.off(Button.EventType.CLICK, this.openArchery, this);
    this.milkTeaButton?.node?.off(Button.EventType.CLICK, this.openMilkTea, this);
    this.penRefillButton?.node?.off(Button.EventType.CLICK, this.openPenRefill, this);
    this.nailHammerButton?.node?.off(Button.EventType.CLICK, this.openNailHammer, this);
    this.balloonWheelButton?.node?.off(Button.EventType.CLICK, this.openBalloonWheel, this);
  }

  private openSettings(): void {
    UIManager.instance?.open(uiName.settingPanel, { enterType: 0 });
  }

  private openSidebarReward(): void {
    UIManager.instance?.open(uiName.rewardPanel);
  }

  private openPuzzle(): void { void this.enterGame(GameSceneName.Game); }
  private openPenguin(): void { void this.enterGame(GameSceneName.PenguinStackFeedGame); }
  private openShooting(): void { void this.enterGame(GameSceneName.ShootingGlassBottles); }
  private openArchery(): void { void this.enterGame(GameSceneName.ArcheryGame); }
  private openMilkTea(): void { void this.enterGame(GameSceneName.MilkTeaFeedGame); }
  private openPenRefill(): void { void this.enterGame(GameSceneName.PenRefillFeedGame); }
  private openNailHammer(): void { void this.enterGame(GameSceneName.NailHammerFeedGame); }
  private openBalloonWheel(): void { void this.enterGame(GameSceneName.BalloonWheelFeedGame); }

  private async enterGame(sceneName: GameSceneName): Promise<void> {
    if (this.navigating || GameSceneBundle.isLoadingScene) return;
    this.navigating = true;
    this.setGameButtonsInteractable(false);
    this.gameList?.stopAutoScroll();
    try {
      await GameSceneBundle.loadScene(sceneName);
    } catch (error) {
      console.error("[newMainScene] 玩法场景加载失败", sceneName, error);
      if (this.node?.isValid) {
        this.navigating = false;
        this.setGameButtonsInteractable(true);
        this.showDouyinToast("加载失败，请重试");
      }
    }
  }

  private setGameButtonsInteractable(interactable: boolean): void {
    for (const button of this.gameButtons) {
      if (button?.node?.isValid) button.interactable = interactable;
    }
  }

  private get gameButtons(): Button[] {
    return [
      this.puzzleButton,
      this.penguinButton,
      this.shootingButton,
      this.archeryButton,
      this.milkTeaButton,
      this.penRefillButton,
      this.nailHammerButton,
      this.balloonWheelButton,
    ].filter(Boolean);
  }

  private onSidebarStateChanged = (state: SidebarRewardState): void => {
    if (this.sidebarButton?.node?.isValid) {
      this.sidebarButton.node.active = state.supported || state.checking;
    }
  };

  private onGameShow(): void {
    ShareRewardService.refreshDailyState();
    this.refreshShareEntry();
  }

  private refreshShareEntry(): void {
    if (!this.shareRedDot?.isValid) return;
    this.shareRedDot.active =
      ShareRewardService.isHomeRewardAvailable() &&
      ToolInventory.getCount("magic") < ToolInventory.MAX_COUNT;
  }

  private async onShareClicked(): Promise<void> {
    if (this.shareInFlight || !this.shareButton?.interactable) return;
    this.shareInFlight = true;
    this.shareButton.interactable = false;
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
    } catch (error) {
      console.warn("[newMainScene] 分享失败", error);
      this.showDouyinToast("分享失败，请稍后重试");
    } finally {
      this.shareInFlight = false;
      if (this.shareButton?.node?.isValid) this.shareButton.interactable = true;
      this.refreshShareEntry();
    }
  }

  private showDouyinToast(title: string): void {
    try {
      const api = typeof tt !== "undefined" ? tt : null;
      if (typeof api?.showToast === "function") api.showToast({ title, icon: "none" });
      else console.log(`[newMainScene] ${title}`);
    } catch {
      console.log(`[newMainScene] ${title}`);
    }
  }
}
