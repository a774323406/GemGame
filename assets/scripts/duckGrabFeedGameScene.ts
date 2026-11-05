import { _decorator, Button, Component, Game, game, director, Label, Node, ResolutionPolicy, view } from 'cc';
import { DuckGrabRound } from './duckGrabRules';
import { FeedAcquisitionService, FeedAcquisitionState } from './framework/Platform/FeedAcquisitionService';
import { adc } from './framework/Platform/ADController';
import { SdkUtils } from './framework/Platform/sdk/SdkUtils';
import { GameSceneBundle, GameSceneName } from './framework/GameSceneBundle';
import { soundName } from './gamePrefabMgr';
import AudioManager from './framework/AudioManager';
const { ccclass, property } = _decorator;
@ccclass('duckGrabFeedGameScene')
export class duckGrabFeedGameScene extends Component {
  @property(Node) surface: Node = null;
  @property(Node) duckPivot: Node = null;
  @property(Node) hand: Node = null;
  @property(Node) hud: Node = null;
  @property(Node) caughtPose: Node = null;
  @property(Node) taunt: Node = null;
  @property(Node) resultOverlay: Node = null;
  @property(Label) timeLabel: Label = null;
  @property(Label) attemptLabel: Label = null;
  @property(Label) hintLabel: Label = null;
  @property(Label) resultTitle: Label = null;
  @property(Label) resultDetail: Label = null;
  @property(Button) slowdownButton: Button = null;
  @property(Button) replayButton: Button = null;
  @property(Button) homeButton: Button = null;
  @property(Button) backButton: Button = null;
  @property(Button) continueButton: Button = null;
  @property(Button) exitButton: Button = null;
  @property(Node) exitOverlay: Node = null;
  round = new DuckGrabRound();
  private feed = false;
  private entered = true;
  private exited = false;
  private hidden = false;
  private disposed = false;
  private leaving = false;
  private adInFlight = false;
  private adScheduled = false;
  private serial = 0;
  private successDelay = 0;
  private exitPaused = false;
  private audioTouchRecovered = false;
  private previewElapsed = 0;
  protected onLoad(): void {
    view.setDesignResolutionSize(750, 1624, ResolutionPolicy.FIXED_WIDTH);
    FeedAcquisitionService.init(); this.feed = FeedAcquisitionService.isActive();
    const s = FeedAcquisitionService.getState(); this.entered = !this.feed || s.entered; this.exited = this.feed && s.exited;
    FeedAcquisitionService.addListener(this.feedChanged);
    this.backButton.node.on(Button.EventType.CLICK, this.requestExit, this);
    this.continueButton.node.on(Button.EventType.CLICK, this.cancelExit, this);
    this.exitButton.node.on(Button.EventType.CLICK, this.home, this);
    director.on(SdkUtils.EVENT_INTERSTITIAL_SHOWN, this.onInterstitialShown, this);
    this.surface.on(Node.EventType.TOUCH_START, this.onTap, this);
    this.slowdownButton.node.on(Button.EventType.CLICK, this.slowdown, this);
    this.replayButton.node.on(Button.EventType.CLICK, this.replay, this);
    this.homeButton.node.on(Button.EventType.CLICK, this.home, this);
    game.on(Game.EVENT_HIDE, this.onHide, this); game.on(Game.EVENT_SHOW, this.onShow, this);
    this.replay();
  }
  protected start(): void {
    adc.onEnterGame(this.node);
    if (this.feed) void FeedAcquisitionService.reportSceneReadyAfterStableRender({ owner: this.node,
      requiredVisibleNodes: [this.surface, this.duckPivot.getChildByName('Duck'), this.hand], stableFrameCount: 3, surfaceDelayMs: 180,
      isReady: () => !this.disposed && !this.leaving && !this.exited });
    this.scheduleAd(); this.syncAudio();
  }
  private feedChanged = (s: FeedAcquisitionState): void => {
    if (!this.feed) return;
    const wasActive = this.entered && !this.exited;
    this.entered = s.entered; this.exited = s.exited;
    if (!this.entered || this.exited) {
      adc.cancelFeedEntryInterstitial(); this.adScheduled = false;
      if (this.exited) { this.serial++; this.adInFlight = false; }
    }
    else this.scheduleAd();
    this.syncAudio(wasActive !== (this.entered && !this.exited));
  };
  private scheduleAd(): void {
    if (!this.feed || !this.entered || this.exited || this.adScheduled) return;
    this.adScheduled = true;
    adc.scheduleFeedEntryInterstitial(() => !this.disposed && !this.leaving && this.entered && !this.exited);
  }
  private presentationPaused(): boolean {
    // Feed cards remain animated/audible; only actual lifecycle/modal pauses stop presentation.
    return this.exitPaused || this.hidden || this.leaving || this.disposed || this.adInFlight || SdkUtils.isRewardedVideoBusy();
  }
  private blocked(): boolean {
    // Interstitials deliberately do not stop the round or its clock.
    return this.presentationPaused() || (this.feed && (!this.entered || this.exited));
  }
  private syncAudio(restart = false): void {
    // Feed preview is audible too; the shared manager respects the music setting.
    if (this.presentationPaused()) {
      this.audioTouchRecovered = false;
      AudioManager.pauseBgmForVideo();
      return;
    }
    AudioManager.setSoundEvent();
    if (restart) AudioManager.restartMusic(soundName.getUserBgm);
    else AudioManager.playMusic(soundName.getUserBgm);
  }
  private onTap(): void {
    if (this.feed && !this.entered && !this.exited) FeedAcquisitionService.activateFromFirstTouch();
    if (!this.blocked()) {
      if (!this.audioTouchRecovered) {
        this.syncAudio(true);
        this.audioTouchRecovered = true;
      }
      this.round.attempt();
    }
  }
  private onHide(): void { this.hidden = true; this.syncAudio(); }
  private onShow(): void { this.hidden = false; this.syncAudio(true); }
  protected update(dt: number): void {
    if (this.presentationPaused()) return;
    const step = Math.max(0, Math.min(.1, Number.isFinite(dt) ? dt : 0));
    if (this.feed && (!this.entered || this.exited)) {
      if (this.round.phase === 'playing') {
        this.previewElapsed += step;
        // Animate only the displayed duck; preserve the timer, pending grab and ad-unlock clock.
        const swing = this.round.swing;
        const offset = (Math.sin(swing + this.previewElapsed * 3.3 * this.round.speedMultiplier) - Math.sin(swing)) * 43;
        this.render(this.round.angle + offset);
      }
      return;
    }
    this.previewElapsed = 0;
    if (this.successDelay > 0) {
      this.successDelay = Math.max(0, this.successDelay - step);
      if (this.successDelay <= 1e-8) this.showResult();
      return;
    }
    const before = this.round.phase, tauntBefore = this.round.tauntRemaining;
    this.round.tick(step); this.render();
    if (before === 'playing' && this.round.phase === 'success') { this.successDelay = .9; void AudioManager.playEffectByName('up'); }
    if (tauntBefore <= 0 && this.round.tauntRemaining > 0) void AudioManager.playEffectByName('whiteGooseCall1');
    if (before === 'playing' && this.round.phase === 'failure') this.showResult();
  }
  private render(angle = this.round.angle): void {
    const r = this.round, p = r.handProgress;
    const caught = r.phase === 'success';
    this.caughtPose.active = caught;
    this.duckPivot.active = !caught;
    this.hand.active = !caught;
    this.taunt.active = r.phase === 'playing' && r.tauntRemaining > 0;
    const rad = angle * Math.PI / 180;
    this.taunt.setPosition(-Math.sin(rad) * 335, -220 + Math.cos(rad) * 335, 0);
    this.taunt.angle = angle;
    const pop = 1 + .08 * Math.sin(r.tauntRemaining * 20);
    this.taunt.setScale(pop, pop, 1);
    this.duckPivot.angle = angle;
    // The bottom of the open claw coincides with the collision point at full reach.
    const homeY = view.getVisibleSize().height * .1;
    this.hand.setPosition(0, homeY + (r.neckY - homeY) * p, 0);
    this.hand.setScale(1, 1, 1);
    this.timeLabel.string = `剩余时间：${Math.ceil(r.remaining)}s`;
    this.attemptLabel.string = `次数 ${r.attempts}`;
    this.hintLabel.string = r.reaching ? '看准时机，一把抓住！' : r.attempts ? '没抓住？再试一次！' : '看准时机，一把抓住';
    this.slowdownButton.interactable = !this.blocked() && !r.reaching && r.phase === 'playing';
  }
  private showResult(): void {
    this.resultTitle.string = this.round.phase === 'success' ? '挑战成功' : '挑战失败';
    this.resultDetail.string = this.round.phase === 'success'
      ? `抓住啦！\n尝试 ${this.round.attempts} 次 · 用时 ${(60 - this.round.remaining).toFixed(1)} 秒`
      : `时间到！\n本次尝试 ${this.round.attempts} 次，再试试吧`;
    this.hud.active = false; this.resultOverlay.active = true;
  }
  private replay(): void {
    if (this.disposed || this.leaving) return;
    this.serial++; this.adInFlight = false; this.successDelay = 0; this.previewElapsed = 0; this.round = new DuckGrabRound();
    this.exitPaused = false; this.exitOverlay.active = false;
    this.resultOverlay.active = false; this.hud.active = true; this.render();
  }
  private async slowdown(): Promise<void> {
    if (this.feed && !this.entered && !this.exited) FeedAcquisitionService.activateFromFirstTouch();
    if (this.blocked() || this.round.phase !== 'playing' || this.round.reaching) return;
    const serial = this.serial; this.adInFlight = true; this.syncAudio(); this.render();
    let rewarded = false;
    try { rewarded = await SdkUtils.showRewardedVideo(); }
    catch (error) { console.warn('[DuckGrab] rewarded ad failed', error); }
    if (this.disposed || this.leaving || serial !== this.serial || !this.node?.isValid) return;
    this.adInFlight = false;
    if (rewarded) { this.round.slowDown(); this.round.unlockCatching(); }
    this.render(); this.hintLabel.string = rewarded ? '鸭子已减速，看准再抓！' : '完整看完广告才能减速';
    this.syncAudio();
  }
  private onInterstitialShown(): void {
    if (this.disposed || this.leaving || this.hidden || (this.feed && (!this.entered || this.exited))) return;
    this.round.unlockCatching();
  }
  private requestExit(): void {
    if (this.blocked() || this.resultOverlay.active) return;
    this.exitPaused = true; this.exitOverlay.active = true; this.syncAudio();
  }
  private cancelExit(): void {
    if (this.leaving || this.disposed) return;
    this.exitPaused = false; this.exitOverlay.active = false; this.syncAudio();
  }
  private async home(): Promise<void> {
    if (this.leaving || this.adInFlight) return;
    this.leaving = true; this.serial++; this.syncAudio();
    try { await GameSceneBundle.loadScene(GameSceneName.Main); }
    catch (error) { this.leaving = false; this.syncAudio(); console.error('[DuckGrab] return failed', error); }
  }
  protected onDestroy(): void {
    this.disposed = true; this.serial++;
    director.off(SdkUtils.EVENT_INTERSTITIAL_SHOWN, this.onInterstitialShown, this);
    if (this.surface?.isValid) this.surface.off(Node.EventType.TOUCH_START, this.onTap, this);
    for (const [b, fn] of [[this.backButton, this.requestExit], [this.continueButton, this.cancelExit], [this.exitButton, this.home], [this.slowdownButton, this.slowdown], [this.replayButton, this.replay], [this.homeButton, this.home]] as [Button, Function][])
      if (b?.node?.isValid) b.node.off(Button.EventType.CLICK, fn, this);
    game.off(Game.EVENT_HIDE, this.onHide, this); game.off(Game.EVENT_SHOW, this.onShow, this);
    FeedAcquisitionService.removeListener(this.feedChanged);
    if (this.feed) { adc.cancelFeedEntryInterstitial(); FeedAcquisitionService.completeSession(); }
  }
}
