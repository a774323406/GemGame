import { _decorator, Button, Component, director, Label } from "cc";
const { ccclass, property } = _decorator;

@ccclass("mainScene")
export class mainScene extends Component {
  @property(Button)
  startBtn: Button = null;

  @property(Button)
  settingBtn: Button = null;

  @property(Label)
  goldLabel: Label = null;

  protected onLoad(): void {
    this.startBtn.node.on("click", this.startGame, this);
  }
  startGame() {
    director.loadScene("GameScene");
  }
  start() {}

  update(deltaTime: number) {}
}
