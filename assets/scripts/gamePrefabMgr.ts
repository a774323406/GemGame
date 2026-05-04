
import { _decorator, resources, Prefab, AudioClip, assert, assetManager } from "cc";
import { ResourceManager } from "./framework/ResourceManager";

export enum uiName {
  settingPanel = "settingPanel", //设置
  puzzleOriginalPanel = "puzzleOriginalPanel", //拼图原始图片
  puzzleTimeOverPanel = "puzzleTimeOverPanel", //时间耗尽面板
  unLockTipPanel = "unLockTipPanel", //解锁提示面板
  puzzlePassPanel = "puzzlePassPanel", //拼图通过面板
  selectLevelPanel = "selectLevelPanel", //选择关卡面板
  puzzleStoryPanel = "puzzleStoryPanel", //拼图故事面板
  tipsPanel = "tipsPanel", //提示面板
  puzzleChapterLoadPanel = "puzzleChapterLoadPanel", //拼图章节加载面板
}



export default class gamePrefabMgr {
  private static __instance: gamePrefabMgr;
  // 单例访问器：首次获取时创建实例，后续统一返回同一实例
  public static get Instance() {
    if (this.__instance == null) {
      this.__instance = new gamePrefabMgr();
    }
    return this.__instance;
  }
  private inited = false;
  jilv = 0; // 已加载资源计数
  allResNum = 0; // 总资源数量
  diffData_WenZi = null;
  uiPre: { [key: string]: Prefab } = {}; // UI预制体缓存
  soundRes: { [key: string]: AudioClip } = {}; // 音效资源缓存
  private loadCompleteCallbacks: (() => void)[] = []; // 加载完成回调队列（支持多个回调）
  // 初始化资源：遍历并预加载 UI 预制体与音效资源到内存缓存
  public async Initial(onComplete?: () => void) {
    if (this.inited) {
      // 如果已经加载完成，直接调用回调
      if (onComplete) {
        if (this.isLoadComplete()) {
          onComplete();
        } else {
          // 正在加载中，将回调加入队列
          this.loadCompleteCallbacks.push(onComplete);
        }
      }
      return;
    }
    this.inited = true;
    // 将回调加入队列
    if (onComplete) {
      this.loadCompleteCallbacks.push(onComplete);
    }
    this.jilv = 0;
    this.allResNum = 0;

    // 统计UI预制体数量
    for (const key in uiName) {
      if (Object.prototype.hasOwnProperty.call(uiName, key)) {
        this.allResNum++;
      }
    }



    for (const key in uiName) {
      if (Object.prototype.hasOwnProperty.call(uiName, key)) {
        const uiname = (uiName as any)[key];
        ResourceManager.ins.loadBundle("res");
        let asset = await ResourceManager.ins.loadBundleAsset<Prefab>("res", "prefab/ui/" + uiname, Prefab);
        if (!asset) {
          console.warn(`[gamePrefabMgr] UI资源为空: ${uiname}`);
          this.jilv++;
          this.checkLoadComplete();
          return;
        }
        this.jilv++;
        gamePrefabMgr.Instance.uiPre[uiname] = asset;
        this.checkLoadComplete();
      }
    }
  
  }

  /**
   * 检查资源是否全部加载完成
   * 如果完成则调用所有队列中的回调函数
   */
  private checkLoadComplete() {
    if (this.jilv >= this.allResNum && this.allResNum > 0) {
      // 调用所有等待中的回调
      while (this.loadCompleteCallbacks.length > 0) {
        let callback = this.loadCompleteCallbacks.shift();
        if (callback) callback();
      }
    }
  }

  /**
   * 获取资源加载进度
   * @returns 加载进度百分比 (0-100)
   */
  public getLoadProgress(): number {
    if (this.allResNum === 0) return 0;
    return Math.floor((this.jilv / this.allResNum) * 100);
  }

  /**
   * 检查所有资源是否加载完成
   * @returns 是否加载完成
   */
  public isLoadComplete(): boolean {
    return this.jilv >= this.allResNum && this.allResNum > 0;
  }
}

/**
 * 注意：已把原脚本注释，由于脚本变动过大，转换的时候可能有遗落，需要自行手动转换
 */
// /**
//  * 资源管理
//  * 涉及到ui,prefab ，音效等资源可以在这里预加载
//  *
//  */
//
// import Define from "./Define";
//
// export enum uiPreName {
//     addEngry = 'addEngry',      //增加体力
//     addGold = 'addGold',        //增加金币 元宝
//     addTiShi = 'addTiShi',      //增加提示道具
//     //GameOver = 'GameOver',          //游戏over
//     timeOver ='timeOver',           //时间耗尽
//     selectkuang = 'selectkuang',    //找茬选答案 框
//     cha = 'cha',                    //叉号
//     texiao = 'texiao',              //粒子特效
//     pausepanel = 'pausepanel',      //暂停
//     setsoundpanel = 'setsoundpanel',    //设置
//     checkoutPanel = 'checkoutPanel', //关卡
//     taskPanel = 'taskPanel',        //任务界面
//     check_item2 = 'check_item2',
// }
//
// export enum soundName {
//     // game_bg0 = 'game_bg0',        //主音乐
//     // game_bg1 = 'game_bg1',
//     // game_bg2 = 'game_bg2',
//     // game_bg3 = 'game_bg3',
//     main_bg = 'main_bg',
//     answerright = 'answerright',
//     error = 'error',
//     fail = 'fail',
//     win = 'win',
//     hit = 'hit',
//     click = 'click',
// }
//
// export default class gamePrefabMgr {
//
//     private static __instance: gamePrefabMgr;
//     public static get Instance() {
//         if (null == this.__instance) {
//             this.__instance = new gamePrefabMgr();
//         }
//         return this.__instance;
//     }
//
//     jilv = 0
//     allResNum = 0
//     diffData_WenZi = null
//     uiPre = []
//     soundRes = []
//
//     public Initial() {
//         //this.isloadOver = !1
//         this.jilv = 0
//         var self = this
//
//         //ui数量
//         for (const key in uiPreName) {
//             if (Object.prototype.hasOwnProperty.call(uiPreName, key)) {
//                 this.allResNum ++
//             }
//         }
//         //音效资源数
//         for (const key in soundName) {
//             if (Object.prototype.hasOwnProperty.call(soundName, key)) {
//                 this.allResNum ++
//             }
//         }
//
//         //加载ui
//         for (const key in uiPreName) {
//             if (Object.prototype.hasOwnProperty.call(uiPreName, key)) {
//                 let uiname = uiPreName[key]
//                 cc.resources.load('prefab/Ui/'+uiname, cc.Prefab, (err, assert)=>{
//                     if(err) return console.log('err=', err)
//                     self.jilv++
//                     gamePrefabMgr.Instance.uiPre[uiname] = assert as cc.Prefab
//                 })
//             }
//         }
//
//         //加载音乐
//         for (const key in soundName) {
//             if (Object.prototype.hasOwnProperty.call(soundName, key)) {
//                 let uiname = soundName[key]
//                 cc.resources.load('Sound/'+uiname , (err, assert)=>{
//                     if(err) return console.log('err=', err)
//                     self.jilv++
//                     gamePrefabMgr.Instance.soundRes[uiname] = assert
//                 })
//             }
//         }
//     }
// }
