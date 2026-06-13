import { _decorator, Button, Component, Label, Node } from "cc";
import UIManager from "./framework/ui/UIManager";
import { uiName } from "./gamePrefabMgr";
import { SidebarRewardService, SidebarRewardState } from "./framework/Platform/SidebarRewardService";
import { GameSceneBundle, GameSceneName } from "./framework/GameSceneBundle";
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
    this.startBtn?.node?.on("click", this.startGame, this);
    this.clearBtn?.node?.on(Node.EventType.TOUCH_END, this.clearData, this);
    this.settingBtn?.node?.on(Node.EventType.TOUCH_END, this.showSettingPanel, this);
    this.sidebarBtn?.node?.on(Button.EventType.CLICK, this.showSidebarRewardPanel, this);

    if (this.sidebarBtn?.node) {
      this.sidebarBtn.node.active = false;
    }
    SidebarRewardService.addListener(this.onSidebarStateChanged);
    SidebarRewardService.init();
    SidebarRewardService.checkAvailability();
  }

  protected onDestroy(): void {
    this.sidebarBtn?.node?.off(Button.EventType.CLICK, this.showSidebarRewardPanel, this);
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
