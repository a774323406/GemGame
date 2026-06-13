import { _decorator, Button, Component, director, Label, Node } from "cc";
import UIManager from "./framework/ui/UIManager";
import { uiName } from "./gamePrefabMgr";
import { SidebarRewardService, SidebarRewardState } from "./framework/Platform/SidebarRewardService";
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

  protected onLoad(): void {
    this.startBtn?.node.on("click", this.startGame, this);
    this.clearBtn?.node.on(Node.EventType.TOUCH_END, this.clearData, this);
    this.settingBtn?.node.on(Node.EventType.TOUCH_END, this.showSettingPanel, this);
    this.sidebarBtn?.node.on(Button.EventType.CLICK, this.showSidebarRewardPanel, this);

    if (this.sidebarBtn) {
      this.sidebarBtn.node.active = false;
    }
    SidebarRewardService.addListener(this.onSidebarStateChanged);
    SidebarRewardService.init();
    SidebarRewardService.checkAvailability();
  }

  protected onDestroy(): void {
    this.sidebarBtn?.node.off(Button.EventType.CLICK, this.showSidebarRewardPanel, this);
    SidebarRewardService.removeListener(this.onSidebarStateChanged);
  }
  startGame() {
    director.loadScene("GameScene");
  }
  clearData() {
    localStorage.clear();
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

  update(deltaTime: number) {}
}
