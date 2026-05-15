import { _decorator, Button, Component, director, Label, Node } from "cc";
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
  }
  startGame() {
    director.loadScene("GameScene");
  }
  clearData() {
    localStorage.clear();
  }
  start() {}

  update(deltaTime: number) {}
}
