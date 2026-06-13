import { _decorator, Button, Label } from "cc";
import UIBase, { UIOpenAnimType } from "../framework/ui/UIBase";
import { SidebarRewardService, SidebarRewardState } from "../framework/Platform/SidebarRewardService";
const { ccclass, property } = _decorator;

@ccclass("rewardPanel")
export class rewardPanel extends UIBase {
  protected uiAnimType = UIOpenAnimType.ScaleFade;

  @property(Button)
  public closeBtn: Button = null;

  @property(Button)
  public actionBtn: Button = null;

  @property(Label)
  public actionLabel: Label = null;

  @property(Label)
  public statusLabel: Label = null;

  protected onLoad() {
    this.closeBtn?.node.on(Button.EventType.CLICK, this.onClose, this);
    this.actionBtn?.node.on(Button.EventType.CLICK, this.onActionClicked, this);
  }

  protected onDestroy() {
    this.closeBtn?.node.off(Button.EventType.CLICK, this.onClose, this);
    this.actionBtn?.node.off(Button.EventType.CLICK, this.onActionClicked, this);
    SidebarRewardService.removeListener(this.onStateChanged);
  }

  public onOpen() {
    SidebarRewardService.addListener(this.onStateChanged);
    SidebarRewardService.init();
    SidebarRewardService.checkAvailability();
  }

  public onClose() {
    SidebarRewardService.removeListener(this.onStateChanged);
    super.onClose();
  }

  private async onActionClicked() {
    const state = SidebarRewardService.getState();

    if (state.claimed) {
      this.onClose();
      return;
    }

    if (state.canClaim) {
      SidebarRewardService.claimMagicWand();
      return;
    }

    if (!state.supported || state.checking) {
      return;
    }

    const opened = await SidebarRewardService.navigateToSidebar();
    if (!opened && this.statusLabel) {
      this.statusLabel.string = "暂时无法打开侧边栏，请稍后再试";
    }
  }

  private onStateChanged = (state: SidebarRewardState) => {
    if (!this.actionBtn || !this.actionLabel || !this.statusLabel) return;

    if (state.checking) {
      this.actionBtn.interactable = false;
      this.actionLabel.string = "检测中...";
      this.statusLabel.string = "正在检查侧边栏入口";
      return;
    }

    if (!state.supported) {
      this.actionBtn.interactable = false;
      this.actionLabel.string = "暂不支持";
      this.statusLabel.string = "请在最新版抖音中打开游戏";
      return;
    }

    if (state.claimed) {
      this.actionBtn.interactable = true;
      this.actionLabel.string = "已领取";
      this.statusLabel.string = "魔法棒已经放入你的道具栏";
      return;
    }

    if (state.canClaim) {
      this.actionBtn.interactable = true;
      this.actionLabel.string = "领取奖励";
      this.statusLabel.string = "欢迎从侧边栏回来，点击领取魔法棒";
      return;
    }

    this.actionBtn.interactable = true;
    this.actionLabel.string = "去侧边栏";
    this.statusLabel.string = "从抖音侧边栏返回游戏，即可领取奖励";
  };
}
