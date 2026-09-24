import {
  _decorator, Button, Color, Component, EventTouch, game, Game, Graphics,
  input, Input, Label, Node, ResolutionPolicy, sys, tween, Tween, UITransform, Vec3, view,
} from 'cc';
import AudioManager from './framework/AudioManager';
import { soundName } from './gamePrefabMgr';
import { GameSceneBundle, GameSceneName } from './framework/GameSceneBundle';
import { FeedAcquisitionService, FeedAcquisitionState } from './framework/Platform/FeedAcquisitionService';
import { adc } from './framework/Platform/ADController';
import { SdkUtils } from './framework/Platform/sdk/SdkUtils';
import { EXAM_AD_SECONDS, EXAM_TARGET, MathExamRound } from './mathExamRules';
import { InkPoint, InkStroke, recognizeHandwriting } from './handwrittenDigits';
import { eraseInkAlongPath } from './inkEraser';

const { ccclass, property } = _decorator;
type Phase = 'preview' | 'playing' | 'scrolling' | 'result' | 'leaving';
const RED = new Color(228, 0, 22);
const DARK = new Color(46, 47, 43);
const MUTED = new Color(136, 130, 114);
const BEST_KEY = 'math-exam-best-v1';
const WRITE_HINT = '手指写数字，停笔自动判题';

@ccclass('mathExamFeedGameScene')
export class mathExamFeedGameScene extends Component {
  @property(Node) layoutRoot: Node = null;
  @property(Node) paper: Node = null;
  @property(Node) questionRoot: Node = null;
  @property(Node) inkArea: Node = null;
  @property(Graphics) ink: Graphics = null;
  @property(Graphics) clock: Graphics = null;
  @property(Label) inkHint: Label = null;
  @property([Label]) questionLabels: Label[] = [];
  @property(Label) scoreLabel: Label = null;
  @property(Label) timeLabel: Label = null;
  @property(Label) hintLabel: Label = null;
  @property(Label) feedbackLabel: Label = null;
  @property(Node) correctionBottle: Node = null;
  @property(Node) eraserTip: Node = null;
  @property(Button) backButton: Button = null;
  @property(Node) resultOverlay: Node = null;
  @property(Node) resultPanel: Node = null;
  @property(Label) resultTitle: Label = null;
  @property(Label) resultScore: Label = null;
  @property(Label) resultDetail: Label = null;
  @property(Label) bestLabel: Label = null;
  @property(Button) replayButton: Button = null;
  @property(Button) homeButton: Button = null;
  @property(Button) addTimeButton: Button = null;
  @property(Button) reviveButton: Button = null;

  private round = new MathExamRound();
  private phase: Phase = 'preview';
  private strokes: InkStroke[] = [];
  private pointerId: number | null = null;
  private eraserPointerId: number | null = null;
  private bottleHome = new Vec3();
  private bottleGrabOffset = new Vec3();
  private previousEraserPoint: InkPoint | null = null;
  private penIdle = -1;
  private serial = 0;
  private displayedSecond = -1;
  private appHidden = false;
  private feedMode = false;
  private feedEntered = false;
  private feedExited = false;
  private feedScheduled = false;
  private sessionFinished = false;
  private wasPaused = false;
  private adInFlight = false;

  protected onLoad(): void {
    view.setDesignResolutionSize(750, 1624, ResolutionPolicy.FIXED_WIDTH);
    this.validateBindings();
    const home = this.correctionBottle.position;
    this.bottleHome = new Vec3(home.x, home.y, home.z);
    this.fitLayout();
    view.on('canvas-resize', this.fitLayout, this);
    adc.cancelFeedEntryInterstitial();
    FeedAcquisitionService.init();
    const state = FeedAcquisitionService.getState();
    this.feedMode = FeedAcquisitionService.isActive();
    this.feedEntered = !this.feedMode || (state.entered && !state.exited);
    this.feedExited = this.feedMode && state.exited;
    this.inkArea.on(Node.EventType.TOUCH_START, this.onPenStart, this);
    this.inkArea.on(Node.EventType.TOUCH_MOVE, this.onPenMove, this);
    this.inkArea.on(Node.EventType.TOUCH_END, this.onPenEnd, this);
    this.inkArea.on(Node.EventType.TOUCH_CANCEL, this.onPenCancel, this);
    this.correctionBottle.on(Node.EventType.TOUCH_START, this.onEraserStart, this);
    this.correctionBottle.on(Node.EventType.TOUCH_MOVE, this.onEraserMove, this);
    this.correctionBottle.on(Node.EventType.TOUCH_END, this.onEraserEnd, this);
    this.correctionBottle.on(Node.EventType.TOUCH_CANCEL, this.onEraserCancel, this);
    this.backButton.node.on(Button.EventType.CLICK, this.returnToMain, this);
    this.replayButton.node.on(Button.EventType.CLICK, this.onReplay, this);
    this.homeButton.node.on(Button.EventType.CLICK, this.returnToMain, this);
    this.addTimeButton.node.on(Button.EventType.CLICK, this.onAddTime, this);
    this.reviveButton.node.on(Button.EventType.CLICK, this.onRevive, this);
    game.on(Game.EVENT_HIDE, this.onGameHide, this);
    game.on(Game.EVENT_SHOW, this.onGameShow, this);
    input.on(Input.EventType.TOUCH_START, this.onFirstTouch, this);
    FeedAcquisitionService.addListener(this.onFeedStateChanged);
    this.resetRound(this.feedEntered && !this.feedExited);
  }

  protected start(): void {
    AudioManager.setSoundEvent();
    if (!this.feedMode || this.feedEntered) AudioManager.playMusic(soundName.getUserBgm);
    if (this.feedMode) {
      void FeedAcquisitionService.reportSceneReadyAfterStableRender({
        owner: this.node, requiredVisibleNodes: [this.paper, this.inkArea],
        stableFrameCount: 3, surfaceDelayMs: 180,
        isReady: () => this.phase !== 'leaving' && !this.feedExited,
      });
      if (this.feedEntered) this.scheduleFeedAd();
    }
  }

  protected update(dt: number): void {
    const paused = this.isPaused();
    if (paused) {
      if (!this.wasPaused) { this.cancelCurrentStroke(); this.stopEraserDrag(); }
      this.wasPaused = true;
      return;
    }
    if (this.wasPaused && this.phase !== 'leaving') AudioManager.playMusic(soundName.getUserBgm);
    this.wasPaused = false;
    if (this.phase !== 'playing' && this.phase !== 'scrolling') return;
    this.round.tick(dt);
    this.refreshTimer();
    if (this.round.remaining <= 0) { this.finishRound(); return; }
    if (this.phase === 'playing' && this.pointerId === null && this.eraserPointerId === null && this.penIdle >= 0) {
      this.penIdle += dt;
      if (this.penIdle >= 1) { this.penIdle = -1; this.recognizeAnswer(); }
    }
  }

  private validateBindings(): void {
    for (const key of ['layoutRoot', 'paper', 'questionRoot', 'inkArea', 'ink', 'inkHint', 'scoreLabel', 'timeLabel', 'hintLabel', 'feedbackLabel', 'correctionBottle', 'eraserTip', 'backButton', 'resultOverlay', 'resultPanel', 'resultTitle', 'resultScore', 'resultDetail', 'bestLabel', 'replayButton', 'homeButton', 'addTimeButton', 'reviveButton']) {
      if (!this[key]) throw new Error(`[mathExamFeedGameScene] Missing scene binding: ${key}`);
    }
    if (this.questionLabels.length !== 4 || this.questionLabels.some(v => !v)) throw new Error('[mathExamFeedGameScene] Four question labels are required');
  }

  private fitLayout = (): void => {
    this.stopEraserDrag();
    const visible = view.getVisibleSize();
    const scale = Math.min(visible.width / 592, visible.height / 1280);
    this.layoutRoot.setScale(scale, scale, 1);
    const resultScale = Math.min(1, (visible.width - 64) / 610, (visible.height - 120) / 900);
    this.resultPanel.setScale(resultScale, resultScale, 1);
  };

  private isPaused(): boolean {
    return this.appHidden || this.adInFlight || SdkUtils.isFullscreenAdBusy() || (this.feedMode && (!this.feedEntered || this.feedExited));
  }

  private canWrite(): boolean { return this.phase === 'playing' && !this.isPaused(); }

  private resetRound(playing: boolean): void {
    this.stopEraserDrag();
    this.serial++;
    Tween.stopAllByTarget(this.questionRoot);
    Tween.stopAllByTarget(this.feedbackLabel.node);
    this.questionRoot.setPosition(0, 0, 0);
    this.feedbackLabel.node.setScale(1, 1, 1);
    this.feedbackLabel.string = '';
    this.round.reset();
    this.phase = playing ? 'playing' : 'preview';
    this.resultOverlay.active = false;
    this.displayedSecond = -1;
    this.clearInk();
    this.refreshQuestions();
    this.refreshScore();
    this.refreshTimer();
    this.refreshRewardButtons();
  }

  private refreshQuestions(): void {
    this.questionLabels.forEach((label, index) => {
      const q = this.round.questions[index];
      label.string = `${q.a}${q.operator}${q.b}=`;
    });
  }

  private refreshScore(): void { this.scoreLabel.string = this.round.score ? String(this.round.score) : ''; }

  private refreshTimer(): void {
    const second = Math.ceil(this.round.remaining);
    if (this.displayedSecond === second) return;
    this.displayedSecond = second;
    this.timeLabel.string = `${second} 秒`;
    this.timeLabel.color = second <= 10 ? RED : DARK;
    if (this.clock) {
      // Reference clock: fixed red warning sector, clockwise sweep over one minute.
      const g = this.clock;
      g.clear();
      g.fillColor = new Color(237, 126, 126);
      g.moveTo(0, 0);
      for (let i = 0; i <= 12; i++) {
        const angle = (90 + i * 5) * Math.PI / 180;
        g.lineTo(Math.cos(angle) * 26, Math.sin(angle) * 26);
      }
      g.close(); g.fill();
      const angle = (90 - (60 - second) * 6) * Math.PI / 180;
      g.strokeColor = new Color(17, 20, 19); g.lineWidth = 2.5;
      g.moveTo(0, 0); g.lineTo(Math.cos(angle) * 23, Math.sin(angle) * 23); g.stroke();
      g.fillColor = new Color(17, 20, 19); g.circle(0, 0, 4.5); g.fill();
    }
  }

  private localPoint(event: EventTouch): InkPoint | null {
    const ui = event.getUILocation();
    const transform = this.inkArea.getComponent(UITransform);
    const p = transform.convertToNodeSpaceAR(new Vec3(ui.x, ui.y, 0));
    if (Math.abs(p.x) > transform.width / 2 - 4 || Math.abs(p.y) > transform.height / 2 - 4) return null;
    return { x: p.x, y: -p.y };
  }

  private onPenStart = (event: EventTouch): void => {
    this.onFirstTouch();
    if (!this.canWrite() || this.pointerId !== null || this.eraserPointerId !== null) return;
    const point = this.localPoint(event);
    if (!point) return;
    if (this.strokes.reduce((count, stroke) => count + stroke.length, 0) >= 4000) {
      this.hintLabel.node.active = true;
      this.hintLabel.string = '笔画有点多，擦除后再写一次'; return;
    }
    this.pointerId = event.getID();
    this.penIdle = -1;
    this.strokes.push([point]);
    this.inkHint.node.active = false;
    this.hintLabel.string = '正在书写…';
    this.hintLabel.color = MUTED;
    this.ink.circle(point.x, -point.y, 3.5); this.ink.fill();
    event.propagationStopped = true;
  };

  private onPenMove = (event: EventTouch): void => {
    if (this.pointerId !== event.getID()) return;
    if (!this.canWrite()) { this.cancelCurrentStroke(); return; }
    const point = this.localPoint(event);
    if (!point) { this.endCurrentStroke(); return; }
    const stroke = this.strokes[this.strokes.length - 1];
    const previous = stroke[stroke.length - 1];
    if (stroke.length >= 160 || Math.hypot(point.x - previous.x, point.y - previous.y) < 2) return;
    stroke.push(point);
    this.ink.moveTo(previous.x, -previous.y);
    this.ink.lineTo(point.x, -point.y);
    this.ink.stroke();
    event.propagationStopped = true;
  };

  private onPenEnd = (event: EventTouch): void => {
    if (this.pointerId !== event.getID()) return;
    this.onPenMove(event);
    this.endCurrentStroke();
  };

  private onPenCancel = (event: EventTouch): void => {
    if (this.pointerId === event.getID()) this.cancelCurrentStroke();
  };

  private endCurrentStroke(): void {
    if (this.pointerId === null) return;
    this.pointerId = null;
    this.penIdle = 0;
    this.hintLabel.string = '写完稍等一下，正在识别';
  }

  private cancelCurrentStroke(): void {
    if (this.pointerId !== null) {
      this.strokes.pop();
      this.pointerId = null;
      this.redrawInk();
      this.penIdle = this.strokes.length ? 0 : -1;
    }
  }

  private redrawInk(): void {
    this.ink.clear();
    for (const stroke of this.strokes) {
      if (!stroke.length) continue;
      if (stroke.length === 1) {
        this.ink.circle(stroke[0].x, -stroke[0].y, 3.5); this.ink.fill(); continue;
      }
      this.ink.moveTo(stroke[0].x, -stroke[0].y);
      for (const point of stroke.slice(1)) this.ink.lineTo(point.x, -point.y);
      this.ink.stroke();
    }
    this.inkHint.node.active = false;
  }

  private clearInk(): void {
    this.pointerId = null;
    this.penIdle = -1;
    this.strokes = [];
    this.ink.clear();
    this.inkHint.node.active = false;
    this.hintLabel.node.active = false;
    this.hintLabel.string = WRITE_HINT;
    this.hintLabel.color = MUTED;
  }

  private onEraserStart = (event: EventTouch): void => {
    this.onFirstTouch();
    if (!this.canWrite() || this.pointerId !== null || this.eraserPointerId !== null) return;
    Tween.stopAllByTarget(this.correctionBottle);
    const ui = event.getUILocation();
    const local = this.layoutRoot.getComponent(UITransform).convertToNodeSpaceAR(new Vec3(ui.x, ui.y, 0));
    const position = this.correctionBottle.position;
    this.bottleGrabOffset = new Vec3(position.x - local.x, position.y - local.y, 0);
    this.eraserPointerId = event.getID();
    this.previousEraserPoint = this.eraserPoint();
    this.penIdle = -1;
    this.hintLabel.node.active = false;
    event.propagationStopped = true;
  };

  private eraserPoint(): InkPoint {
    const point = this.inkArea.getComponent(UITransform).convertToNodeSpaceAR(this.eraserTip.getWorldPosition());
    return { x: point.x, y: -point.y };
  }

  private onEraserMove = (event: EventTouch): void => {
    if (this.eraserPointerId !== event.getID()) return;
    if (!this.canWrite()) { this.stopEraserDrag(); return; }
    const ui = event.getUILocation();
    const local = this.layoutRoot.getComponent(UITransform).convertToNodeSpaceAR(new Vec3(ui.x, ui.y, 0));
    this.correctionBottle.setPosition(local.x + this.bottleGrabOffset.x, local.y + this.bottleGrabOffset.y, 0);
    const point = this.eraserPoint();
    // Include half the red line width so erased fragments end outside the nozzle footprint.
    this.strokes = eraseInkAlongPath(this.strokes, this.previousEraserPoint || point, point, 21.5);
    this.previousEraserPoint = point;
    this.redrawInk();
    event.propagationStopped = true;
  };

  private onEraserEnd = (event: EventTouch): void => {
    if (this.eraserPointerId !== event.getID()) return;
    this.onEraserMove(event);
    this.stopEraserDrag(true);
    event.propagationStopped = true;
  };

  private onEraserCancel = (event: EventTouch): void => {
    if (this.eraserPointerId === event.getID()) this.stopEraserDrag(true);
  };

  private stopEraserDrag(animate = false): void {
    const wasErasing = this.eraserPointerId !== null;
    this.eraserPointerId = null;
    this.previousEraserPoint = null;
    if (wasErasing) this.penIdle = this.strokes.length ? 0 : -1;
    if (!this.correctionBottle?.isValid) return;
    Tween.stopAllByTarget(this.correctionBottle);
    if (animate) tween(this.correctionBottle).to(0.18, { position: this.bottleHome }, { easing: 'quadOut' }).start();
    else this.correctionBottle.setPosition(this.bottleHome);
  }

  private recognizeAnswer(): void {
    if (!this.canWrite() || this.eraserPointerId !== null) return;
    const result = recognizeHandwriting(this.strokes);
    if (!result) {
      this.hintLabel.node.active = true;
      this.hintLabel.string = '暂未识别出数字 · 可用涂改液修改';
      this.hintLabel.color = RED;
      return;
    }
    if (!this.round.submit(result.text)) {
      this.hintLabel.node.active = true;
      this.hintLabel.string = `识别为 ${result.text}，再算一下 · 可擦除重写`;
      this.hintLabel.color = RED;
      return;
    }
    this.phase = 'scrolling';
    this.hintLabel.node.active = false;
    this.penIdle = -1;
    this.refreshScore();
    this.feedbackLabel.string = '✓  +5';
    this.hintLabel.string = `答对了！已答对 ${this.round.correct} 题`;
    void AudioManager.playEffectByName('up');
    this.feedbackLabel.node.setScale(0.6, 0.6, 1);
    tween(this.feedbackLabel.node).to(0.18, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
    const serial = this.serial;
    tween(this.questionRoot).delay(0.15).to(0.2, { position: new Vec3(0, 143.5, 0) }, { easing: 'quadOut' }).call(() => {
      if (serial !== this.serial || !this.node?.isValid || this.phase !== 'scrolling') return;
      this.questionRoot.setPosition(0, 0, 0);
      this.feedbackLabel.string = '';
      this.clearInk();
      this.refreshQuestions();
      this.phase = 'playing';
    }).start();
  }

  private finishRound(): void {
    // The model has already advanced when a correct-answer animation begins.
    // Settle that transition so a later revival shows the current question.
    if (this.phase === 'scrolling') this.clearInk();
    this.serial++;
    this.phase = 'result';
    this.cancelCurrentStroke();
    this.stopEraserDrag();
    Tween.stopAllByTarget(this.questionRoot);
    Tween.stopAllByTarget(this.feedbackLabel.node);
    this.feedbackLabel.string = '';
    this.questionRoot.setPosition(0, 0, 0);
    this.refreshQuestions();
    this.resultTitle.string = this.round.score >= EXAM_TARGET ? '口算高手！' : '时间到，交卷啦！';
    this.resultScore.string = `${this.round.score} 分`;
    this.resultDetail.string = `答对 ${this.round.correct} 题 · ${this.round.score >= EXAM_TARGET ? '挑战成功' : `目标 ${EXAM_TARGET} 分`}`;
    let best = this.round.score;
    try {
      const stored = Number(sys.localStorage.getItem(BEST_KEY));
      if (Number.isFinite(stored)) best = Math.max(best, stored);
      sys.localStorage.setItem(BEST_KEY, String(best));
    } catch { /* Storage may be unavailable in preview/private browsing. */ }
    this.bestLabel.string = `最佳成绩  ${best} 分`;
    this.resultOverlay.active = true;
    this.refreshRewardButtons();
  }

  private refreshRewardButtons(): void {
    const inRound = this.phase === 'playing' || this.phase === 'scrolling';
    const failed = this.phase === 'result' && this.round.score < EXAM_TARGET;
    this.addTimeButton.node.active = inRound || this.phase === 'preview';
    this.addTimeButton.interactable = inRound && !this.adInFlight;
    this.reviveButton.node.active = failed;
    this.reviveButton.interactable = failed && !this.adInFlight;
    this.backButton.interactable = !this.adInFlight;
    this.replayButton.interactable = !this.adInFlight;
    this.homeButton.interactable = !this.adInFlight;
    this.replayButton.node.setPosition(0, failed ? -235 : -154, 0);
    this.homeButton.node.setPosition(0, failed ? -355 : -274, 0);
  }

  private onAddTime = async (): Promise<void> => {
    if ((this.phase !== 'playing' && this.phase !== 'scrolling') || this.round.remaining <= 0 || this.isPaused()) return;
    await this.watchAdForTime(false);
  };

  private onRevive = async (): Promise<void> => {
    if (this.phase !== 'result' || this.round.score >= EXAM_TARGET || this.isPaused()) return;
    await this.watchAdForTime(true);
  };

  private async watchAdForTime(revive: boolean): Promise<void> {
    const serial = this.serial;
    this.adInFlight = true;
    this.cancelCurrentStroke();
    this.stopEraserDrag();
    this.refreshRewardButtons();
    let rewarded = false;
    try {
      // Keep the SDK invocation in the real click stack for native platforms.
      rewarded = await SdkUtils.showRewardedVideo();
    } catch (error) {
      console.error('[mathExamFeedGameScene] 激励视频失败', error);
    }
    if (!this.node?.isValid || this.phase === 'leaving') return;
    this.adInFlight = false;
    if (serial !== this.serial || this.feedExited) {
      this.refreshRewardButtons();
      return;
    }
    if (!rewarded) {
      if (revive) this.resultDetail.string = '未获得奖励，请完整看完广告';
      else {
        this.hintLabel.node.active = true;
        this.hintLabel.string = '未获得奖励，请完整看完广告';
        this.hintLabel.color = RED;
      }
      this.refreshRewardButtons();
      return;
    }
    this.round.grantTime(EXAM_AD_SECONDS);
    if (revive) {
      this.phase = 'playing';
      this.resultOverlay.active = false;
      this.penIdle = this.strokes.length ? 0 : -1;
      this.refreshQuestions();
    }
    this.hintLabel.node.active = true;
    this.hintLabel.string = `已增加 ${EXAM_AD_SECONDS} 秒，继续答题吧`;
    this.hintLabel.color = DARK;
    this.refreshTimer();
    this.refreshRewardButtons();
  }

  private onReplay = (): void => {
    if (this.phase === 'leaving' || this.isPaused()) return;
    this.resetRound(true);
  };

  private returnToMain = async (): Promise<void> => {
    if (this.phase === 'leaving' || this.adInFlight || SdkUtils.isFullscreenAdBusy()) return;
    const previous = this.phase;
    this.phase = 'leaving';
    this.cancelCurrentStroke();
    this.stopEraserDrag();
    try {
      await GameSceneBundle.loadScene(GameSceneName.Main);
      this.finishSession();
      AudioManager.playDefaultBgm();
    } catch (error) {
      console.error('[mathExamFeedGameScene] 返回大厅失败', error);
      if (!this.node?.isValid) return;
      this.phase = previous === 'scrolling' ? 'playing' : previous;
      this.serial++;
      Tween.stopAllByTarget(this.questionRoot);
      this.questionRoot.setPosition(0, 0, 0);
      this.refreshQuestions();
      this.clearInk();
      this.hintLabel.string = '暂时无法返回，请再试一次';
    }
  };

  private onFirstTouch = (): void => {
    if (this.feedMode && !this.feedEntered && !this.feedExited && this.phase !== 'leaving') FeedAcquisitionService.activateFromFirstTouch();
  };

  private onFeedStateChanged = (state: FeedAcquisitionState): void => {
    if (!this.feedMode || this.sessionFinished || this.phase === 'leaving') return;
    const first = state.active && state.entered && !state.exited && !this.feedEntered;
    this.feedEntered = state.active && state.entered && !state.exited;
    this.feedExited = !state.active || state.exited;
    if (this.feedExited) {
      this.cancelCurrentStroke();
      this.stopEraserDrag();
      adc.cancelFeedEntryInterstitial();
      this.feedScheduled = false;
      AudioManager.pauseBgmForVideo();
    } else if (this.feedEntered) {
      if (first) this.resetRound(true);
      if (!this.isPaused()) AudioManager.playMusic(soundName.getUserBgm);
      this.scheduleFeedAd();
    }
  };

  private scheduleFeedAd(): void {
    if (this.feedScheduled || !this.feedMode || !this.feedEntered || this.feedExited) return;
    this.feedScheduled = true;
    adc.scheduleFeedEntryInterstitial(() => !!this.node?.isValid && this.phase !== 'leaving' && !this.sessionFinished && this.feedEntered && !this.feedExited);
  }

  private onGameHide = (): void => {
    this.appHidden = true;
    this.wasPaused = true;
    this.cancelCurrentStroke();
    this.stopEraserDrag();
    AudioManager.pauseBgmForVideo();
  };

  private onGameShow = (): void => {
    this.appHidden = false;
    if (!this.isPaused() && this.phase !== 'leaving') {
      AudioManager.playMusic(soundName.getUserBgm);
      this.wasPaused = false;
    }
  };

  private finishSession(): void {
    if (!this.feedMode || this.sessionFinished) return;
    this.sessionFinished = true;
    adc.cancelFeedEntryInterstitial();
    FeedAcquisitionService.completeSession();
  }

  protected onDestroy(): void {
    this.phase = 'leaving';
    this.serial++;
    if (this.questionRoot) Tween.stopAllByTarget(this.questionRoot);
    if (this.feedbackLabel?.node) Tween.stopAllByTarget(this.feedbackLabel.node);
    view.off('canvas-resize', this.fitLayout, this);
    // Canvas children can have already released their event processors here.
    if (this.inkArea?.isValid) {
      this.inkArea.off(Node.EventType.TOUCH_START, this.onPenStart, this);
      this.inkArea.off(Node.EventType.TOUCH_MOVE, this.onPenMove, this);
      this.inkArea.off(Node.EventType.TOUCH_END, this.onPenEnd, this);
      this.inkArea.off(Node.EventType.TOUCH_CANCEL, this.onPenCancel, this);
    }
    if (this.correctionBottle?.isValid) {
      Tween.stopAllByTarget(this.correctionBottle);
      this.correctionBottle.off(Node.EventType.TOUCH_START, this.onEraserStart, this);
      this.correctionBottle.off(Node.EventType.TOUCH_MOVE, this.onEraserMove, this);
      this.correctionBottle.off(Node.EventType.TOUCH_END, this.onEraserEnd, this);
      this.correctionBottle.off(Node.EventType.TOUCH_CANCEL, this.onEraserCancel, this);
    }
    if (this.backButton?.node?.isValid) this.backButton.node.off(Button.EventType.CLICK, this.returnToMain, this);
    if (this.replayButton?.node?.isValid) this.replayButton.node.off(Button.EventType.CLICK, this.onReplay, this);
    if (this.homeButton?.node?.isValid) this.homeButton.node.off(Button.EventType.CLICK, this.returnToMain, this);
    if (this.addTimeButton?.node?.isValid) this.addTimeButton.node.off(Button.EventType.CLICK, this.onAddTime, this);
    if (this.reviveButton?.node?.isValid) this.reviveButton.node.off(Button.EventType.CLICK, this.onRevive, this);
    game.off(Game.EVENT_HIDE, this.onGameHide, this);
    game.off(Game.EVENT_SHOW, this.onGameShow, this);
    input.off(Input.EventType.TOUCH_START, this.onFirstTouch, this);
    FeedAcquisitionService.removeListener(this.onFeedStateChanged);
    adc.cancelFeedEntryInterstitial();
    this.finishSession();
  }
}
