import {
  _decorator,
  AudioSource,
  Button,
  Color,
  Component,
  EventTouch,
  Game,
  game,
  Graphics,
  Label,
  Node,
  ResolutionPolicy,
  UITransform,
  Vec3,
  view,
} from 'cc';
import { AirdropRescueRound } from './airdropRescueRules';
import { FeedAcquisitionService, FeedAcquisitionState } from './framework/Platform/FeedAcquisitionService';
import { adc } from './framework/Platform/ADController';
import { SdkUtils } from './framework/Platform/sdk/SdkUtils';
import { GameSceneBundle, GameSceneName } from './framework/GameSceneBundle';
import AudioManager from './framework/AudioManager';
import { soundName } from './gamePrefabMgr';

const { ccclass, property } = _decorator;
const RULES_ORIGIN_Y = 620;
const BACKGROUND_GROUND_RATIO = 0.312;
const SWIPE_TRAIL_SECONDS = .18;
const MIN_SWIPE_DISTANCE = 8;
type SwipePoint = { x: number; y: number };
type ReleasedSwipe = { from: SwipePoint; to: SwipePoint; age: number };

@ccclass('airdropRescueFeedGameScene')
export class airdropRescueFeedGameScene extends Component {
  @property(Node) surface: Node = null;
  @property(Node) playfield: Node = null;
  @property(Node) hud: Node = null;
  @property([Node]) targetPool: Node[] = [];
  @property([Node]) departingPool: Node[] = [];
  @property([Node]) collectedPool: Node[] = [];
  @property(Graphics) swipeTrail: Graphics = null;
  @property(Node) bottle: Node = null;
  @property(Node) bottleMouth: Node = null;
  @property(Node) bottleInterior: Node = null;
  @property(Node) pig: Node = null;
  @property(Button) backButton: Button = null;
  @property(Label) titleLabel: Label = null;
  @property(Label) foodLabel: Label = null;
  @property(Label) chanceLabel: Label = null;
  @property(Button) slowdownButton: Button = null;
  @property({ min: 1, tooltip: '看完广告后直升机减速的持续时间（秒）' }) slowdownSeconds = 20;
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
  private lastPhase = 'ready';
  private activeTouchId: number | null = null;
  private swipeStartPoint: SwipePoint | null = null;
  private swipeEndPoint: SwipePoint | null = null;
  private releasedSwipe: ReleasedSwipe | null = null;

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
    this.surface?.on(Node.EventType.TOUCH_MOVE, this.onTouchMove, this);
    this.surface?.on(Node.EventType.TOUCH_END, this.onTouchEnd, this);
    this.surface?.on(Node.EventType.TOUCH_CANCEL, this.onTouchCancel, this);
    for (const [button, callback] of this.actions()) button?.node?.on(Button.EventType.CLICK, callback, this);
    game.on(Game.EVENT_HIDE, this.onHide, this);
    game.on(Game.EVENT_SHOW, this.onShow, this);
    view.on('canvas-resize', this.fitGameplay, this);
  }

  protected start(): void {
    this.fitGameplay();
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
      [this.slowdownButton, this.slowdown],
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
      this.clearSwipe();
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
    if (this.blocked() || this.round.phase !== 'playing' || this.activeTouchId !== null) return;
    this.activeTouchId = event.getID();
    this.swipeStartPoint = this.toPlayfieldPoint(event.getUILocation());
    this.swipeEndPoint = this.swipeStartPoint;
    this.releasedSwipe = null;
    this.drawSwipeTrail();
  }

  private onTouchMove(event: EventTouch): void {
    // Feed entry can consume TOUCH_START; keep the original down point, not the
    // previous move, so the preview remains one straight line until release.
    this.activateTouch();
    if (this.blocked() || this.round.phase !== 'playing') { this.clearSwipe(); return; }
    if (this.activeTouchId !== null && event.getID() !== this.activeTouchId) return;
    this.activeTouchId = event.getID();
    this.swipeStartPoint ??= this.toPlayfieldPoint(event.getUIStartLocation());
    this.swipeEndPoint = this.toPlayfieldPoint(event.getUILocation());
    this.releasedSwipe = null;
    this.drawSwipeTrail();
  }

  private onTouchEnd(event: EventTouch): void {
    if (this.activeTouchId !== null && event.getID() !== this.activeTouchId) return;
    this.activateTouch();
    if (this.blocked() || this.round.phase !== 'playing') { this.clearSwipe(); return; }
    const from = this.swipeStartPoint ?? this.toPlayfieldPoint(event.getUIStartLocation());
    const to = this.toPlayfieldPoint(event.getUILocation());
    this.activeTouchId = null;
    this.swipeStartPoint = null;
    this.swipeEndPoint = null;
    const dragged = Math.hypot(to.x - from.x, to.y - from.y) >= MIN_SWIPE_DISTANCE;
    this.releasedSwipe = dragged ? { from, to, age: 0 } : null;
    // Judge once, against rope positions at finger-up. A rope that passed through
    // the preview earlier must not be cut if it is outside the released line now.
    if (dragged && this.round.cutRopes(from.x, RULES_ORIGIN_Y - from.y, to.x, RULES_ORIGIN_Y - to.y) > 0) {
      this.playEffect(this.releaseAudio, .8);
    }
    this.drawSwipeTrail();
    this.render();
  }

  private onTouchCancel(event: EventTouch): void {
    if (this.activeTouchId !== null && event.getID() !== this.activeTouchId) return;
    this.clearSwipe();
  }

  private toPlayfieldPoint(location: { x: number; y: number }): SwipePoint {
    const transform = this.playfield.getComponent(UITransform);
    const point = transform.convertToNodeSpaceAR(new Vec3(location.x, location.y, 0));
    return { x: point.x, y: point.y };
  }

  private drawSwipeTrail(): void {
    const graphics = this.swipeTrail;
    if (!graphics?.isValid) return;
    graphics.clear();
    graphics.lineCap = Graphics.LineCap.ROUND;
    graphics.lineJoin = Graphics.LineJoin.ROUND;
    const line = this.swipeStartPoint && this.swipeEndPoint
      ? { from: this.swipeStartPoint, to: this.swipeEndPoint, age: 0 }
      : this.releasedSwipe;
    if (!line || Math.hypot(line.to.x - line.from.x, line.to.y - line.from.y) < 2) return;
    const alpha = Math.round(255 * Math.max(0, 1 - line.age / SWIPE_TRAIL_SECONDS));
    graphics.lineWidth = 4.5;
    graphics.strokeColor = new Color(247, 167, 29, alpha);
    graphics.moveTo(line.from.x, line.from.y);
    graphics.lineTo(line.to.x, line.to.y);
    graphics.stroke();
    graphics.lineWidth = 1.6;
    graphics.strokeColor = new Color(255, 216, 88, alpha);
    graphics.moveTo(line.from.x, line.from.y);
    graphics.lineTo(line.to.x, line.to.y);
    graphics.stroke();
  }

  private clearSwipe(): void {
    this.activeTouchId = null;
    this.swipeStartPoint = null;
    this.swipeEndPoint = null;
    this.releasedSwipe = null;
    if (this.swipeTrail?.isValid) this.swipeTrail.clear();
  }

  private fitGameplay(): void {
    if (this.disposed) return;
    this.clearSwipe();
    const visible = view.getVisibleSize();
    const groundY = -visible.height * BACKGROUND_GROUND_RATIO;
    const bottleTransform = this.bottle?.getComponent(UITransform);
    const pigTransform = this.pig?.getComponent(UITransform);
    const mouthTransform = this.bottleMouth?.getComponent(UITransform);
    const interiorTransform = this.bottleInterior?.getComponent(UITransform);
    if (bottleTransform) {
      this.bottle.setPosition(this.bottle.position.x, groundY + bottleTransform.height * this.bottle.scale.y / 2, 0);
    }
    if (pigTransform) {
      this.pig.setPosition(this.pig.position.x, groundY + 14 + pigTransform.height * this.pig.scale.y / 2, 0);
    }
    const surfaceTransform = this.surface?.getComponent(UITransform);
    if (surfaceTransform) {
      surfaceTransform.setContentSize(visible.width, visible.height);
      this.surface.setPosition(0, 0, 0);
    }
    if (bottleTransform && mouthTransform && interiorTransform) {
      this.round.setArena({
        halfWidth: visible.width / 2,
        floorY: RULES_ORIGIN_Y - groundY,
        mouthX: this.bottle.position.x + this.bottleMouth.position.x * this.bottle.scale.x,
        mouthY: RULES_ORIGIN_Y - this.bottle.position.y - this.bottleMouth.position.y * this.bottle.scale.y,
        mouthHalfWidth: mouthTransform.width * Math.abs(this.bottle.scale.x) / 2,
        flightMinY: RULES_ORIGIN_Y - visible.height / 2 + 520,
        flightMaxY: RULES_ORIGIN_Y - visible.height / 2 + 600,
        bodyCenterX: this.bottle.position.x + this.bottleInterior.position.x * this.bottle.scale.x,
        bodyCenterY: RULES_ORIGIN_Y - this.bottle.position.y - this.bottleInterior.position.y * this.bottle.scale.y,
        bodyHalfWidth: interiorTransform.width * Math.abs(this.bottle.scale.x) / 2,
        bodyHalfHeight: interiorTransform.height * Math.abs(this.bottle.scale.y) / 2,
      });
    }
  }

  protected update(deltaTime: number): void {
    if (this.disposed) return;
    const dt = Math.min(.1, Math.max(0, Number.isFinite(deltaTime) ? deltaTime : 0));
    if (this.releasedSwipe) {
      this.releasedSwipe.age += dt;
      if (this.releasedSwipe.age >= SWIPE_TRAIL_SECONDS) this.releasedSwipe = null;
      this.drawSwipeTrail();
    }
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
    if (this.round.phase !== this.lastPhase) {
      this.lastPhase = this.round.phase;
      if (this.round.phase === 'success' || this.round.phase === 'failure') this.showResult();
    }
    this.render();
  }

  private render(): void {
    if (this.foodLabel) this.foodLabel.string = `食物\n${this.round.food}/5`;
    if (this.chanceLabel) this.chanceLabel.string = `剩余机会\n${this.round.chances}/${this.round.maxChances}`;
    for (let index = 0; index < this.targetPool.length; index += 1) {
      const node = this.targetPool[index];
      const target = this.round.targets[index];
      node.active = !!target;
      if (!target) continue;
      node.setPosition(target.x, RULES_ORIGIN_Y - target.y, 0);
      const helicopter = node.getChildByName('Helicopter');
      const rope = node.getChildByName('Rope');
      const vegetable = node.getChildByName('Vegetable');
      const falling = target.state === 'falling';
      const direction = target.vx < 0 ? -1 : 1;
      if (helicopter) {
        helicopter.active = !falling;
        helicopter.setPosition(-39 * direction, 114, 0);
        helicopter.setScale(direction, 1, 1);
      }
      if (rope) rope.active = !falling;
      if (vegetable) {
        vegetable.active = true;
        vegetable.setPosition(0, 0, 0);
        vegetable.setScale(direction, 1, 1);
      }
      node.setScale(1, 1, 1);
    }
    for (let index = 0; index < this.departingPool.length; index += 1) {
      const node = this.departingPool[index];
      const helicopter = this.round.departingHelicopters[index];
      node.active = !!helicopter;
      if (!helicopter) continue;
      const direction = helicopter.vx < 0 ? -1 : 1;
      node.setPosition(helicopter.x - 39 * direction, RULES_ORIGIN_Y - helicopter.y + 114, 0);
      node.setScale(direction, 1, 1);
      node.angle = direction * 5 * Math.min(1, helicopter.age / .2);
    }
    for (let index = 0; index < this.collectedPool.length; index += 1) {
      const node = this.collectedPool[index];
      const food = this.round.collectedFood[index];
      node.active = !!food;
      if (!food) continue;
      node.setPosition(food.x, RULES_ORIGIN_Y - food.y, 0);
      node.setScale(food.direction, 1, 1);
      node.angle = food.angle;
    }
    this.refreshActions();
  }

  private refreshActions(): void {
    const ready = !this.paused();
    this.backButton && (this.backButton.interactable = ready && !this.resultOverlay?.active);
    const playing = ready && this.round.phase === 'playing';
    if (this.slowdownButton) this.slowdownButton.interactable = playing && this.round.slowRemaining <= 0;
    for (const button of [this.reviveButton, this.replayButton, this.homeButton]) if (button) button.interactable = !this.adInFlight && !this.leaving;
    if (this.reviveButton) this.reviveButton.node.active = this.round.phase === 'failure';
  }

  private async reward(kind: 'slowdown' | 'revive'): Promise<void> {
    this.activateTouch();
    if (this.adInFlight || this.disposed || this.leaving) return;
    if (kind === 'slowdown' && (this.blocked() || this.round.phase !== 'playing' || this.round.slowRemaining > 0)) return;
    if (kind === 'revive' && this.round.phase !== 'failure') return;
    const token = ++this.serial;
    this.clearSwipe();
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
      if (kind === 'slowdown') {
        this.round.slowDown(this.slowdownSeconds);
      } else if (kind === 'revive') {
        this.round.revive();
        if (this.resultOverlay) this.resultOverlay.active = false;
        if (this.hud) this.hud.active = true;
      }
    }
    this.syncAudio(true);
    this.render();
  }

  private slowdown = (): void => { void this.reward('slowdown'); };
  private revive = (): void => { void this.reward('revive'); };

  private showResult(): void {
    this.clearSwipe();
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
    this.clearSwipe();
    this.round = new AirdropRescueRound();
    this.fitGameplay();
    this.round.start();
    this.lastPhase = this.round.phase;
    this.exitPaused = false;
    if (this.exitOverlay) this.exitOverlay.active = false;
    if (this.resultOverlay) this.resultOverlay.active = false;
    if (this.hud) this.hud.active = true;
    this.render();
  };

  private requestExit = (): void => {
    this.activateTouch();
    if (this.blocked() || this.resultOverlay?.active) return;
    this.clearSwipe();
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

  private onHide = (): void => { this.hidden = true; this.clearSwipe(); this.syncAudio(); };
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
    if (this.surface?.isValid) {
      this.surface.off(Node.EventType.TOUCH_START, this.onTouchStart, this);
      this.surface.off(Node.EventType.TOUCH_MOVE, this.onTouchMove, this);
      this.surface.off(Node.EventType.TOUCH_END, this.onTouchEnd, this);
      this.surface.off(Node.EventType.TOUCH_CANCEL, this.onTouchCancel, this);
    }
    for (const [button, callback] of this.actions()) if (button?.node?.isValid) button.node.off(Button.EventType.CLICK, callback, this);
    game.off(Game.EVENT_HIDE, this.onHide, this);
    game.off(Game.EVENT_SHOW, this.onShow, this);
    view.off('canvas-resize', this.fitGameplay, this);
    FeedAcquisitionService.removeListener(this.feedChanged);
    if (this.feed) {
      adc.cancelFeedEntryInterstitial();
      FeedAcquisitionService.completeSession();
    }
  }
}
