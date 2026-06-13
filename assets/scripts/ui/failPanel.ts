import { _decorator, Button, Label } from "cc";
import UIBase, { UIOpenAnimType } from "../framework/ui/UIBase";
import UIManager from "../framework/ui/UIManager";
import { uiName } from "../gamePrefabMgr";

const { ccclass, property } = _decorator;

export interface FailPanelData {
  level: number;
  bonusSeconds: number;
  onRevive: () => boolean | Promise<boolean>;
  onHome: () => void;
}

@ccclass("failPanel")
export class failPanel extends UIBase {
  protected uiAnimType = UIOpenAnimType.ScaleFade;

  @property(Label)
  public levelLabel: Label = null;

  @property(Label)
  public bonusLabel: Label = null;

  @property(Button)
  public reviveButton: Button = null;

  @property(Button)
  public homeButton: Button = null;

  private data: FailPanelData = null;

  protected onLoad() {
    this.reviveButton?.node.on(Button.EventType.CLICK, this.onRevive, this);
    this.homeButton?.node.on(Button.EventType.CLICK, this.onHome, this);
  }

  protected onDestroy() {
    this.reviveButton?.node.off(Button.EventType.CLICK, this.onRevive, this);
    this.homeButton?.node.off(Button.EventType.CLICK, this.onHome, this);
  }

  public onOpen(data?: FailPanelData) {
    this.data = data || null;
    this.reviveButton.interactable = true;

    const level = Math.max(1, Number(data?.level) || 1);
    const bonusSeconds = Math.max(0, Number(data?.bonusSeconds) || 0);
    if (this.levelLabel) {
      this.levelLabel.string = `LEVEL ${level}`;
    }
    if (this.bonusLabel) {
      this.bonusLabel.string = `额外获得 ${this.formatTime(bonusSeconds)}`;
    }
  }

  private async onRevive() {
    if (!this.data?.onRevive || !this.reviveButton?.interactable) return;

    this.reviveButton.interactable = false;
    try {
      const rewarded = await this.data.onRevive();
      if (!rewarded) {
        this.reviveButton.interactable = true;
        return;
      }
      UIManager.instance?.close(uiName.failPanel);
    } catch (err) {
      this.reviveButton.interactable = true;
      console.warn("[failPanel] 激励视频播放失败", err);
    }
  }

  private onHome() {
    UIManager.instance?.close(uiName.failPanel);
    this.data?.onHome?.();
  }

  private formatTime(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const remainSeconds = seconds % 60;
    const minuteText = minutes < 10 ? `0${minutes}` : String(minutes);
    const secondText = remainSeconds < 10 ? `0${remainSeconds}` : String(remainSeconds);
    return `${minuteText}:${secondText}`;
  }
}
