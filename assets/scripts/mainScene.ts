import { _decorator, Button, Component, director, Label, Node } from "cc";
import UIManager from "./framework/ui/UIManager";
import { uiName } from "./gamePrefabMgr";
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

  protected onLoad(): void {
    this.startBtn?.node.on("click", this.startGame, this);
    this.clearBtn?.node.on(Node.EventType.TOUCH_END, this.clearData, this);
    this.settingBtn?.node.on(Node.EventType.TOUCH_END, this.showSettingPanel, this);
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
  update(deltaTime: number) {}
}
