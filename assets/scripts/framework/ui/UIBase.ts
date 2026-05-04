/*
 * @author: wch
 * @date: yyyy-MM-dd HH:mm:ss
 */
import { _decorator, Component } from "cc";
const { ccclass } = _decorator;

@ccclass("UIBase")
export default class UIBase extends Component {
  protected _isOpen = false;

  public onOpen(data?: any) {
    this._isOpen = true;
    this.node.active = true;
  }

  public onClose() {
    this._isOpen = false;
    this.node.active = false;
  }

  public show(data?: any) {
    this.onOpen(data);
  }

  public hide() {
    this.onClose();
  }
  /**
   * @description: 是否打开
   * @return {*}
   */
  public get isOpen() {
    return this._isOpen;
  }
}
