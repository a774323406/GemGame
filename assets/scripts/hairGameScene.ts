import { _decorator, Button, Component, director, Director, EventTouch, game, Game, Node, tween, Tween, UIOpacity } from "cc";
import { GameSceneBundle, GameSceneName } from "./framework/GameSceneBundle";
import AudioManager from "./framework/AudioManager";
import { soundName } from "./gamePrefabMgr";
import { FeedAcquisitionService, FeedAcquisitionState } from "./framework/Platform/FeedAcquisitionService";
import { FeedRevisitService } from "./framework/Platform/FeedRevisitService";
import { adc } from "./framework/Platform/ADController";
import { SdkUtils } from "./framework/Platform/sdk/SdkUtils";
const { ccclass, property } = _decorator;

@ccclass("HairGameScene")
export class HairGameScene extends Component {
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
  private feedAudioForeground = false;
  private feedAudioGestureRecovered = false;
  private feedInterstitialScheduled = false;
  private nextOpacity: UIOpacity | null = null;

  protected onLoad(): void {
    adc.setBannerEnabled(false);
    this.node.on(Node.EventType.TOUCH_END, this.onScreenClicked, this);
    this.tipsBtn?.node?.on(Button.EventType.CLICK, this.onTipsClicked, this);
    this.nextBtn?.node?.on(Button.EventType.CLICK, this.onNextClicked, this);
    game.on(Game.EVENT_SHOW, this.onGameShow, this);
    game.on(Game.EVENT_HIDE, this.onGameHide, this);
  }

  protected start(): void {
    if (!SdkUtils.sdk) SdkUtils.requireSDK();
    AudioManager.setSoundEvent();
    FeedAcquisitionService.init();
    const isFeedDirectPlay = FeedAcquisitionService.isActive();
    // 普通入口可立即播放；推荐流处于隐藏预启动时不能提前 play，
    // 否则底层 onPlay 不回调会把后续音频操作队列卡住。
    if (!isFeedDirectPlay) {
      AudioManager.playMusic(soundName.getUserBgm);
    }

    if (this.nextBtn?.node) {
      this.nextBtn.node.active = false;
      this.nextBtn.interactable = false;
      this.nextOpacity = this.nextBtn.node.getComponent(UIOpacity) ?? this.nextBtn.node.addComponent(UIOpacity);
      this.nextOpacity.opacity = 0;
    }

    if (this.hairNode) {
      this.hairNode.angle = this.normalizeAngle(this.hairNode.angle);
    }

    if (isFeedDirectPlay) {
      FeedAcquisitionService.addListener(this.onFeedStateChanged);
      this.node.on(Node.EventType.TOUCH_START, this.onFeedFallbackTouch, this, true);
      director.once(Director.EVENT_END_FRAME, this.reportFeedSceneReady, this);
    }
  }

  protected update(deltaTime: number): void {
    if (!this.hairNode || !this.rotating || this.completed || this.adInFlight || !this.feedVisualEnabled) {
      return;
    }

    this.hairNode.angle = this.normalizeAngle(this.hairNode.angle - Math.max(0, this.rotationSpeed) * deltaTime);
  }

  private onScreenClicked(event: EventTouch): void {
    const target = event.target as Node | null;
    if (this.isNodeInside(target, this.tipsBtn?.node) || this.isNodeInside(target, this.nextBtn?.node)) {
      return;
    }

    this.activateFeedFromGesture();
    if (!this.hairNode || !this.feedInteractionEnabled || !this.rotating || this.completed || this.adInFlight) {
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
    const feedState = FeedAcquisitionService.getState();
    this.feedInteractionEnabled = !feedState.active || (feedState.entered && !feedState.exited);
    if (!this.feedInteractionEnabled || this.completed || this.adInFlight || !this.tipsBtn?.interactable) {
      if (feedState.active && !this.feedInteractionEnabled) {
        this.showToast("请先点击继续游戏，再使用提示");
      }
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
        AudioManager.playEffect(soundName.hairSuccess);
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
          .repeatForever(tween(opacity).to(0.65, { opacity: 185 }, { easing: "sineInOut" }).to(0.65, { opacity: 255 }, { easing: "sineInOut" }))
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
      console.error("[HairGameScene] 下一关加载失败", err);
      this.loadingNextScene = false;
      if (this.nextBtn?.node?.isValid) this.nextBtn.interactable = true;
    });
  }

  private resumeAfterMiss(): void {
    if (!this.completed && !this.adInFlight) this.rotating = true;
  }

  private activateFeedFromGesture(): void {
    this.unschedule(this.retryFeedPreviewAudio);
    if (FeedAcquisitionService.isActive()) {
      FeedAcquisitionService.activateFromFirstTouch();
    }

    const state = FeedAcquisitionService.getState();
    if (!state.active || (state.entered && !state.exited)) {
      if (state.active && !this.feedAudioGestureRecovered) {
        this.feedAudioGestureRecovered = true;
        AudioManager.restartMusic(soundName.getUserBgm);
      } else {
        AudioManager.playMusic(soundName.getUserBgm);
      }
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
    // entered=false/exited=false 是推荐流卡片预览态，此时也要播放音乐。
    // 隐藏预启动阶段先不调用 play；收到前台 show、feedEnter 或真实触摸后再启动。
    if (state.active && state.exited) {
      adc.cancelFeedEntryInterstitial();
      this.feedInterstitialScheduled = false;
      this.feedAudioForeground = false;
      this.feedAudioGestureRecovered = false;
      AudioManager.pauseBgmForVideo();
    } else if (!state.active) {
      AudioManager.playMusic(soundName.getUserBgm);
    } else if (state.entered) {
      if (!this.feedInterstitialScheduled) {
        this.feedInterstitialScheduled = true;
        adc.scheduleFeedEntryInterstitial(() => {
          const current = FeedAcquisitionService.getState();
          return !!this.node?.isValid && current.active && current.entered && !current.exited;
        });
      }

      if (!this.feedAudioForeground) {
        this.feedAudioForeground = true;
        AudioManager.restartMusic(soundName.getUserBgm);
      } else {
        AudioManager.playMusic(soundName.getUserBgm);
      }
    }
  };

  private onGameShow = (): void => {
    this.unschedule(this.retryFeedPreviewAudio);
    const state = FeedAcquisitionService.getState();
    if (!state.active) {
      AudioManager.playMusic(soundName.getUserBgm);
      return;
    }
    if (state.exited) return;

    // 推荐流卡片从后台预启动切到前台展示时，强制绕过可能卡住的旧播放器。
    this.feedAudioForeground = true;
    AudioManager.restartMusic(soundName.getUserBgm);
  };

  private onGameHide = (): void => {
    if (!FeedAcquisitionService.isActive()) return;
    this.feedAudioForeground = false;
    AudioManager.pauseBgmForVideo();
  };

  private reportFeedSceneReady(): void {
    if (this.node?.isValid && FeedAcquisitionService.isActive()) {
      FeedAcquisitionService.reportSceneReady();
      // 测试容器有时先展示卡片、后派发 show。场景上报后补一次干净播放器启动；
      // 若此时仍在后台，后续 show/首次触摸还会再次重建，不会继续卡在旧队列。
      this.unschedule(this.retryFeedPreviewAudio);
      this.scheduleOnce(this.retryFeedPreviewAudio, 0.35);
    }
  }

  private retryFeedPreviewAudio(): void {
    const state = FeedAcquisitionService.getState();
    if (!this.node?.isValid || !state.active || state.exited) return;
    AudioManager.restartMusic(soundName.getUserBgm);
  }

  private finishFeedExperience(): void {
    adc.cancelFeedEntryInterstitial();
    director.off(Director.EVENT_END_FRAME, this.reportFeedSceneReady, this);
    if (this.node?.isValid) {
      this.node.off(Node.EventType.TOUCH_START, this.onFeedFallbackTouch, this, true);
    }
    FeedAcquisitionService.removeListener(this.onFeedStateChanged);
    FeedAcquisitionService.completeSession();
  }

  private normalizeAngle(angle: number): number {
    const normalized = ((((angle + 180) % 360) + 360) % 360) - 180;
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
        console.log(`[HairGameScene] ${title}`);
      }
    } catch {
      console.log(`[HairGameScene] ${title}`);
    }
  }

  protected onDestroy(): void {
    adc.cancelFeedEntryInterstitial();
    this.unschedule(this.resumeAfterMiss);
    this.unschedule(this.retryFeedPreviewAudio);
    game.off(Game.EVENT_SHOW, this.onGameShow, this);
    game.off(Game.EVENT_HIDE, this.onGameHide, this);

    // 不要在 onDestroy 中对场景节点调用 off。Cocos 销毁场景时可能已经
    // 清空 Node 内部的 EventProcessor，此时即使 node.isValid 仍然为 true，
    // Node.off 也会因内部对象为 null 而报错。节点销毁会自动清理这些监听。
    director.off(Director.EVENT_END_FRAME, this.reportFeedSceneReady, this);
    FeedAcquisitionService.removeListener(this.onFeedStateChanged);
    if (this.hairNode?.isValid) Tween.stopAllByTarget(this.hairNode);
    if (this.nextOpacity?.isValid) Tween.stopAllByTarget(this.nextOpacity);
  }
}
