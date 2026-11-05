import { _decorator, AudioSource, Button, Component, Game, game, Label, Node, ResolutionPolicy, Sprite, view } from 'cc';
import { CHOP_CONTACT_TIME, brickSplitTime, chopHandPose, visibleSplitCount } from './brickChopFeedback';
import { BrickChopRound } from './brickChopRules';
import { FeedAcquisitionService, FeedAcquisitionState } from './framework/Platform/FeedAcquisitionService';
import { adc } from './framework/Platform/ADController';
import { SdkUtils } from './framework/Platform/sdk/SdkUtils';
import { GameSceneBundle, GameSceneName } from './framework/GameSceneBundle';
import { soundName } from './gamePrefabMgr';
import AudioManager from './framework/AudioManager';
const { ccclass, property } = _decorator;
@ccclass('brickChopFeedGameScene')
export class brickChopFeedGameScene extends Component {
  @property(Node) surface: Node = null;
  @property(Node) hand: Node = null;
  @property(Node) impactRoot: Node = null;
  @property([Node]) dust: Node[] = [];
  @property(AudioSource) swingAudio: AudioSource = null;
  @property(AudioSource) impactAudio: AudioSource = null;
  @property([Node]) bricks: Node[] = [];
  @property([Node]) leftPieces: Node[] = [];
  @property([Node]) rightPieces: Node[] = [];
  @property(Sprite) gaugeFill: Sprite = null;
  @property(Node) hud: Node = null;
  @property(Label) chanceLabel: Label = null;
  @property(Label) hintLabel: Label = null;
  @property(Label) hitLabel: Label = null;
  @property(Node) resultOverlay: Node = null;
  @property(Label) resultTitle: Label = null;
  @property(Label) resultDetail: Label = null;
  @property(Button) slowdownButton: Button = null;
  @property(Button) extraButton: Button = null;
  @property(Button) replayButton: Button = null;
  @property(Button) homeButton: Button = null;
  @property(Button) backButton: Button = null;
  @property(Node) exitOverlay: Node = null;
  @property(Button) continueButton: Button = null;
  @property(Button) exitButton: Button = null;

  round = new BrickChopRound();
  private feed = false;
  private entered = true;
  private exited = false;
  private hidden = false;
  private disposed = false;
  private leaving = false;
  private exitPaused = false;
  private adInFlight = false;
  private adScheduled = false;
  private serial = 0;
  private audioRecovered = false;
  private previewClock = 0;
  private finishVibrationSent = false;
  private slowAction = (): void => { void this.reward('slow'); };
  private extraAction = (): void => { void this.reward('extra'); };

  protected onLoad(): void {
    view.setDesignResolutionSize(750, 1624, ResolutionPolicy.FIXED_WIDTH);
    FeedAcquisitionService.init(); this.feed = FeedAcquisitionService.isActive();
    const s = FeedAcquisitionService.getState();
    this.entered = !this.feed || s.entered; this.exited = this.feed && s.exited;
    this.replay();
    FeedAcquisitionService.addListener(this.feedChanged);
    this.surface.on(Node.EventType.TOUCH_START, this.onTap, this);
    for (const [b, fn] of this.actions()) b.node.on(Button.EventType.CLICK, fn, this);
    game.on(Game.EVENT_HIDE, this.onHide, this); game.on(Game.EVENT_SHOW, this.onShow, this);
  }
  private actions(): [Button, Function][] {
    return [[this.slowdownButton, this.slowAction], [this.extraButton, this.extraAction],
      [this.replayButton, this.replay], [this.homeButton, this.home], [this.backButton, this.requestExit],
      [this.continueButton, this.cancelExit], [this.exitButton, this.home]];
  }
  protected start(): void {
    adc.onEnterGame(this.node);
    if (this.feed) void FeedAcquisitionService.reportSceneReadyAfterStableRender({
      owner: this.node, requiredVisibleNodes: [this.surface, this.bricks[0], this.hand],
      stableFrameCount: 3, surfaceDelayMs: 180, isReady: () => !this.disposed && !this.leaving && !this.exited,
    });
    this.scheduleAd(); this.syncAudio();
  }
  private feedChanged = (s: FeedAcquisitionState): void => {
    if (!this.feed) return;
    const changed = this.entered !== s.entered || this.exited !== s.exited;
    const wasPreview = !this.entered || this.exited;
    if (wasPreview && s.entered && !s.exited && this.round.phase === 'aiming') {
      // The first playable tap must use the power the player just saw.
      this.round.chargeTime = this.previewClock;
    } else if (!wasPreview && (!s.entered || s.exited)) {
      this.previewClock = this.round.chargeTime;
    }
    this.entered = s.entered; this.exited = s.exited;
    if (!this.entered || this.exited) {
      adc.cancelFeedEntryInterstitial(); this.adScheduled = false;
      if (this.exited) { this.serial++; this.adInFlight = false; this.stopFeedback(); }
    } else this.scheduleAd();
    this.syncAudio(changed); this.render();
  };
  private scheduleAd(): void {
    if (!this.feed || !this.entered || this.exited || this.adScheduled) return;
    this.adScheduled = true;
    adc.scheduleFeedEntryInterstitial(() => !this.disposed && !this.leaving && this.entered && !this.exited);
  }
  private presentationPaused(): boolean {
    return this.hidden || this.disposed || this.leaving || this.exitPaused || this.adInFlight || SdkUtils.isRewardedVideoBusy();
  }
  private blocked(): boolean { return this.presentationPaused() || (this.feed && (!this.entered || this.exited)); }
  private syncAudio(restart = false): void {
    if (this.presentationPaused()) { this.stopFeedback(); this.audioRecovered = false; AudioManager.pauseBgmForVideo(); return; }
    AudioManager.setSoundEvent();
    if (restart) AudioManager.restartMusic(soundName.getUserBgm);
    else AudioManager.playMusic(soundName.getUserBgm);
  }
  private activate(): void {
    if (this.feed && !this.entered && !this.exited) FeedAcquisitionService.activateFromFirstTouch();
    if (!this.blocked() && !this.audioRecovered) { this.syncAudio(true); this.audioRecovered = true; }
  }
  private onTap(): void {
    this.activate();
    if (this.blocked() || this.resultOverlay.active) return;
    if (this.round.strike()) {
      this.finishVibrationSent = false; this.hitLabel.string = '';
      this.playFeedback(this.swingAudio, .6); this.render();
    }
  }
  private onHide(): void { this.hidden = true; this.syncAudio(); }
  private onShow(): void { this.hidden = false; this.syncAudio(true); }
  protected update(dt: number): void {
    if (this.presentationPaused()) return;
    const step = Math.max(0, Math.min(.1, Number.isFinite(dt) ? dt : 0));
    if (this.feed && (!this.entered || this.exited)) {
      this.previewClock = (this.previewClock + step * this.round.speedMultiplier) % 1.8;
      this.render(1 - Math.abs(1 - this.previewClock / .9)); return;
    }
    const impacted = this.round.impacted, before = this.round.phase;
    this.round.tick(step);
    if (!impacted && this.round.impacted) {
      this.hitLabel.string = this.round.lastHit ? `1掌${this.round.lastHit}砖！` : '劈空了，蓄满力试试～';
      if (this.round.lastHit) {
        this.playFeedback(this.impactAudio, .55 + .4 * this.round.lastHit / 12);
        SdkUtils.vibrateShort();
      }
    }
    if (!this.finishVibrationSent && this.round.lastHit >= 8 && this.round.phase === 'striking'
      && visibleSplitCount(this.round.strikeAge, this.round.lastHit) === this.round.lastHit) {
      this.finishVibrationSent = true; SdkUtils.vibrateShort();
    }
    this.render();
    if (before === 'striking' && (this.round.phase === 'success' || this.round.phase === 'failure')) {
      this.showResult();
      void AudioManager.playEffectByName(this.round.phase === 'success' ? 'up' : 'fail');
    }
  }
  private render(previewPower?: number): void {
    const r = this.round, height = view.getVisibleSize().height, base = -height * .33;
    const striking = r.phase === 'striking', age = r.strikeAge, step = 34;
    this.gaugeFill.fillRange = Math.max(.015, previewPower ?? (striking ? r.strikePower : r.power));
    this.chanceLabel.string = `剩余次数：${r.chances}次`;
    const preview = this.feed && (!this.entered || this.exited);
    const allowed = !this.presentationPaused() && (!this.feed || !this.exited) && r.phase === 'aiming';
    this.slowdownButton.interactable = allowed;
    this.extraButton.interactable = allowed;
    this.hintLabel.string = striking ? '一鼓作气！' : '在蓄力合适的时机劈下';
    const splitCount = striking && r.impacted ? visibleSplitCount(age, r.lastHit) : 0;
    const impactAge = age - CHOP_CONTACT_TIME;
    const strength = r.lastHit / 12;
    const shake = striking && r.lastHit > 0 && impactAge >= 0
      ? Math.pow(Math.max(0, 1 - impactAge / .5), 2) * (3 + 8 * strength) : 0;
    this.impactRoot.setPosition(Math.sin(impactAge * 80) * shake, Math.cos(impactAge * 62) * shake * .65, 0);
    for (let i = 0; i < 12; i++) {
      const y = base + i * step, order = r.beforeStrike - 1 - i;
      const split = striking && order >= 0 && order < splitCount;
      // Intact geometry is removed only when that particular layer visibly breaks.
      this.bricks[i].active = striking ? i < r.beforeStrike - splitCount : i < r.remaining;
      this.bricks[i].setPosition(0, y, 0);
      for (const [piece, dir] of [[this.leftPieces[i], -1], [this.rightPieces[i], 1]] as [Node, number][]) {
        piece.active = split;
        if (!split) continue;
        const t = Math.max(0, age - brickSplitTime(order));
        const spread = 68 + (210 + (order % 3) * 32) * t;
        // Upper fragments lift farther, keeping the ten layers readable instead of
        // collapsing their silhouettes into a handful of overlapping chunks.
        const fall = y + (230 - order * 8 + (order === 0 ? 24 : 0)) * t - 480 * t * t;
        piece.setPosition(dir * spread, Math.max(base - 15, fall), 0);
        piece.angle = dir * (6 + t * (38 + order % 3 * 7));
        piece.setScale(1, 1, 1);
      }
    }
    const homeY = height * .16;
    const pose = striking ? chopHandPose(age, r.lastHit, homeY, base + (r.beforeStrike - 1) * step + 72)
      : {x:420,y:homeY,angle:0};
    this.hand.setPosition(pose.x, pose.y, 0); this.hand.angle = pose.angle;
    const squash = striking && impactAge >= 0 && impactAge < .09 && r.lastHit > 0
      ? Math.sin(impactAge / .09 * Math.PI) * .045 : 0;
    this.hand.setScale(1 + squash, 1 - squash, 1);
    for (let j = 0; j < this.dust.length; j++) {
      const order = Math.floor(j / this.dust.length * r.lastHit);
      const t = age - brickSplitTime(order), chip = this.dust[j], dir = j % 2 ? 1 : -1;
      chip.active = striking && r.lastHit > 0 && t >= 0 && t < .32;
      if (!chip.active) continue;
      chip.setPosition(dir * (15 + (200 + j % 4 * 45) * t),
        base + (r.beforeStrike - 1 - order) * step + 45 + 140 * t - 500 * t * t, 0);
      chip.angle = j * 31 + dir * t * 360; const scale = 1 - t / .32;chip.setScale(scale, scale, 1);
    }
    if (r.impacted) {
      const t = Math.max(0, impactAge), pop = 1 + Math.sin(Math.min(1, t / .2) * Math.PI) * (.18 + .24 * strength);
      this.hitLabel.node.setScale(pop,pop,1);
      this.hitLabel.node.setPosition(0,base + (r.beforeStrike - 1) * step + 175 + Math.min(t, .3) * 60,0);
    } else this.hitLabel.node.setScale(1,1,1);
    this.hitLabel.node.active = r.impacted && !preview && !this.resultOverlay.active
      && (r.phase === 'aiming' || r.phase === 'striking') && this.hitLabel.string.length > 0;
  }
  private showResult(): void {
    this.resultTitle.string = this.round.phase === 'success' ? '挑战成功' : '挑战失败';
    this.resultDetail.string = `劈开砖块：${12 - this.round.remaining}/12\n使用次数：${this.round.attempts}\n${this.round.phase === 'success' ? '掌力惊人，全部劈开！' : '机会用完，再试一次吧！'}`;
    this.hud.active = false; this.hitLabel.node.active = false; this.resultOverlay.active = true;
  }
  private replay(): void {
    if (this.disposed || this.leaving) return;
    this.stopFeedback(); this.finishVibrationSent = false;
    this.serial++; this.adInFlight = false; this.previewClock = 0; this.round = new BrickChopRound();
    this.exitPaused = false; this.exitOverlay.active = false; this.resultOverlay.active = false;
    this.hud.active = true; this.hitLabel.string = ''; this.render();
  }
  private async reward(kind: 'slow' | 'extra'): Promise<void> {
    this.activate();
    if (this.blocked() || this.round.phase !== 'aiming') return;
    const serial = this.serial; this.adInFlight = true; this.syncAudio(); this.render();
    let rewarded = false;
    try { rewarded = await SdkUtils.showRewardedVideo(); }
    catch (error) { console.warn('[BrickChop] rewarded ad failed', error); }
    if (this.disposed || this.leaving || serial !== this.serial || !this.node?.isValid) return;
    this.adInFlight = false;
    if (rewarded) { if (kind === 'slow') this.round.slowDown(); else this.round.addChances(); }
    this.render(); this.syncAudio(true);
    this.hintLabel.string = rewarded ? (kind === 'slow' ? '蓄力已降速，看准时机！' : '已增加3次机会！') : '完整看完广告才能获得奖励';
  }
  private playFeedback(source: AudioSource, volume: number): void {
    if (this.presentationPaused() || !AudioManager.canPlaySound() || !source?.isValid) return;
    source.stop(); source.volume = volume; source.play();
  }
  private stopFeedback(): void {
    for (const source of [this.swingAudio, this.impactAudio]) if (source?.isValid) source.stop();
    if (this.impactRoot?.isValid) this.impactRoot.setPosition(0,0,0);
  }
  private requestExit(): void {
    if (this.presentationPaused() || this.resultOverlay.active) return;
    this.exitPaused = true; this.exitOverlay.active = true; this.syncAudio();
  }
  private cancelExit(): void {
    if (this.disposed || this.leaving) return;
    this.exitPaused = false; this.exitOverlay.active = false; this.syncAudio();
  }
  private async home(): Promise<void> {
    if (this.leaving || this.adInFlight) return;
    this.leaving = true; this.serial++; this.syncAudio();
    try { await GameSceneBundle.loadScene(GameSceneName.Main); }
    catch (error) { this.leaving = false; this.syncAudio(); console.error('[BrickChop] return failed', error); }
  }
  protected onDestroy(): void {
    this.disposed = true; this.serial++; this.stopFeedback();
    if (this.surface?.isValid) this.surface.off(Node.EventType.TOUCH_START, this.onTap, this);
    for (const [b, fn] of this.actions()) if (b?.node?.isValid) b.node.off(Button.EventType.CLICK, fn, this);
    game.off(Game.EVENT_HIDE, this.onHide, this); game.off(Game.EVENT_SHOW, this.onShow, this);
    FeedAcquisitionService.removeListener(this.feedChanged);
    if (this.feed) { adc.cancelFeedEntryInterstitial(); FeedAcquisitionService.completeSession(); }
  }
}
