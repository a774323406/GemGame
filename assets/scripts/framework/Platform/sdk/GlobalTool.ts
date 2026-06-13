export class GlobalTool {
  public static VipTimes = 0;
  public static isPlayingAD = false;
  public static isEnterADFinished = false;
  public static lastWatchADTime = new Date().getTime();
  public static isAdUser = false;

  static isCanWatchFromResume() {
    let now = new Date().getTime();
    if (now - GlobalTool.lastWatchADTime > 1000) {
      return true;
    }
  }

  static setWatchADTime() {
    GlobalTool.lastWatchADTime = new Date().getTime();
  }
}
