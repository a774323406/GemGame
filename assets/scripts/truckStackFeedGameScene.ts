import { _decorator, AudioSource, Button, Color, Component, Game, game, Graphics, Label, Node, ResolutionPolicy, sys, view } from 'cc';
import { BOX_HEIGHT, TruckStackRound } from './truckStackRules';
import { FeedAcquisitionService, FeedAcquisitionState } from './framework/Platform/FeedAcquisitionService';
import { adc } from './framework/Platform/ADController';
import { SdkUtils } from './framework/Platform/sdk/SdkUtils';
import { GameSceneBundle, GameSceneName } from './framework/GameSceneBundle';
import AudioManager from './framework/AudioManager';
import { soundName } from './gamePrefabMgr';

const { ccclass, property } = _decorator;
const BEST_KEY = 'truckStackBest';
const RIG_TOP = -30;
type Dust = { x: number; y: number; vx: number; vy: number; age: number };

@ccclass('truckStackFeedGameScene')
export class truckStackFeedGameScene extends Component {
  @property(Node) surface: Node = null;
  @property(Node) hud: Node = null;
  @property(Node) truck: Node = null;
  @property(Node) heldBox: Node = null;
  @property([Node]) boxNodes: Node[] = [];
  @property([Node]) clouds: Node[] = [];
  @property(Graphics) scenery: Graphics = null;
  @property(Graphics) rope: Graphics = null;
  @property(Graphics) effects: Graphics = null;
  @property(Label) heightLabel: Label = null;
  @property(Label) bestLabel: Label = null;
  @property(Label) hintLabel: Label = null;
  @property(Label) slowdownLabel: Label = null;
  @property(Button) backButton: Button = null;
  @property(Button) slowdownButton: Button = null;
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
  @property(AudioSource) dropAudio: AudioSource = null;
  @property(AudioSource) landAudio: AudioSource = null;
  @property(AudioSource) perfectAudio: AudioSource = null;
  @property(AudioSource) fallAudio: AudioSource = null;

  round = new TruckStackRound();
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
  private best = 1;
  private clock = 0;
  private cameraY = 0;
  private landAge = 1;
  private noticeTime = 0;
  private lastSlowSecond = -1;
  private dust: Dust[] = [];
  private slowdownAction = (): void => { void this.slowdown(); };
  private reviveAction = (): void => { void this.revive(); };

  protected onLoad(): void {
    view.setDesignResolutionSize(750, 1624, ResolutionPolicy.FIXED_WIDTH);
    FeedAcquisitionService.init();
    this.feed = FeedAcquisitionService.isActive();
    const state = FeedAcquisitionService.getState();
    this.entered = !this.feed || state.entered;
    this.exited = this.feed && state.exited;
    try {
      const saved = Number(sys.localStorage.getItem(BEST_KEY));
      if (Number.isFinite(saved) && saved >= 1) this.best = Math.floor(saved);
    } catch { /* Storage may be unavailable in a feed preload. */ }
    this.replay();
    FeedAcquisitionService.addListener(this.feedChanged);
    this.surface.on(Node.EventType.TOUCH_START, this.onTouchStart, this);
    for (const [button, callback] of this.actions()) button.node.on(Button.EventType.CLICK, callback, this);
    game.on(Game.EVENT_HIDE, this.onHide, this);
    game.on(Game.EVENT_SHOW, this.onShow, this);
  }

  protected start(): void {
    adc.onEnterGame(this.node);
    if (this.feed) {
      // 7001 must not wait for feedEnter: the host needs a rendered card first.
      void FeedAcquisitionService.reportSceneReadyAfterStableRender({
        owner: this.node, requiredVisibleNodes: [this.surface, this.truck, this.heldBox],
        stableFrameCount: 3, surfaceDelayMs: 180,
        isReady: () => !this.disposed && !this.leaving,
      });
    }
    this.scheduleAd();
    this.syncAudio();
  }

  private actions(): [Button, Function][] {
    return [[this.backButton, this.requestExit], [this.slowdownButton, this.slowdownAction],
      [this.reviveButton, this.reviveAction], [this.replayButton, this.restart], [this.homeButton, this.home],
      [this.continueButton, this.cancelExit], [this.restartButton, this.restart], [this.exitButton, this.home]];
  }

  private feedChanged = (state: FeedAcquisitionState): void => {
    if (!this.feed || this.disposed) return;
    this.entered = state.entered;
    this.exited = state.exited;
    if (!this.entered || this.exited) {
      adc.cancelFeedEntryInterstitial();
      this.adScheduled = false;
      if (this.exited) {
        this.serial++;
        this.adInFlight = false;
        this.stopEffects();
      }
    } else this.scheduleAd();
    this.refreshActions();
    this.syncAudio(this.entered && !this.exited);
  };

  private scheduleAd(): void {
    if (!this.feed || !this.entered || this.exited || this.adScheduled) return;
    this.adScheduled = true;
    adc.scheduleFeedEntryInterstitial(() => !this.disposed && !this.leaving && this.entered && !this.exited);
  }

  private paused(): boolean {
    // Only rewarded video pauses; never use isFullscreenAdBusy for gameplay.
    return this.disposed || this.hidden || this.leaving || this.exitPaused ||
      this.adInFlight || SdkUtils.isRewardedVideoBusy();
  }

  private blocked(): boolean { return this.paused() || (this.feed && (!this.entered || this.exited)); }

  private activateTouch(): void {
    if (!this.disposed && !this.leaving && this.feed && !this.entered) FeedAcquisitionService.activateFromFirstTouch();
  }

  private onTouchStart(): void {
    this.activateTouch();
    if (this.blocked() || this.resultOverlay.active) return;
    this.syncAudio(true);
    if (this.round.drop()) {
      this.playEffect(this.dropAudio, .3);
      this.setNotice('');
      this.refreshActions();
    }
  }

  private syncAudio(recoverNative = false): void {
    if (this.paused()) {
      this.stopEffects();
      AudioManager.pauseBgmForVideo();
    } else {
      AudioManager.setSoundEvent();
      if (recoverNative) AudioManager.restartMusic(soundName.getUserBgm);
      else AudioManager.playMusic(soundName.getUserBgm);
    }
  }

  private onHide(): void { this.hidden = true; this.syncAudio(); }
  private onShow(): void { this.hidden = false; this.syncAudio(true); this.refreshActions(); }

  protected update(dt: number): void {
    if (this.paused()) return;
    const step = Math.min(.1, Math.max(0, Number.isFinite(dt) ? dt : 0));
    this.clock += step;
    const phase = this.round.phase;
    if (this.blocked()) this.round.tickPreview(step);
    else this.round.tick(step);

    for (const event of this.round.drainEvents()) {
      if (event.kind === 'land') {
        this.landAge = 0;
        this.burst(event.x, event.y);
        this.playEffect(this.landAudio, .65);
        this.updateScore();
      } else if (event.kind === 'perfect') {
        this.setNotice('稳稳当当！', .85);
        this.playEffect(this.perfectAudio, .4);
        SdkUtils.vibrateShort();
      } else if (event.kind === 'failure') {
        this.playEffect(this.fallAudio, .6);
        this.showResult();
      }
    }

    this.landAge += step;
    if (this.noticeTime > 0) {
      this.noticeTime = Math.max(0, this.noticeTime - step);
      if (this.noticeTime === 0) this.refreshHint();
    }
    for (const p of this.dust) {
      p.age += step; p.x += p.vx * step; p.y += p.vy * step; p.vy -= 260 * step;
    }
    this.dust = this.dust.filter(p => p.age < .32);
    const slowSecond = Math.ceil(this.round.slowRemaining);
    if (slowSecond !== this.lastSlowSecond || phase !== this.round.phase) this.refreshActions();
    this.render(step);
  }

  private updateScore(): void {
    const height = this.round.height;
    if (height > this.best) {
      this.best = height;
      try { sys.localStorage.setItem(BEST_KEY, String(this.best)); } catch { /* Keep the in-memory record. */ }
    }
    this.heightLabel.string = `${height} 米`;
    this.bestLabel.string = `最高 ${this.best} 米`;
  }

  private refreshHint(): void {
    // Keep the swing area clear; this label is reserved for brief feedback/errors.
    this.hintLabel.string = '';
  }

  private setNotice(text: string, seconds = 0): void {
    this.noticeTime = seconds;
    if (text) this.hintLabel.string = text;
    else this.refreshHint();
  }

  private refreshActions(): void {
    this.lastSlowSecond = Math.ceil(this.round.slowRemaining);
    const ready = !this.paused();
    this.slowdownButton.interactable = ready && this.round.phase === 'swinging' && this.lastSlowSecond === 0;
    this.slowdownLabel.string = this.lastSlowSecond > 0 ? '减速中' : '减速';
    for (const b of [this.reviveButton, this.replayButton, this.homeButton]) b.interactable = !this.adInFlight && !this.leaving;
    this.backButton.interactable = ready;
  }

  private burst(x: number, y: number): void {
    for (let i = 0; i < 8; i++) this.dust.push({x: x + (i < 4 ? -1 : 1) * 116,
      y, vx: (i < 4 ? -1 : 1) * (35 + i % 4 * 22), vy: 45 + i % 3 * 20, age: 0});
    if (this.dust.length > 32) this.dust.splice(0, this.dust.length - 32);
  }

  private playfieldLayout(): {height: number; scale: number; deckY: number; rigLift: number} {
    const height = view.getVisibleSize().height;
    const scale = Math.min(1, Math.max(.6, (height - 590) / 942));
    const deckY = -height / 2 + 230 + 183 * .9 * scale;
    // Lift the box with its rig; the attachment begins beyond the screen's top edge.
    const rigLift = (height / 2 - RIG_TOP - deckY) / scale - BOX_HEIGHT;
    return {height, scale, deckY, rigLift};
  }

  private render(dt = 0): void {
    const {height: h, scale, deckY} = this.playfieldLayout();
    const truckScale = .9;
    const top = this.round.boxes[this.round.boxes.length - 1];
    const targetCamera = this.round.pivot.y - (h / 2 - RIG_TOP - deckY) / scale;
    this.cameraY += (targetCamera - this.cameraY) * Math.min(1, dt * 10);
    // Ease upward during the impact, when no cord is visible. Clamp only the
    // suspended pose so a resize/new spawn cannot bring its anchor back on screen.
    const camera = this.round.phase === 'swinging'
      ? Math.max(this.cameraY, this.round.pivot.y - (h / 2 - (RIG_TOP - 10) - deckY) / scale)
      : this.cameraY;
    const impact = this.landAge < .24 ? Math.sin(this.landAge * 65) * (1 - this.landAge / .24) * 2 : 0;
    const sx = (x: number) => x * scale;
    const sy = (y: number) => deckY + (y - camera) * scale + impact;

    const scenery = this.scenery;
    scenery.clear();
    const road = sy(-183 * truckScale);
    if (road > -h / 2) {
      scenery.fillColor = new Color(121, 132, 138);
      scenery.rect(-400, -h / 2, 800, Math.max(0, road + h / 2)); scenery.fill();
      scenery.strokeColor = new Color(52, 54, 46); scenery.lineWidth = 3;
      scenery.moveTo(-400, road); scenery.lineTo(400, road); scenery.stroke();
      scenery.fillColor = new Color(230, 230, 187);
      for (let x = -360; x < 400; x += 118) {scenery.rect(x, road - 42, 49, 4); scenery.fill();}
      for (const x of [-347, 332]) {
        scenery.fillColor = new Color(158, 181, 105);
        scenery.moveTo(x - 18, road); scenery.lineTo(x - 11, road + 12);
        scenery.lineTo(x - 4, road + 5); scenery.lineTo(x, road + 20);
        scenery.lineTo(x + 8, road + 9); scenery.lineTo(x + 17, road);
        scenery.close(); scenery.fill(); scenery.stroke();
      }
    }

    this.truck.active = sy(45) > -h / 2 - 230;
    this.truck.setScale(scale * truckScale, scale * truckScale, 1);
    this.truck.setPosition(sx(80 * truckScale), sy(-69 * truckScale), 0);
    for (let i = 0; i < this.clouds.length; i++) {
      const cloud = this.clouds[i];
      const x = ((i * 285 + this.clock * (3 + i) + 730) % 980) - 490;
      const y = h / 2 - 420 - i * 240 - (camera * scale * .15 % 120);
      cloud.setPosition(x, y, 0);
      cloud.setScale(.7 + i * .13, .7 + i * .13, 1);
    }

    for (let i = 0; i < this.boxNodes.length; i++) {
      const box = this.round.boxes[i], n = this.boxNodes[i];
      n.active = !!box && sy(box.y) > -h / 2 - BOX_HEIGHT;
      if (!box) continue;
      const squash = box === top && this.landAge < .18 ? Math.sin(this.landAge / .18 * Math.PI) * .055 : 0;
      n.setPosition(sx(box.x), sy(box.y) - BOX_HEIGHT * squash * scale / 2, 0);
      n.setScale(scale * (1 + squash / 2), scale * (1 - squash), 1);
      n.angle = box.angle;
    }

    const active = this.round.activeBox;
    this.heldBox.active = !!active;
    if (active) {
      this.heldBox.setPosition(sx(active.x), sy(active.y), 0);
      this.heldBox.setScale(scale, scale, 1);
      this.heldBox.angle = active.angle;
    }
    const rope = this.rope;
    rope.clear();
    if (active && this.round.phase === 'swinging') {
      const tilt = active.angle * Math.PI / 180;
      rope.strokeColor = new Color(40, 41, 32); rope.lineWidth = 3.5 * scale;
      rope.moveTo(sx(this.round.pivot.x), sy(this.round.pivot.y));
      rope.lineTo(sx(active.x - Math.sin(tilt) * BOX_HEIGHT / 2), sy(active.y + Math.cos(tilt) * BOX_HEIGHT / 2)); rope.stroke();
    }
    const effects = this.effects;
    effects.clear();
    for (const p of this.dust) {
      effects.fillColor = new Color(208, 178, 133, Math.round(190 * (1 - p.age / .32)));
      effects.circle(sx(p.x), sy(p.y), (4 + p.age * 14) * scale); effects.fill();
    }
  }

  private showResult(): void {
    this.updateScore();
    this.hud.active = false;
    this.resultTitle.string = '挑战失败';
    this.resultDetail.string = `纸箱没放稳，再挑战一次！\n本次高度 ${this.round.height} 米\n最高纪录 ${this.best} 米`;
    this.resultOverlay.active = true;
    adc.onLevelResult(this.round.height, 'fail');
    this.refreshActions();
  }

  private replay(): void {
    if (this.disposed || this.leaving || this.adInFlight) return;
    this.serial++;
    const layout = this.playfieldLayout();
    this.round = new TruckStackRound(layout.rigLift);
    // The rules cap drop height for playability; frame that rig above the screen from the first draw.
    this.cameraY = this.round.rigLift - layout.rigLift;
    this.landAge = 1; this.dust = [];
    this.exitPaused = false; this.exitOverlay.active = false;
    this.resultOverlay.active = false; this.hud.active = true;
    this.stopEffects(); this.updateScore(); this.setNotice(''); this.refreshActions(); this.render();
  }

  private async slowdown(): Promise<void> {
    this.activateTouch();
    if (this.blocked() || this.round.phase !== 'swinging' || this.round.slowRemaining > 0) return;
    await this.reward('slowdown');
  }

  private async revive(): Promise<void> {
    this.activateTouch();
    if (this.blocked() || this.round.phase !== 'failure') return;
    await this.reward('revive');
  }

  private async reward(kind: 'slowdown' | 'revive'): Promise<void> {
    const token = ++this.serial;
    this.adInFlight = true; this.syncAudio(); this.refreshActions();
    let success = false;
    try { success = await SdkUtils.showRewardedVideo(); }
    catch (error) { console.warn('[TruckStack] rewarded video failed', error); }
    if (this.disposed || this.leaving || token !== this.serial || !this.node?.isValid) return;
    this.adInFlight = false;
    if (success) {
      if (kind === 'slowdown') {this.round.slowDown(20); this.setNotice('摆速降低，瞄准再放！', 1.4);}
      else if (this.round.revive()) {
        this.resultOverlay.active = false; this.hud.active = true;
        this.dust = []; this.landAge = 1; this.setNotice('');
      }
    } else if (kind === 'revive') this.resultDetail.string = `本次高度 ${this.round.height} 米\n完整看完广告才能复活\n也可以重新挑战`;
    else this.setNotice('广告未完成，可以稍后再试', 2);
    this.syncAudio(); this.refreshActions(); this.render();
  }

  private requestExit(): void {
    this.activateTouch();
    if (this.paused() || this.resultOverlay.active) return;
    this.exitPaused = true; this.hud.active = false; this.exitOverlay.active = true; this.syncAudio();
  }
  private cancelExit(): void {
    this.exitPaused = false; this.exitOverlay.active = false; this.hud.active = true; this.syncAudio(); this.refreshActions();
  }
  private restart(): void {this.replay(); this.syncAudio();}
  private async home(): Promise<void> {
    if (this.leaving || this.adInFlight || this.disposed) return;
    this.leaving = true; this.serial++; this.syncAudio(); this.refreshActions();
    try { await GameSceneBundle.loadScene(GameSceneName.Main); }
    catch (error) {
      this.leaving = false; this.syncAudio(); this.refreshActions();
      console.warn('[TruckStack] return failed', error);
    }
  }
  private playEffect(source: AudioSource, volume: number): void {
    if (!source?.isValid || this.paused() || !AudioManager.canPlaySound()) return;
    source.stop(); source.volume = volume; source.play();
  }
  private stopEffects(): void {
    for (const source of [this.dropAudio, this.landAudio, this.perfectAudio, this.fallAudio]) if (source?.isValid) source.stop();
  }
  protected onDestroy(): void {
    this.disposed = true; this.serial++; this.stopEffects();
    if (this.surface?.isValid) this.surface.off(Node.EventType.TOUCH_START, this.onTouchStart, this);
    for (const [button, callback] of this.actions()) if (button?.node?.isValid) button.node.off(Button.EventType.CLICK, callback, this);
    game.off(Game.EVENT_HIDE, this.onHide, this); game.off(Game.EVENT_SHOW, this.onShow, this);
    FeedAcquisitionService.removeListener(this.feedChanged);
    if (this.feed) {adc.cancelFeedEntryInterstitial(); FeedAcquisitionService.completeSession();}
  }
}
