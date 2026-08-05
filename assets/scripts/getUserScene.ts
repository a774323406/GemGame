import {
  _decorator,
  Button,
  Component,
  director,
  Director,
  EventTouch,
  Node,
  tween,
  Tween,
  UIOpacity,
} from "cc";
import { GameSceneBundle, GameSceneName } from "./framework/GameSceneBundle";
import AudioManager from "./framework/AudioManager";
import { soundName } from "./gamePrefabMgr";
import {
  FeedAcquisitionService,
  FeedAcquisitionState,
} from "./framework/Platform/FeedAcquisitionService";
import { FeedRevisitService } from "./framework/Platform/FeedRevisitService";
import { adc } from "./framework/Platform/ADController";
import { SdkUtils } from "./framework/Platform/sdk/SdkUtils";
const { ccclass, property } = _decorator;

@ccclass("getUserScene")
export class getUserScene extends Component {
  @property(Button)
  tipsBtn: Button = null;
  @property(Button)
  nextBtn: Button = null;
  @property(Node)
  hairNode: Node = null;

  @property({ tooltip: "头发每秒旋转角度" })
  rotationSpeed = 252;

  @property({ tooltip: "玩家停下头发时允许的正负角度误差" })
  successAngleTolerance = 8;

  @property({ tooltip: "看完广告后自动摆正头发的动画时间" })
  autoAlignDuration = 0.45;

  private rotating = true;
  private completed = false;
  private adInFlight = false;
  private loadingNextScene = false;
  private feedVisualEnabled = true;
  private feedInteractionEnabled = true;
  private nextOpacity: UIOpacity | null = null;

  protected onLoad(): void {
    this.node.on(Node.EventType.TOUCH_END, this.onScreenClicked, this);
    this.tipsBtn?.node?.on(Button.EventType.CLICK, this.onTipsClicked, this);
    this.nextBtn?.node?.on(Button.EventType.CLICK, this.onNextClicked, this);
  }

  protected start(): void {
    if (!SdkUtils.sdk) SdkUtils.requireSDK();
    adc.setBannerEnabled(false);
    AudioManager.setSoundEvent();
    AudioManager.playMusic(soundName.getUserBgm);

    if (this.nextBtn?.node) {
      this.nextBtn.node.active = false;
      this.nextBtn.interactable = false;
      this.nextOpacity = this.nextBtn.node.getComponent(UIOpacity) ??
        this.nextBtn.node.addComponent(UIOpacity);
      this.nextOpacity.opacity = 0;
    }

    if (this.hairNode) {
      this.hairNode.angle = this.normalizeAngle(this.hairNode.angle);
    }

    FeedAcquisitionService.init();
    if (FeedAcquisitionService.isActive()) {
      FeedAcquisitionService.addListener(this.onFeedStateChanged);
      this.node.on(Node.EventType.TOUCH_START, this.onFeedFallbackTouch, this, true);
      director.once(Director.EVENT_END_FRAME, this.reportFeedSceneReady, this);
    }
  }

  protected update(deltaTime: number): void {
    if (
      !this.hairNode ||
      !this.rotating ||
      this.completed ||
      this.adInFlight ||
      !this.feedVisualEnabled
    ) {
      return;
    }

    this.hairNode.angle = this.normalizeAngle(
      this.hairNode.angle - Math.max(0, this.rotationSpeed) * deltaTime,
    );
  }

  private onScreenClicked(event: EventTouch): void {
    const target = event.target as Node | null;
    if (
      this.isNodeInside(target, this.tipsBtn?.node) ||
      this.isNodeInside(target, this.nextBtn?.node)
    ) {
      return;
    }

    this.activateFeedFromGesture();
    if (
      !this.hairNode ||
      !this.feedInteractionEnabled ||
      !this.rotating ||
      this.completed ||
      this.adInFlight
    ) {
      return;
    }

    AudioManager.playEffect(soundName.getUserClick);
    this.rotating = false;
    const angleError = Math.abs(this.normalizeAngle(this.hairNode.angle));
    if (angleError <= Math.max(0, this.successAngleTolerance)) {
      this.alignHairAndComplete(0.18);
      return;
    }

    // 停顿一下让玩家看清当前角度，未命中时继续旋转，可立即再次尝试。
    this.scheduleOnce(this.resumeAfterMiss, 0.22);
  }

  private async onTipsClicked(): Promise<void> {
    this.activateFeedFromGesture();
    if (
      !this.feedInteractionEnabled ||
      this.completed ||
      this.adInFlight ||
      !this.tipsBtn?.interactable
    ) {
      return;
    }

    this.adInFlight = true;
    this.rotating = false;
    this.tipsBtn.interactable = false;

    const rewarded = await SdkUtils.showRewardedVideo();
    if (!this.node?.isValid) return;

    this.adInFlight = false;
    if (!rewarded) {
      this.tipsBtn.interactable = true;
      this.rotating = true;
      this.showToast("完整看完视频即可自动摆正");
      return;
    }

    this.alignHairAndComplete(Math.max(0.1, this.autoAlignDuration));
  }

  private alignHairAndComplete(duration: number): void {
    if (!this.hairNode || this.completed) return;

    this.rotating = false;
    this.unschedule(this.resumeAfterMiss);
    Tween.stopAllByTarget(this.hairNode);
    this.hairNode.angle = this.normalizeAngle(this.hairNode.angle);

    tween(this.hairNode)
      .to(duration, { angle: 0 }, { easing: "quadOut" })
      .call(() => {
        if (!this.hairNode?.isValid || this.completed) return;
        this.hairNode.angle = 0;
        this.completeChallenge();
      })
      .start();
  }

  private completeChallenge(): void {
    if (this.completed) return;
    this.completed = true;
    this.rotating = false;

    if (this.tipsBtn?.node?.isValid) {
      // 通关后提示按钮仍保留；completed 会阻止它再次拉起广告。
      this.tipsBtn.node.active = true;
      this.tipsBtn.interactable = true;
    }

    // 复访挑战只更新下一次就绪时间，不再领取或发放任何道具奖励。
    if (FeedAcquisitionService.isRevisit()) {
      FeedRevisitService.scheduleNextImportantEvent(FeedAcquisitionService.getContentId());
    }

    this.showNextButton();
  }

  private showNextButton(): void {
    const node = this.nextBtn?.node;
    if (!node?.isValid) return;

    node.active = true;
    this.nextBtn.interactable = true;
    const opacity = this.nextOpacity ?? node.getComponent(UIOpacity) ?? node.addComponent(UIOpacity);
    this.nextOpacity = opacity;
    Tween.stopAllByTarget(opacity);
    opacity.opacity = 0;

    tween(opacity)
      .to(0.35, { opacity: 255 }, { easing: "quadOut" })
      .call(() => {
        if (!opacity.node?.isValid || this.loadingNextScene) return;
        tween(opacity)
          .repeatForever(
            tween(opacity)
              .to(0.65, { opacity: 185 }, { easing: "sineInOut" })
              .to(0.65, { opacity: 255 }, { easing: "sineInOut" }),
          )
          .start();
      })
      .start();
  }

  private onNextClicked(): void {
    if (!this.completed || this.loadingNextScene) return;
    this.loadingNextScene = true;
    if (this.nextBtn) this.nextBtn.interactable = false;

    Tween.stopAllByTarget(this.nextOpacity);
    this.finishFeedExperience();
    AudioManager.playDefaultBgm();
    void GameSceneBundle.loadScene(GameSceneName.Game).catch((err) => {
      console.error("[getUserScene] 下一关加载失败", err);
      this.loadingNextScene = false;
      if (this.nextBtn?.node?.isValid) this.nextBtn.interactable = true;
    });
  }

  private resumeAfterMiss(): void {
    if (!this.completed && !this.adInFlight) this.rotating = true;
  }

  private activateFeedFromGesture(): void {
    if (FeedAcquisitionService.isActive()) {
      FeedAcquisitionService.activateFromFirstTouch();
    }
  }

  private onFeedFallbackTouch(): void {
    this.activateFeedFromGesture();
  }

  private onFeedStateChanged = (state: FeedAcquisitionState): void => {
    // 推荐流预览态 entered=false、exited=false，此时也要让画面持续转动。
    // 只有真正滑出推荐流后才暂停视觉动画；点击和广告仍由下面的交互状态控制。
    this.feedVisualEnabled = !state.active || !state.exited;
    this.feedInteractionEnabled = !state.active || (state.entered && !state.exited);
  };

  private reportFeedSceneReady(): void {
    if (this.node?.isValid && FeedAcquisitionService.isActive()) {
      FeedAcquisitionService.reportSceneReady();
    }
  }

  private finishFeedExperience(): void {
    director.off(Director.EVENT_END_FRAME, this.reportFeedSceneReady, this);
    if (this.node?.isValid) {
      this.node.off(Node.EventType.TOUCH_START, this.onFeedFallbackTouch, this, true);
    }
    FeedAcquisitionService.removeListener(this.onFeedStateChanged);
    FeedAcquisitionService.completeSession();
    adc.setBannerEnabled(true);
  }

  private normalizeAngle(angle: number): number {
    const normalized = ((angle + 180) % 360 + 360) % 360 - 180;
    return normalized === -180 ? 180 : normalized;
  }

  private isNodeInside(target: Node | null, root: Node | null | undefined): boolean {
    if (!target || !root) return false;
    let current: Node | null = target;
    while (current) {
      if (current === root) return true;
      current = current.parent;
    }
    return false;
  }

  private showToast(title: string): void {
    try {
      const api = typeof tt !== "undefined" ? tt : null;
      if (typeof api?.showToast === "function") {
        api.showToast({ title, icon: "none" });
      } else {
        console.log(`[getUserScene] ${title}`);
      }
    } catch {
      console.log(`[getUserScene] ${title}`);
    }
  }

  protected onDestroy(): void {
    this.unschedule(this.resumeAfterMiss);

    // 编辑器切场景时子节点可能先于根组件销毁；只有节点仍有效时才解绑。
    if (this.tipsBtn?.isValid && this.tipsBtn.node?.isValid) {
      this.tipsBtn.node.off(Button.EventType.CLICK, this.onTipsClicked, this);
    }
    if (this.nextBtn?.isValid && this.nextBtn.node?.isValid) {
      this.nextBtn.node.off(Button.EventType.CLICK, this.onNextClicked, this);
    }
    if (this.node?.isValid) {
      this.node.off(Node.EventType.TOUCH_END, this.onScreenClicked, this);
      this.node.off(Node.EventType.TOUCH_START, this.onFeedFallbackTouch, this, true);
    }
    director.off(Director.EVENT_END_FRAME, this.reportFeedSceneReady, this);
    FeedAcquisitionService.removeListener(this.onFeedStateChanged);
    if (this.hairNode?.isValid) Tween.stopAllByTarget(this.hairNode);
    if (this.nextOpacity?.isValid) Tween.stopAllByTarget(this.nextOpacity);
  }
}
