import {
  _decorator,
  AudioSource,
  Button,
  Component,
  Game,
  game,
  Label,
  Node,
  ResolutionPolicy,
  sys,
  UIOpacity,
  view,
} from 'cc';
import { JellyCrushRound, JELLY_COUNTDOWN_SECONDS } from './jellyCrushRules';
import { FeedAcquisitionService, FeedAcquisitionState } from './framework/Platform/FeedAcquisitionService';
import { adc } from './framework/Platform/ADController';
import { SdkUtils } from './framework/Platform/sdk/SdkUtils';
import { GameSceneBundle, GameSceneName } from './framework/GameSceneBundle';
import { soundName } from './gamePrefabMgr';
import AudioManager from './framework/AudioManager';

const { ccclass, property } = _decorator;
const JELLY_BEST_SCORE_KEY = 'jellyCrushBestScore';

@ccclass('jellyCrushFeedGameScene')
export class jellyCrushFeedGameScene extends Component {
  @property(Node) surface: Node = null;
  @property(Node) playfieldRoot: Node = null;
  @property(Node) pressHead: Node = null;
  @property([Node]) jellies: Node[] = [];
  @property(Node) heartItem: Node = null;
  @property(Node) clockItem: Node = null;
  @property(Node) hud: Node = null;
  @property(Label) titleLabel: Label = null;
  @property(Label) lifeLabel: Label = null;
  @property(Label) scoreLabel: Label = null;
  @property(Label) timeLabel: Label = null;
  @property(Label) hintLabel: Label = null;
  @property(Label) countdownLabel: Label = null;
  @property(Label) hitLabel: Label = null;
  @property(Button) rewardButton: Button = null;
  @property(Node) resultOverlay: Node = null;
  @property(Label) resultTitle: Label = null;
  @property(Label) resultKicker: Label = null;
  @property(Label) resultDetail: Label = null;
  @property(Button) reviveButton: Button = null;
  @property(Button) replayButton: Button = null;
  @property(Button) homeButton: Button = null;
  @property(Button) backButton: Button = null;
  @property(Node) exitOverlay: Node = null;
  @property(Button) continueButton: Button = null;
  @property(Button) exitButton: Button = null;
  @property(AudioSource) pressAudio: AudioSource = null;
  @property(AudioSource) hitAudio: AudioSource = null;
  @property(AudioSource) missAudio: AudioSource = null;

  public round = new JellyCrushRound();
  private feed = false;
  private entered = true;
  private exited = false;
  private hidden = false;
  private disposed = false;
  private leaving = false;
  private exitPaused = false;
  private adInFlight = false;
  private adScheduled = false;
  private previewClock = 0;
  private renderedEventSerial = 0;
  private audioRecovered = false;
  private squashTargets: Array<{ id: number; x: number; y: number }> = [];
  private squashVisualAge = 99;
  private bestScore = 0;
  private backButtonParent: Node | null = null;
  private backButtonSiblingIndex = -1;

  // The extracted art is 920 design units tall. The warning strip starts at
  // -384, so this travel leaves the press plate on the strip instead of
  // passing through it at full extension.
  private readonly pressRestY = 360;
  private readonly pressTravel = 284;
  private readonly jellyVisibleFloorY = -384;
  // jelly-red.png has 49 transparent design units below its visible body.
  // Moving the node while it squashes keeps that visible base on the floor.
  private readonly jellyVisibleBottomOffset = -49;

  protected onLoad(): void {
    view.setDesignResolutionSize(750, 1624, ResolutionPolicy.FIXED_WIDTH);
    this.bestScore = this.loadBestScore();
    FeedAcquisitionService.init();
    this.feed = FeedAcquisitionService.isActive();
    const state = FeedAcquisitionService.getState();
    this.entered = !this.feed || state.entered;
    this.exited = this.feed && state.exited;
    FeedAcquisitionService.addListener(this.onFeedChanged);
    this.surface?.on(Node.EventType.TOUCH_START, this.onTap, this);
    this.bindButton(this.rewardButton, this.rewardLife);
    this.bindButton(this.reviveButton, this.revive);
    this.bindButton(this.replayButton, this.replay);
    this.bindButton(this.homeButton, this.home);
    this.bindButton(this.backButton, this.toggleExit);
    this.bindButton(this.continueButton, this.cancelExit);
    this.bindButton(this.exitButton, this.home);
    this.backButtonParent = this.backButton?.node?.parent ?? null;
    this.backButtonSiblingIndex = this.backButton?.node?.getSiblingIndex?.() ?? -1;
    // Endless mode tracks crushed jellies instead of a countdown. Hide the
    // legacy timer even when an older authored scene still contains the node.
    if (this.timeLabel?.node) this.timeLabel.node.active = false;
    game.on(Game.EVENT_HIDE, this.onHide, this);
    game.on(Game.EVENT_SHOW, this.onShow, this);
    this.replay();
  }

  protected start(): void {
    adc.onEnterGame(this.node);
    if (this.feed) {
      void FeedAcquisitionService.reportSceneReadyAfterStableRender({
        owner: this.node,
        requiredVisibleNodes: [this.surface, this.pressHead, this.jellies[0]],
        stableFrameCount: 3,
        surfaceDelayMs: 180,
        isReady: () => !this.disposed && !this.leaving && !this.exited,
      });
    }
    this.scheduleAd();
    this.syncAudio();
  }

  protected update(dt: number): void {
    if (this.presentationPaused()) return;
    const step = Math.max(0, Math.min(0.1, Number.isFinite(dt) ? dt : 0));
    this.squashVisualAge += step;
    if (this.feed && (!this.entered || this.exited)) {
      this.previewClock += step;
      this.render(true);
      return;
    }

    const previousPhase = this.round.phase;
    this.round.tick(step);
    if (this.round.eventSerial !== this.renderedEventSerial) {
      this.renderedEventSerial = this.round.eventSerial;
      this.playRoundEvent();
    }
    this.render(false);
    if (previousPhase !== this.round.phase && (this.round.phase === 'success' || this.round.phase === 'failure')) {
      this.showResult();
      void AudioManager.playEffectByName(this.round.phase === 'success' ? 'up' : 'fail');
    }
  }

  private bindButton(button: Button, handler: () => void): void {
    button?.node?.on(Button.EventType.CLICK, handler, this);
  }

  private onFeedChanged = (state: FeedAcquisitionState): void => {
    if (!this.feed) return;
    const changed = this.entered !== state.entered || this.exited !== state.exited;
    this.entered = state.entered;
    this.exited = state.exited;
    if (!this.entered || this.exited) {
      adc.cancelFeedEntryInterstitial();
      this.adScheduled = false;
    } else {
      this.scheduleAd();
    }
    this.syncAudio(changed);
    this.render(false);
  };

  private scheduleAd(): void {
    if (!this.feed || !this.entered || this.exited || this.adScheduled) return;
    this.adScheduled = true;
    adc.scheduleFeedEntryInterstitial(() => !this.disposed && !this.leaving && this.entered && !this.exited);
  }

  private presentationPaused(): boolean {
    return this.hidden || this.disposed || this.leaving || this.exitPaused || this.adInFlight || SdkUtils.isRewardedVideoBusy();
  }

  private blocked(): boolean {
    return this.presentationPaused() || this.resultOverlay?.active || (this.feed && (!this.entered || this.exited));
  }

  private syncAudio(restart = false): void {
    if (this.presentationPaused()) {
      this.audioRecovered = false;
      AudioManager.pauseBgmForVideo();
      return;
    }
    AudioManager.setSoundEvent();
    if (restart) AudioManager.restartMusic(soundName.getUserBgm);
    else AudioManager.playMusic(soundName.getUserBgm);
  }

  private activate(): void {
    if (this.feed && !this.entered && !this.exited) FeedAcquisitionService.activateFromFirstTouch();
    if (!this.blocked() && !this.audioRecovered) {
      this.syncAudio(true);
      this.audioRecovered = true;
    }
  }

  private onTap(): void {
    this.activate();
    if (this.blocked()) return;
    if (this.round.press()) {
      this.render(false);
    }
  }

  private onHide(): void {
    this.hidden = true;
    this.syncAudio();
  }

  private onShow(): void {
    this.hidden = false;
    this.syncAudio(true);
  }

  private playRoundEvent(): void {
    if (this.round.lastEvent === 'hit') {
      // The extracted clip is the hydraulic squash from the reference video.
      // Play it once when contact is resolved, so empty presses stay silent and
      // the old generic impact clip cannot create a doubled hit.
      this.playEffect(this.pressAudio, 0.9);
      this.squashTargets = this.round.lastEventTargetPositions.map(target => ({ ...target }));
      this.squashVisualAge = 0;
      SdkUtils.vibrateShort();
    } else if (this.round.lastEvent === 'heart' || this.round.lastEvent === 'slow') {
      SdkUtils.vibrateShort();
    } else if (this.round.lastEvent === 'miss' || this.round.lastEvent === 'escape') {
      this.playEffect(this.missAudio, 0.72);
      SdkUtils.vibrateShort();
    }
  }

  private playEffect(source: AudioSource, volume: number): void {
    if (!source?.isValid || this.presentationPaused() || !AudioManager.canPlaySound()) return;
    source.stop();
    source.volume = volume;
    source.play();
  }

  private render(preview: boolean): void {
    const visiblePreview = preview || (this.feed && (!this.entered || this.exited));
    const round = this.round;
    const pressProgress = visiblePreview
      ? (Math.sin(this.previewClock * 2.8) + 1) * 0.5
      : this.easePress(round.pressProgress);
    // The artwork contains the whole rod, so its lower metal plate stays just
    // above the warning strip at rest and reaches the jelly line on contact.
    const headY = this.pressRestY - pressProgress * this.pressTravel;
    this.pressHead?.setPosition(0, headY, 0);
    const squash = round.phase === 'pressing' && !visiblePreview
      ? Math.sin(Math.min(1, round.pressAge / Math.max(0.1, round.contactTime)) * Math.PI) * 0.08
      : 0;
    const impactPulse = !visiblePreview && this.squashVisualAge < 0.18
      ? Math.sin(Math.min(1, this.squashVisualAge / 0.18) * Math.PI) * 0.12
      : 0;
    this.pressHead?.setScale(1 + squash + impactPulse, 1 - squash - impactPulse * 0.7, 1);

    const shake = !visiblePreview && round.impactAge < 0.14
      ? Math.sin(round.impactAge * 150) * (8 * (1 - round.impactAge / 0.14))
      : 0;
    this.playfieldRoot?.setPosition(shake, shake * 0.3, 0);

    const previewOffset = visiblePreview ? Math.sin(this.previewClock * 2.1) * 85 : 0;
    round.targets.forEach((target, index) => {
      const node = this.jellies[index];
      if (!node) return;
      const opacity = node.getComponent(UIOpacity);
      const squashTarget = this.squashTargets.find(item => item.id === target.id);
      const isSquashing = !visiblePreview && !!squashTarget && this.squashVisualAge < 0.34;
      node.active = visiblePreview ? index < Math.min(3, round.activeTargetCount + 1) : target.active || isSquashing;
      const x = isSquashing ? squashTarget?.x ?? target.x : visiblePreview ? target.x + previewOffset + index * 22 : target.x;
      if (isSquashing) {
        const t = Math.min(1, this.squashVisualAge / 0.34);
        const settle = t < 0.2 ? t / 0.2 : 1 - (t - 0.2) / 0.8;
        const scaleY = Math.max(0.08, 0.2 + settle * 0.18);
        const y = this.jellyVisibleFloorY - this.jellyVisibleBottomOffset * scaleY;
        node.setPosition(x, y, 0);
        node.setScale(1.08 + settle * 0.32, scaleY, 1);
        if (opacity) opacity.opacity = Math.round(255 * Math.max(0, 1 - Math.max(0, t - 0.45) / 0.55));
        node.angle = Math.sin(t * Math.PI) * 3;
        return;
      }
      node.setPosition(x, target.y, 0);
      if (opacity) opacity.opacity = 255;
      node.setScale(1, 1, 1);
      node.angle = 0;
    });
    this.heartItem.active = !visiblePreview && round.heart.active;
    this.clockItem.active = !visiblePreview && round.clock.active;
    if (round.heart.active) this.heartItem.setPosition(round.heart.x, round.heart.y, 0);
    if (round.clock.active) this.clockItem.setPosition(round.clock.x, round.clock.y, 0);

    this.lifeLabel.string = `${round.lives}`;
    this.scoreLabel.string = `${round.score}`;
    if (this.timeLabel?.node) this.timeLabel.node.active = false;
    const showingCountdown = !visiblePreview && round.phase === 'countdown';
    this.hintLabel.node.setScale(1, 1, 1);
    if (this.countdownLabel?.node) this.countdownLabel.node.active = showingCountdown;
    if (showingCountdown && this.countdownLabel) {
      this.countdownLabel.string = `${Math.max(1, Math.ceil(round.countdownRemaining))}`;
      const pulse = 1 + Math.sin((JELLY_COUNTDOWN_SECONDS - round.countdownRemaining) * Math.PI * 2) * 0.06;
      this.countdownLabel.node.setScale(pulse, pulse, 1);
    } else if (this.countdownLabel?.node) {
      this.countdownLabel.node.setScale(1, 1, 1);
    }
    const collectedItems = round.lastCollectedItems ?? [];
    const itemFeedback = [
      collectedItems.includes('heart') ? '生命 +1' : '',
      collectedItems.includes('slow') ? '减速！' : '',
    ].filter(Boolean).join(' · ');
    const hitCount = Math.max(1, round.lastEventTargetIds.length);
    this.hitLabel.string = round.lastEvent === 'hit'
      ? [`命中！+${hitCount}`, itemFeedback].filter(Boolean).join(' · ')
      : itemFeedback
        ? itemFeedback
        : round.lastEvent === 'escape' ? '果冻逃脱 -1❤️'
          : round.lastEvent === 'miss' ? '压空了' : '';
    this.hitLabel.node.active = !visiblePreview && round.impactAge < 0.6 && round.lastEvent !== null && !this.resultOverlay.active;
    if (this.hitLabel.node.active) {
      const pop = 1 + Math.sin(Math.min(1, round.impactAge / 0.18) * Math.PI) * 0.16;
      this.hitLabel.node.setScale(pop, pop, 1);
      this.hitLabel.node.setPosition(0, -155 + Math.min(round.impactAge, 0.25) * 90, 0);
    } else {
      this.hitLabel.node.setScale(1, 1, 1);
    }
    const canRewardLife = !this.blocked() && (round.phase === 'playing' || round.phase === 'pressing') && round.lives < 5;
    this.rewardButton.interactable = canRewardLife;
  }

  private easePress(progress: number): number {
    if (progress <= 0.5) return 2 * progress * progress;
    return 1 - Math.pow(-2 * progress + 2, 2) / 2;
  }

  private showResult(): void {
    this.updateBestScore();
    const success = this.round.phase === 'success';
    this.resultTitle.string = success ? '挑战成功' : '挑战失败';
    if (this.resultKicker?.node) this.resultKicker.node.active = success;
    if (this.backButton?.node) this.backButton.node.active = success;
    this.resultDetail.string = `本次压中 ${this.round.score} 个\n最高记录 ${this.bestScore} 个`;
    this.hud.active = false;
    this.reviveButton.node.active = this.round.phase === 'failure';
    this.resultOverlay.active = true;
  }

  private loadBestScore(): number {
    try {
      return Math.max(0, Math.floor(Number(sys.localStorage.getItem(JELLY_BEST_SCORE_KEY)) || 0));
    } catch {
      return 0;
    }
  }

  private updateBestScore(): void {
    if (this.round.score <= this.bestScore) return;
    this.bestScore = this.round.score;
    try {
      sys.localStorage.setItem(JELLY_BEST_SCORE_KEY, String(this.bestScore));
    } catch {
      // Storage can be unavailable in the editor preview. The in-memory value
      // still keeps the result correct for the current scene instance.
    }
  }

  private replay = (): void => {
    if (this.disposed || this.leaving) return;
    this.round = new JellyCrushRound();
    this.round.start();
    this.renderedEventSerial = 0;
    this.previewClock = 0;
    this.squashTargets = [];
    this.squashVisualAge = 99;
    this.exitPaused = false;
    this.exitOverlay.active = false;
    this.restoreBackButtonParent();
    this.resultOverlay.active = false;
    this.hud.active = true;
    if (this.resultKicker?.node) this.resultKicker.node.active = true;
    if (this.backButton?.node) this.backButton.node.active = true;
    this.render(false);
  };

  private rewardLife = (): void => { void this.reward('life'); };

  private revive = (): void => { void this.reward('revive'); };

  private async reward(kind: 'life' | 'revive'): Promise<void> {
    this.activate();
    if (this.presentationPaused() || (this.feed && (!this.entered || this.exited))) return;
    if (kind === 'life' && this.resultOverlay.active) return;
    if (kind === 'life' && (this.round.phase !== 'playing' && this.round.phase !== 'pressing')) return;
    if (kind === 'life' && this.round.lives >= 5) return;
    if (kind === 'revive' && this.round.phase !== 'failure') return;
    const roundSerial = this.round.eventSerial;
    this.adInFlight = true;
    this.syncAudio();
    let rewarded = false;
    try {
      rewarded = await SdkUtils.showRewardedVideo();
    } catch (error) {
      console.warn('[JellyCrush] rewarded ad failed', error);
    }
    if (this.disposed || this.leaving || roundSerial !== this.round.eventSerial) return;
    this.adInFlight = false;
    if (rewarded) {
      if (kind === 'life') this.round.addLife();
      else this.round.revive();
      this.resultOverlay.active = false;
      this.hud.active = true;
    }
    this.render(false);
    this.syncAudio(true);
  }

  private requestExit = (): void => {
    if (this.blocked() || this.resultOverlay.active) return;
    this.exitPaused = true;
    this.exitOverlay.active = true;
    this.moveBackButtonToExitOverlay();
    this.syncAudio();
  };

  private cancelExit = (): void => {
    if (this.disposed || this.leaving) return;
    this.exitPaused = false;
    this.exitOverlay.active = false;
    this.restoreBackButtonParent();
    this.syncAudio();
  };

  private toggleExit = (): void => {
    if (this.exitOverlay?.active) this.cancelExit();
    else this.requestExit();
  };

  private moveBackButtonToExitOverlay(): void {
    const node = this.backButton?.node;
    if (!node?.isValid || !this.exitOverlay?.isValid || node.parent === this.exitOverlay) return;
    if (!this.backButtonParent) this.backButtonParent = node.parent;
    if (this.backButtonSiblingIndex < 0) this.backButtonSiblingIndex = node.getSiblingIndex();
    node.parent = this.exitOverlay;
    node.setSiblingIndex(this.exitOverlay.children.length - 1);
  }

  private restoreBackButtonParent(): void {
    const node = this.backButton?.node;
    if (!node?.isValid || !this.backButtonParent?.isValid || node.parent === this.backButtonParent) return;
    node.parent = this.backButtonParent;
    if (this.backButtonSiblingIndex >= 0) {
      node.setSiblingIndex(Math.min(this.backButtonSiblingIndex, this.backButtonParent.children.length - 1));
    }
  }

  private safeNodeOff(node: Node | null, event: string, handler: Function): void {
    if (!node?.isValid) return;
    try {
      node.off(event, handler, this);
    } catch {
      // During scene teardown Cocos may clear the node event processor before
      // invoking this component's onDestroy callback.
    }
  }

  private home = async (): Promise<void> => {
    if (this.leaving || this.adInFlight) return;
    this.leaving = true;
    this.syncAudio();
    try {
      await GameSceneBundle.loadScene(GameSceneName.Main);
    } catch (error) {
      this.leaving = false;
      this.syncAudio();
      console.error('[JellyCrush] return failed', error);
    }
  };

  protected onDestroy(): void {
    this.disposed = true;
    this.safeNodeOff(this.surface, Node.EventType.TOUCH_START, this.onTap);
    for (const [button, handler] of [
      [this.rewardButton, this.rewardLife],
      [this.reviveButton, this.revive],
      [this.replayButton, this.replay],
      [this.homeButton, this.home],
      [this.backButton, this.toggleExit],
      [this.continueButton, this.cancelExit],
      [this.exitButton, this.home],
    ] as [Button, Function][]) {
      this.safeNodeOff(button?.node ?? null, Button.EventType.CLICK, handler);
    }
    if (game?.off) {
      game.off(Game.EVENT_HIDE, this.onHide, this);
      game.off(Game.EVENT_SHOW, this.onShow, this);
    }
    FeedAcquisitionService.removeListener(this.onFeedChanged);
    if (this.feed) {
      adc.cancelFeedEntryInterstitial();
      FeedAcquisitionService.completeSession();
    }
  }
}
