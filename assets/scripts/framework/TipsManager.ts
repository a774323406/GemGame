/*
 * @author: wch
 */

import { uiName } from "../gamePrefabMgr";
import UIManager, { UILayer } from "./ui/UIManager";

export default class TipsManager {
  private static _instance: TipsManager | null = null;

  public static get Instance(): TipsManager {
    if (!this._instance) {
      this._instance = new TipsManager();
    }

    return this._instance;
  }

  private constructor() {}

  public show(content: string) {
    if (!content) {
      return;
    }

    UIManager.instance?.open(
      uiName.tipsPanel,
      {
        content,
      },
      UILayer.Tips,
    );
  }
}
