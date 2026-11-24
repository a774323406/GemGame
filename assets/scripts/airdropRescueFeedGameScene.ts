import {
  _decorator,
  AudioSource,
  Button,
  Component,
  EventTouch,
  Game,
  game,
  Label,
  Node,
  ResolutionPolicy,
  UITransform,
  view,
} from 'cc';
import { AirdropRescueRound, AirdropTarget } from './airdropRescueRules';
import { FeedAcquisitionService, FeedAcquisitionState } from './framework/Platform/FeedAcquisitionService';
import { adc } from './framework/Platform/ADController';
import { SdkUtils } from './framework/Platform/sdk/SdkUtils';
import { GameSceneBundle, GameSceneName } from './framework/GameSceneBundle';
import AudioManager from './framework/AudioManager';
import { soundName } from './gamePrefabMgr';

const { ccclass, property } = _decorator;

@ccclass('airdropRescueFeedGameScene')
export class airdropRescueFeedGameScene extends Component {
  @property(Node) surface: Node = null;
  @property(Node) playfield: Node = null;
  @property(Node) hud: Node = null;
  @property([Node]) targetPool: Node[] = [];
  @property(Node) bottle: Node = null;
  @property(Node) pig: Node = null;
  @property(Button) backButton: Button = null;
  @property(Label) titleLabel: Label = null;
  @property(Label) timerLabel: Label = null;
  @property(Label) foodLabel: Label = null;
  @property(Label) chanceLabel: Label = null;
  @property(Button) jumpButton: Button = null;
  @property(Button) addTimeButton: Button = null;
  @property(Button) hintButton: Button = null;
  @property(Label) hintLabel: Label = null;
  @property(Node) resultOverlay: Node = null;
  @property(Label) resultTitle: Label = null;
  @property(Label) resultDetail: Label = null;
  @property(Button) reviveButton: Button = null;
  @property(Button) replayButton: Button = null;
  @property(Button) homeButton: Button = null;
  @property(Node) exitOverlay: Node = null;
  @property(Button) continueButton: Button = null;
  @property(Button) restartButton: Button = null;
  @property(Button) exitButton: Button = null;
  @property(AudioSource) releaseAudio: AudioSource = null;
  @property(AudioSource) caughtAudio: AudioSource = null;
  @property(AudioSource) missAudio: AudioSource = null;

  round = new AirdropRescueRound();
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
  private hintAge = 0;
  private lastPhase = 'ready';

  protected onLoad(): void {
    view.setDesignResolutionSize(750, 1624, ResolutionPolicy.FIXED_WIDTH);
    FeedAcquisitionService.init();
    this.feed = FeedAcquisitionService.isActive();
    const state = FeedAcquisitionService.getState();
    this.entered = !this.feed || state.entered;
    this.exited = this.feed && state.exited;
    this.replay();
    FeedAcquisitionService.addListener(this.feedChanged);
    this.surface?.on(Node.EventType.TOUCH_START, this.onTouchStart, this);
    for (const [button, callback] of this.actions()) button?.node?.on(Button.EventType.CLICK, callback, this);
    game.on(Game.EVENT_HIDE, this.onHide, this);
    game.on(Game.EVENT_SHOW, this.onShow, this);
  }

  protected start(): void {
    adc.onEnterGame(this.node);
    if (this.feed) {
      void FeedAcquisitionService.reportSceneReadyAfterStableRender({
        owner: this.node,
        requiredVisibleNodes: [this.surface, this.bottle, this.pig],
        stableFrameCount: 3,
        surfaceDelayMs: 180,
        isReady: () => !this.disposed && !this.leaving,
      });
    }
    this.scheduleAd();
    this.syncAudio();
  }

  private actions(): [Button, Function][] {
    return [
      [this.backButton, this.requestExit],
      [this.jumpButton, this.jump],
      [this.addTimeButton, this.addTime],
      [this.hintButton, this.hint],
      [this.reviveButton, this.revive],
      [this.replayButton, this.replay],
      [this.homeButton, this.home],
      [this.continueButton, this.cancelExit],
      [this.restartButton, this.replay],
      [this.exitButton, this.home],
    ];
  }

  private feedChanged = (state: FeedAcquisitionState): void => {
    if (!this.feed || this.disposed) return;
    this.entered = state.entered;
    this.exited = state.exited;
    if (!this.entered || this.exited) {
      adc.cancelFeedEntryInterstitial();
      this.adScheduled = false;
      if (this.exited) {
        this.serial += 1;
        this.adInFlight = false;
        this.stopEffects();
      }
    } else {
      this.scheduleAd();
    }
    this.refreshActions();
    this.syncAudio(this.entered && !this.exited);
  };

  private scheduleAd(): void {
    if (!this.feed || !this.entered || this.exited || this.adScheduled) return;
    this.adScheduled = true;
    adc.scheduleFeedEntryInterstitial(() => !this.disposed && !this.leaving && this.entered && !this.exited);
  }

  private paused(): boolean {
    return this.disposed || this.hidden || this.leaving || this.exitPaused || this.adInFlight || SdkUtils.isRewardedVideoBusy();
  }

  private blocked(): boolean {
    return this.paused() || (this.feed && (!this.entered || this.exited));
  }

  private activateTouch(): void {
    if (!this.disposed && !this.leaving && this.feed && !this.entered) FeedAcquisitionService.activateFromFirstTouch();
  }

  private onTouchStart(event: EventTouch): void {
    this.activateTouch();
    if (this.blocked() || this.resultOverlay?.active) return;
    const location = event?.getUILocation?.();
    const touchX = Number.isFinite(location?.x) ? location.x - 375 : 0;
    const target = this.chooseTarget(touchX);
    if (!target || !this.round.releaseTarget(target.id)) return;
    this.playEffect(this.releaseAudio, .45);
    this.refreshActions();
  }

  private chooseTarget(touchX: number): AirdropTarget | null {
    let selected: AirdropTarget | null = null;
    let distance = Infinity;
    for (const target of this.round.targets) {
      if (target.state !== 'suspended') continue;
      const candidateDistance = Math.abs(target.x - touchX);
      if (candidateDistance < distance) {
        selected = target;
        distance = candidateDistance;
      }
    }
    return selected;
  }

  protected update(deltaTime: number): void {
    if (this.disposed) return;
    const dt = Math.min(.1, Math.max(0, Number.isFinite(deltaTime) ? deltaTime : 0));
    if (this.blocked()) {
      if (!this.entered && !this.exited) this.round.previewStep(dt);
      this.render();
      return;
    }
    this.round.step(dt);
    for (const event of this.round.drainEvents()) {
      if (event.kind === 'caught') {
        this.playEffect(this.caughtAudio, .6);
        SdkUtils.vibrateShort();
      } else if (event.kind === 'miss') {
        this.playEffect(this.missAudio, .5);
        SdkUtils.vibrateShort();
      }
    }
    this.hintAge = Math.max(0, this.hintAge - dt);
    if (this.hintAge <= 0 && this.hintLabel) this.hintLabel.string = '';
    if (this.round.phase !== this.lastPhase) {
      this.lastPhase = this.round.phase;
      if (this.round.phase === 'success' || this.round.phase === 'failure') this.showResult();
    }
    this.render();
  }

  private render(): void {
    if (this.timerLabel) this.timerLabel.string = `时间：${Math.ceil(this.round.timeRemaining)}s`;
    if (this.foodLabel) this.foodLabel.string = `食物\n${this.round.food}/5`;
    if (this.chanceLabel) this.chanceLabel.string = `剩余机会\n${this.round.chances}/25`;
    for (let index = 0; index < this.targetPool.length; index += 1) {
      const node = this.targetPool[index];
      const target = this.round.targets[index];
      node.active = !!target;
      if (!target) continue;
      node.setPosition(target.x, 620 - target.y, 0);
      const helicopter = node.getChildByName('Helicopter');
      const vegetable = node.getChildByName('Vegetable');
      const falling = target.state === 'falling';
      if (helicopter) helicopter.active = !falling;
      if (vegetable) {
        vegetable.active = true;
        vegetable.setPosition(0, falling ? 0 : -82, 0);
        vegetable.setScale(falling ? 1.05 : 1, falling ? 1.05 : 1, 1);
      }
      if (this.hintAge > 0 && !falling) node.setScale(1.08, 1.08, 1);
      else node.setScale(1, 1, 1);
    }
    this.refreshActions();
  }

  private refreshActions(): void {
    const ready = !this.paused();
    this.backButton && (this.backButton.interactable = ready && !this.resultOverlay?.active);
    const playing = ready && this.round.phase === 'playing';
    for (const button of [this.jumpButton, this.addTimeButton, this.hintButton]) if (button) button.interactable = playing && !this.adInFlight;
    for (const button of [this.reviveButton, this.replayButton, this.homeButton]) if (button) button.interactable = !this.adInFlight && !this.leaving;
    if (this.reviveButton) this.reviveButton.node.active = this.round.phase === 'failure';
  }

  private async reward(kind: 'jump' | 'addTime' | 'hint' | 'revive'): Promise<void> {
    if (this.adInFlight || this.disposed || this.leaving) return;
    const token = ++this.serial;
    this.adInFlight = true;
    this.syncAudio();
    let rewarded = false;
    try {
      rewarded = await SdkUtils.showRewardedVideo();
    } catch (error) {
      console.warn('[AirdropRescue] rewarded video failed', error);
    }
    if (this.disposed || this.leaving || token !== this.serial) return;
    this.adInFlight = false;
    if (rewarded) {
      if (kind === 'jump') {
        this.round.completeLevel();
      } else if (kind === 'addTime') {
        this.round.addTime(60);
      } else if (kind === 'hint') {
        this.hintAge = 2.4;
        if (this.hintLabel) this.hintLabel.string = '优先接住高亮蔬菜';
      } else if (kind === 'revive') {
        this.round.revive();
        if (this.resultOverlay) this.resultOverlay.active = false;
        if (this.hud) this.hud.active = true;
      }
    }
    this.syncAudio(true);
    this.render();
  }

  private jump = (): void => { void this.reward('jump'); };
  private addTime = (): void => { void this.reward('addTime'); };
  private hint = (): void => { void this.reward('hint'); };
  private revive = (): void => { void this.reward('revive'); };

  private showResult(): void {
    if (this.hud) this.hud.active = false;
    if (this.resultTitle) this.resultTitle.string = this.round.phase === 'success' ? '挑战成功' : '挑战失败';
    if (this.resultDetail) this.resultDetail.string = `本次食物 ${this.round.food}/5`;
    if (this.resultOverlay) this.resultOverlay.active = true;
    if (this.round.phase === 'success') this.reviveButton && (this.reviveButton.node.active = false);
    adc.onLevelResult(this.round.food, this.round.phase === 'success' ? 'success' : 'fail');
    this.refreshActions();
  }

  private replay = (): void => {
    if (this.disposed || this.leaving || this.adInFlight) return;
    this.serial += 1;
    this.round = new AirdropRescueRound();
    this.round.start();
    this.lastPhase = this.round.phase;
    this.exitPaused = false;
    if (this.exitOverlay) this.exitOverlay.active = false;
    if (this.resultOverlay) this.resultOverlay.active = false;
    if (this.hud) this.hud.active = true;
    this.hintAge = 0;
    this.render();
  };

  private requestExit = (): void => {
    this.activateTouch();
    if (this.blocked() || this.resultOverlay?.active) return;
    this.exitPaused = true;
    if (this.hud) this.hud.active = false;
    if (this.exitOverlay) this.exitOverlay.active = true;
    this.syncAudio();
  };

  private cancelExit = (): void => {
    if (this.disposed || this.leaving) return;
    this.exitPaused = false;
    if (this.exitOverlay) this.exitOverlay.active = false;
    if (this.hud) this.hud.active = true;
    this.syncAudio(true);
    this.refreshActions();
  };

  private async home(): Promise<void> {
    if (this.leaving || this.adInFlight || this.disposed) return;
    this.leaving = true;
    this.serial += 1;
    this.syncAudio();
    try {
      await GameSceneBundle.loadScene(GameSceneName.Main);
    } catch (error) {
      this.leaving = false;
      this.syncAudio(true);
      console.warn('[AirdropRescue] return failed', error);
    }
  }

  private syncAudio(recoverNative = false): void {
    if (this.paused()) {
      this.stopEffects();
      AudioManager.pauseBgmForVideo();
      return;
    }
    AudioManager.setSoundEvent();
    if (recoverNative) AudioManager.restartMusic(soundName.getUserBgm);
    else AudioManager.playMusic(soundName.getUserBgm);
  }

  private onHide = (): void => { this.hidden = true; this.syncAudio(); };
  private onShow = (): void => { this.hidden = false; this.syncAudio(true); this.refreshActions(); };

  private playEffect(source: AudioSource, volume: number): void {
    if (!source?.isValid || this.paused() || !AudioManager.canPlaySound()) return;
    source.stop(); source.volume = volume; source.play();
  }

  private stopEffects(): void {
    for (const source of [this.releaseAudio, this.caughtAudio, this.missAudio]) if (source?.isValid) source.stop();
  }

  protected onDestroy(): void {
    this.disposed = true;
    this.serial += 1;
    this.stopEffects();
    if (this.surface?.isValid) this.surface.off(Node.EventType.TOUCH_START, this.onTouchStart, this);
    for (const [button, callback] of this.actions()) if (button?.node?.isValid) button.node.off(Button.EventType.CLICK, callback, this);
    game.off(Game.EVENT_HIDE, this.onHide, this);
    game.off(Game.EVENT_SHOW, this.onShow, this);
    FeedAcquisitionService.removeListener(this.feedChanged);
    if (this.feed) {
      adc.cancelFeedEntryInterstitial();
      FeedAcquisitionService.completeSession();
    }
  }
}
