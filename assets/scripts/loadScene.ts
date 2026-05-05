import { _decorator, Component, Node, ProgressBar, resources, ScrollBar, director } from "cc";
import { ResourceManager } from "./framework/ResourceManager";
const { ccclass, property } = _decorator;

@ccclass("loadScene")
export class loadScene extends Component {
  @property(ProgressBar)
  public loading: ProgressBar = null;

  isloadOver: boolean = false;
  fakeProgress: number = 0;
  private progressTimer: number = null;
  private startTime: number = 0;
  private constDuration: number = 3; // 固定时长3秒

  start() {
    this.startTime = Date.now(); // 记录开始时间

    // 启动进度条计时器
    this.progressTimer = setInterval(() => {
      const elapsed = (Date.now() - this.startTime) / 1000; // 已经过去的秒数
      this.fakeProgress = Math.min(elapsed / this.constDuration, 1); // 计算假进度

      if (this.loading) {
        this.loading.progress = this.fakeProgress;
      }

      // 当假进度达到100%且资源加载完成时，切换场景
      if (this.fakeProgress >= 1 && this.isloadOver) {
        clearInterval(this.progressTimer);
        director.loadScene("MainScene");
      }
    }, 30); // 每30ms更新一次

    this.loadRes();
  }

  async loadRes() {
    await ResourceManager.ins.loadBundle("res");
    this.isloadOver = true;

    const elapsed = (Date.now() - this.startTime) / 1000; // 计算实际加载用时

    if (elapsed >= this.constDuration) {
      // 如果加载时间超过3秒，清除计时器并显示100%
      if (this.progressTimer) {
        clearInterval(this.progressTimer);
        console.log("Load over");
      }
      if (this.loading) {
        this.loading.progress = 1;
      }
      // 加载完成后切换场景
      director.loadScene("MainScene");
    }
  }

  update(deltaTime: number) {}
}
