import {
  _decorator, Button, Color, Component, EventTouch, game, Game, input, Input,
  JsonAsset, Label, Node, ResolutionPolicy, Sprite, UIOpacity, UITransform, Vec3, view,
} from "cc";
import AudioManager from "./framework/AudioManager";
import { GameSceneBundle, GameSceneName } from "./framework/GameSceneBundle";
import { FeedAcquisitionService, FeedAcquisitionState } from "./framework/Platform/FeedAcquisitionService";
import { adc } from "./framework/Platform/ADController";
import { SdkUtils } from "./framework/Platform/sdk/SdkUtils";
import { soundName } from "./gamePrefabMgr";
import { BalloonShotTarget, BalloonWheelRound, containsMaskPoint, SpriteHitMask } from "./balloonWheelRules";

const { ccclass, property } = _decorator;
type RewardKind = "time" | "ammo" | "revive";

/** All artwork, buttons, holes, burst effects and result titles are authored in the scene. */
@ccclass("balloonWheelFeedGameScene")
export class balloonWheelFeedGameScene extends Component {
  @property({ tooltip: "圆盘每秒旋转角度；负值顺时针" }) public rotationSpeed = -100;
  @property({ tooltip: "初始子弹数量" }) public initialAmmo = 8;
  @property({ tooltip: "正式进入后开始计时，单位秒" }) public timeLimit = 60;
  @property({ tooltip: "两次开枪之间的最短间隔，单位秒" }) public shotInterval = 0.18;
  @property({ tooltip: "气球椭圆判定比例，1 为可见大小" }) public balloonHitScale = 0.92;
  @property(Node) public sceneBackground: Node = null;
  @property(Node) public wheelRoot: Node = null;
  @property(Node) public wheelArt: Node = null;
  @property(Node) public character: Node = null;
  @property(JsonAsset) public characterHitMask: JsonAsset = null;
  @property([Node]) public balloons: Node[] = [];
  @property([Node]) public balloonBursts: Node[] = [];
  @property([Node]) public bulletHoles: Node[] = [];
  @property(Node) public crosshair: Node = null;
  @property(Node) public gun: Node = null;
  @property(Node) public muzzle: Node = null;
  @property(Label) public timerLabel: Label = null;
  @property(Label) public scoreLabel: Label = null;
  @property(Label) public ammoLabel: Label = null;
  @property(Label) public progressLabel: Label = null;
  @property(Label) public feedbackLabel: Label = null;
  @property(Button) public backButton: Button = null;
  @property(Button) public timeButton: Button = null;
  @property(Button) public ammoButton: Button = null;
  @property(Node) public resultOverlay: Node = null;
  @property(Node) public resultPanel: Node = null;
  @property(Node) public successTitle: Node = null;
  @property(Node) public failureTitle: Node = null;
  @property(Label) public resultRating: Label = null;
  @property(Label) public resultStats: Label = null;
  @property(Label) public resultReason: Label = null;
  @property(Button) public retryButton: Button = null;
  @property(Button) public reviveButton: Button = null;
  @property(Label) public reviveButtonLabel: Label = null;
  @property(Button) public failureRetryButton: Button = null;
  @property(Button) public nextButton: Button = null;
  @property(Button) public resultHomeButton: Button = null;

  private round = new BalloonWheelRound();
  private roundSerial = 0;
  private disposed = false;
  private leaving = false;
  private adInFlight = false;
  private appHidden = false;
  private feedMode = false;
  private feedEntered = false;
  private feedExited = false;
  private feedFinished = false;
  private feedAudioForeground = false;
  private interstitialScheduled = false;
  private recoilLeft = 0;
  private feedbackLeft = 0;
  private resultDelay = 0;
  private resultAnimation = 0;
  private holeCursor = 0;
  private burstTimes: number[] = [];
  private originalGunPosition = new Vec3();
  private originalGunScale = new Vec3(1, 1, 1);
  private originalAimScale = new Vec3(1, 1, 1);
  private originalPanelScale = new Vec3(1, 1, 1);
  private originalCharacterColor = new Color();
  private bindings: Array<[Button, () => void]> = [];

  protected onLoad(): void {
    view.setDesignResolutionSize(750, 1334, ResolutionPolicy.FIXED_WIDTH);
    this.validateBindings();
    FeedAcquisitionService.init();
    const state = FeedAcquisitionService.getState();
    this.feedMode = state.active;
    this.feedEntered = !state.active || state.entered;
    this.feedExited = state.active && state.exited;
    this.originalGunPosition.set(this.gun.position);
    this.originalGunScale.set(this.gun.scale);
    this.originalAimScale.set(this.crosshair.scale);
    this.originalPanelScale.set(this.resultPanel.scale);
    this.originalCharacterColor.set(this.character.getComponent(Sprite).color);
    this.bindings = [
      [this.backButton, this.returnHome],
      [this.timeButton, this.onAddTime], [this.ammoButton, this.onAddAmmo],
      [this.retryButton, this.resetRound], [this.nextButton, this.goToMainGame],
      [this.reviveButton, this.onRevive], [this.failureRetryButton, this.resetRound],
      [this.resultHomeButton, this.returnHome],
    ];
    for (const [button, callback] of this.bindings) button.node.on(Button.EventType.CLICK, callback, this);
    input.on(Input.EventType.TOUCH_START, this.onTouchStart, this);
    game.on(Game.EVENT_HIDE, this.onHide, this);
    game.on(Game.EVENT_SHOW, this.onShow, this);
    this.resetRound();
  }

  protected start(): void {
    AudioManager.setSoundEvent();
    if (this.feedMode) {
      FeedAcquisitionService.addListener(this.onFeedState);
      void FeedAcquisitionService.reportSceneReadyAfterStableRender({
        owner: this.node,
        requiredVisibleNodes: [this.sceneBackground, this.wheelArt, this.character, this.gun, ...this.balloons],
        isReady: () => !this.disposed && !this.leaving && !this.feedExited,
        stableFrameCount: 3,
        surfaceDelayMs: 180,
      });
    } else AudioManager.playMusic(soundName.getUserBgm);
  }

  protected update(deltaTime: number): void {
    if (this.disposed || this.leaving || this.appHidden || this.feedExited || this.adInFlight || SdkUtils.isRewardedVideoBusy()) return;
    const dt = Math.max(0, Math.min(0.1, deltaTime));
    if (this.round.status === "playing") {
      // Preview must already move, but cannot consume time or bullets before feedEnter.
      this.wheelRoot.angle = (this.wheelRoot.angle + this.rotationSpeed * dt) % 360;
      if (this.canInteract()) this.round.tick(dt);
      this.refreshHud();
    }
    this.updateEffects(dt);
    if (this.round.status !== "playing" && !this.resultOverlay.active) {
      this.resultDelay = Math.max(0, this.resultDelay - dt);
      if (this.resultDelay === 0) this.showResult();
    }
    if (this.resultOverlay.active && this.resultAnimation < 1) {
      this.resultAnimation = Math.min(1, this.resultAnimation + dt / 0.22);
      const t = 1 - Math.pow(1 - this.resultAnimation, 3);
      this.setRelativeScale(this.resultPanel, this.originalPanelScale, 0.9 + t * 0.1);
      this.resultPanel.getComponent(UIOpacity).opacity = Math.round(255 * t);
    }
  }

  protected onDestroy(): void {
    this.disposed = true;
    this.roundSerial++;
    this.unscheduleAllCallbacks();
    input.off(Input.EventType.TOUCH_START, this.onTouchStart, this);
    game.off(Game.EVENT_HIDE, this.onHide, this);
    game.off(Game.EVENT_SHOW, this.onShow, this);
    for (const [button, callback] of this.bindings) {
      // During scene teardown a non-null Node may already have cleared its components/events.
      const node = button?.node;
      if (node?.isValid) node.off(Button.EventType.CLICK, callback, this);
    }
    this.bindings = [];
    this.finishFeed();
    // No scene-owned tweens or delayed callbacks. Pending interstitial belongs to adc.
  }

  private validateBindings(): void {
    const required = [
      "sceneBackground", "wheelRoot", "wheelArt", "character", "characterHitMask", "crosshair", "gun", "muzzle",
      "timerLabel", "scoreLabel", "ammoLabel", "progressLabel", "feedbackLabel", "backButton",
      "timeButton", "ammoButton", "resultOverlay", "resultPanel", "successTitle", "failureTitle", "resultRating",
      "resultStats", "resultReason", "retryButton", "reviveButton", "reviveButtonLabel", "failureRetryButton", "nextButton", "resultHomeButton",
    ];
    const missing = required.filter(key => !this[key]);
    if (this.balloons.length !== 6 || this.balloons.some(node => !node)) missing.push("balloons (6)");
    if (this.balloonBursts.length !== 6 || this.balloonBursts.some(node => !node)) missing.push("balloonBursts (6)");
    if (this.bulletHoles.length === 0 || this.bulletHoles.some(node => !node)) missing.push("bulletHoles");
    const mask = this.characterHitMask?.json as SpriteHitMask;
    if (!mask?.width || !mask.height || mask.rows?.length !== mask.height) missing.push("characterHitMask.rows");
    if (missing.length) throw new Error(`[balloonWheelFeedGameScene] 场景绑定不完整: ${missing.join(", ")}`);
  }

  private resetRound = (): void => {
    if (this.disposed || this.leaving || this.adInFlight) return;
    this.roundSerial++;
    this.round.reset(this.balloons.length, this.initialAmmo, this.timeLimit);
    this.wheelRoot.angle = 0;
    this.recoilLeft = this.feedbackLeft = this.resultDelay = this.resultAnimation = this.holeCursor = 0;
    this.burstTimes = this.balloons.map(() => 0);
    this.balloons.forEach(node => node.active = true);
    this.balloonBursts.forEach(node => node.active = false);
    this.bulletHoles.forEach(node => node.active = false);
    this.gun.setPosition(this.originalGunPosition);
    this.gun.setScale(this.originalGunScale);
    this.crosshair.setScale(this.originalAimScale);
    this.muzzle.active = false;
    this.feedbackLabel.node.active = false;
    this.resultOverlay.active = false;
    this.successTitle.active = false;
    this.failureTitle.active = false;
    this.character.getComponent(Sprite).color = this.originalCharacterColor;
    this.resultPanel.setScale(this.originalPanelScale);
    this.resultPanel.getComponent(UIOpacity).opacity = 255;
    this.refreshHud();
    this.refreshButtons();
  };

  private onTouchStart = (event: EventTouch): void => {
    if (this.feedMode && !this.feedEntered && !this.feedExited && !this.leaving) {
      FeedAcquisitionService.activateFromFirstTouch();
    }
    if (!this.canInteract() || this.round.status !== "playing" || this.resultOverlay.active) return;
    // Global press sees button/badge touches too; include the complete protruding badge area.
    if (this.bindings.some(([button]) => this.containsTouch(button.node, event))) return;
    this.fire();
  };

  private canInteract(): boolean {
    return !this.disposed && !this.leaving && !this.appHidden && !this.adInFlight &&
      !SdkUtils.isRewardedVideoBusy() && (!this.feedMode || (this.feedEntered && !this.feedExited));
  }

  private fire(): void {
    if (!this.canInteract() || this.round.status !== "playing") return;
    // Snapshot against the rendered transform now, not after muzzle flash / bullet flight.
    const worldPoint = this.crosshair.worldPosition.clone();
    const outcome = this.round.fire(this.classifyShot(worldPoint), this.shotInterval);
    if (!outcome) return;
    this.recoilLeft = 0.16;
    this.muzzle.active = true;
    AudioManager.playEffect(soundName.shoot);
    const point = this.wheelRoot.getComponent(UITransform).convertToNodeSpaceAR(worldPoint);
    if (Math.hypot(point.x, point.y) <= this.wheelArt.getComponent(UITransform).width / 2) {
      const hole = this.bulletHoles[this.holeCursor++ % this.bulletHoles.length];
      hole.setPosition(point); hole.active = true;
    }
    if (outcome.kind === "balloon") {
      this.balloons[outcome.index].active = false;
      this.burstTimes[outcome.index] = 0.24;
      const burst = this.balloonBursts[outcome.index];
      burst.setPosition(this.balloons[outcome.index].position);
      burst.active = true;
      this.setFeedback("+350", new Color(255, 230, 70));
      AudioManager.playEffect(soundName.down);
    } else if (outcome.kind === "character") {
      this.character.getComponent(Sprite).color = new Color(255, 150, 150);
      this.setFeedback("打中角色了！", new Color(255, 80, 88));
    } else this.setFeedback("打空了", new Color(255, 255, 255));
    if (this.round.status !== "playing") this.resultDelay = 0.26;
    this.refreshHud();
    this.refreshButtons();
  }

  private classifyShot(worldPoint: Vec3): BalloonShotTarget {
    const transform = this.character.getComponent(UITransform);
    const point = transform.convertToNodeSpaceAR(worldPoint);
    const u = point.x / transform.width + transform.anchorX;
    const v = 1 - (point.y / transform.height + transform.anchorY);
    if (containsMaskPoint(this.characterHitMask.json as SpriteHitMask, u, v)) return "character";
    for (let i = 0; i < this.balloons.length; i++) {
      if (!this.round.balloons[i]) continue;
      const bounds = this.balloons[i].getComponent(UITransform);
      const p = bounds.convertToNodeSpaceAR(worldPoint);
      const x = (p.x / bounds.width + bounds.anchorX - 0.5) * 2 / this.balloonHitScale;
      const y = (p.y / bounds.height + bounds.anchorY - 0.5) * 2 / this.balloonHitScale;
      if (x * x + y * y <= 1) return i;
    }
    return "miss";
  }

  private setFeedback(text: string, color: Color): void {
    this.feedbackLabel.string = text;
    this.feedbackLabel.color = color;
    this.feedbackLabel.node.active = true;
    this.feedbackLabel.node.getComponent(UIOpacity).opacity = 255;
    this.feedbackLeft = 0.65;
  }

  private updateEffects(dt: number): void {
    this.recoilLeft = Math.max(0, this.recoilLeft - dt);
    const kick = Math.sin(this.recoilLeft / 0.16 * Math.PI);
    this.gun.setPosition(this.originalGunPosition.x, this.originalGunPosition.y - kick * 14, this.originalGunPosition.z);
    this.setRelativeScale(this.gun, this.originalGunScale, 1 + kick * 0.035);
    this.setRelativeScale(this.crosshair, this.originalAimScale, 1 + kick * 0.1);
    this.muzzle.active = this.recoilLeft > 0.10;
    this.feedbackLeft = Math.max(0, this.feedbackLeft - dt);
    this.feedbackLabel.node.active = this.feedbackLeft > 0;
    this.feedbackLabel.node.getComponent(UIOpacity).opacity = Math.round(255 * Math.min(1, this.feedbackLeft / 0.25));
    this.balloonBursts.forEach((burst, i) => {
      this.burstTimes[i] = Math.max(0, this.burstTimes[i] - dt);
      burst.active = this.burstTimes[i] > 0;
      if (!burst.active) return;
      const t = 1 - this.burstTimes[i] / 0.24;
      burst.setScale(0.6 + t * 0.7, 0.6 + t * 0.7, 1);
      burst.getComponent(UIOpacity).opacity = Math.round(255 * (1 - t));
    });
  }

  private setRelativeScale(node: Node, base: Vec3, multiplier: number): void {
    node.setScale(base.x * multiplier, base.y * multiplier, base.z);
  }

  private refreshHud(): void {
    this.timerLabel.string = `时间：${Math.ceil(this.round.remainingTime)}s`;
    this.timerLabel.color = this.round.remainingTime <= 10 ? new Color(255, 93, 74) : Color.WHITE;
    this.scoreLabel.string = `当前得分：\n${this.round.score}`;
    this.ammoLabel.string = `×${this.round.remainingAmmo}`;
    this.progressLabel.string = `气球 ${this.round.hits}/${this.balloons.length}`;
  }

  private refreshButtons(): void {
    const enabled = !this.disposed && !this.leaving && !this.adInFlight;
    this.backButton.interactable = enabled;
    this.retryButton.interactable = enabled;
    this.failureRetryButton.interactable = enabled;
    this.reviveButton.interactable = enabled && this.canInteract() && this.round.status === "failed";
    this.resultHomeButton.interactable = enabled;
    this.nextButton.interactable = enabled && this.round.status === "success";
    for (const button of [this.timeButton, this.ammoButton]) {
      button.interactable = enabled && this.canInteract() && this.round.status === "playing";
    }
  }

  private showResult(): void {
    const success = this.round.status === "success";
    this.successTitle.active = success;
    this.failureTitle.active = !success;
    this.retryButton.node.active = success;
    this.reviveButton.node.active = !success;
    this.failureRetryButton.node.active = !success;
    this.nextButton.node.active = success;
    this.reviveButtonLabel.string = this.round.remainingAmmo <= 0
      ? (this.round.remainingTime <= 0 ? "+5子弹 +20秒复活" : "+5子弹复活")
      : this.round.remainingTime <= 0 ? "+20秒复活" : "原地复活";
    const rank = success ? (this.round.accuracy === 100 ? "神枪手" : "射击高手") : "菜鸟";
    this.resultRating.string = `评价为：${rank}`;
    this.resultStats.string = `准确率：${this.round.accuracy}%    得分：${this.round.score}\n打爆气球：${this.round.hits}/${this.balloons.length}`;
    this.resultReason.string = success
      ? "气球全部打爆，角色安然无恙！"
      : this.round.failure === "character" ? "气球还没吹散，角色先挨了一发！"
        : this.round.failure === "ammo" ? "子弹用完了，找准气球再开枪！" : "时间到了，下次抓住开枪时机！";
    this.resultOverlay.active = true;
    this.resultAnimation = 0;
    this.resultPanel.getComponent(UIOpacity).opacity = 0;
    this.setRelativeScale(this.resultPanel, this.originalPanelScale, 0.9);
    this.refreshButtons();
    AudioManager.playEffect(success ? soundName.down : soundName.fail);
  }

  private onAddTime = (): void => { void this.requestReward("time"); };
  private onAddAmmo = (): void => { void this.requestReward("ammo"); };
  private onRevive = (): void => { void this.requestReward("revive"); };

  private resumeAfterRevive(): void {
    // Preserve wheel angle, popped balloons, bullet holes and scoring; reset only transient visuals.
    this.resultOverlay.active = false;
    this.successTitle.active = false;
    this.failureTitle.active = false;
    this.resultDelay = this.resultAnimation = this.recoilLeft = this.feedbackLeft = 0;
    this.resultPanel.setScale(this.originalPanelScale);
    this.resultPanel.getComponent(UIOpacity).opacity = 255;
    this.character.getComponent(Sprite).color = this.originalCharacterColor;
    this.gun.setPosition(this.originalGunPosition);
    this.gun.setScale(this.originalGunScale);
    this.crosshair.setScale(this.originalAimScale);
    this.muzzle.active = false;
    this.feedbackLabel.node.active = false;
    this.burstTimes.fill(0);
    this.balloonBursts.forEach(node => node.active = false);
  }

  private async requestReward(kind: RewardKind): Promise<void> {
    if (kind !== "time" && kind !== "ammo" && kind !== "revive") return;
    if (!this.canInteract()) return;
    if (kind === "revive") {
      if (this.round.status !== "failed" || !this.resultOverlay.active) return;
    } else if (this.round.status !== "playing" || this.resultOverlay.active) return;
    const serial = this.roundSerial;
    this.adInFlight = true;
    this.refreshButtons();
    let rewarded = false;
    try { rewarded = await SdkUtils.showRewardedVideo(); }
    catch (error) { console.warn("[balloonWheelFeedGameScene] 激励视频失败", error); }
    if (this.disposed || !this.node?.isValid || this.leaving || serial !== this.roundSerial) return;
    this.adInFlight = false;
    if (rewarded) {
      if (kind === "revive") {
        if (this.round.revive()) this.resumeAfterRevive();
      } else {
        if (kind === "ammo") this.round.addAmmo(5);
        else this.round.addTime(30);
        this.setFeedback(kind === "ammo" ? "子弹 +5" : "时间 +30秒", new Color(255, 230, 70));
      }
    } else this.toast("完整看完广告才能获得奖励");
    this.refreshHud();
    this.refreshButtons();
  }

  private onFeedState = (state: FeedAcquisitionState): void => {
    if (this.disposed || this.leaving) return;
    this.feedMode = state.active;
    this.feedEntered = !state.active || state.entered;
    this.feedExited = state.active && state.exited;
    // 推荐流展示阶段即播放本玩法 BGM，不等待 feedEnter；后台/广告暂停独立处理。
    if (!this.appHidden && !this.adInFlight && !SdkUtils.isRewardedVideoBusy()) {
      if (!this.feedAudioForeground) {
        this.feedAudioForeground = true;
        AudioManager.restartMusic(soundName.getUserBgm);
      } else AudioManager.playMusic(soundName.getUserBgm);
    }
    if (state.active && state.entered && !state.exited && !this.interstitialScheduled) {
      this.interstitialScheduled = true;
      // Global queue: preserve pending ads across exit/navigation; adc enforces frequency/background rules.
      adc.scheduleFeedEntryInterstitial();
    }
    this.refreshButtons();
  };

  private onHide = (): void => {
    this.appHidden = true;
    this.feedAudioForeground = false;
    AudioManager.pauseBgmForVideo();
  };
  private onShow = (): void => {
    this.appHidden = false;
    if (!this.disposed && !this.leaving && !this.adInFlight && !SdkUtils.isRewardedVideoBusy()) {
      this.feedAudioForeground = true;
      AudioManager.restartMusic(soundName.getUserBgm);
    }
    this.refreshButtons();
  };

  private returnHome = (): void => { void this.navigate(GameSceneName.Main); };
  private goToMainGame = (): void => {
    if (this.round.status === "success") void this.navigate(GameSceneName.Game);
  };

  private async navigate(scene: GameSceneName): Promise<void> {
    if (this.disposed || this.leaving || this.adInFlight) return;
    this.leaving = true;
    this.refreshButtons();
    this.finishFeed();
    this.feedMode = false;
    this.feedEntered = true;
    this.feedExited = false;
    AudioManager.playDefaultBgm();
    try { await GameSceneBundle.loadScene(scene); }
    catch (error) {
      if (this.disposed || !this.node?.isValid) return;
      this.leaving = false;
      this.refreshButtons();
      AudioManager.playMusic(soundName.getUserBgm);
      this.toast("场景加载失败，请重试");
      console.error("[balloonWheelFeedGameScene] 切换场景失败", error);
    }
  }

  private finishFeed(): void {
    FeedAcquisitionService.removeListener(this.onFeedState);
    if (!this.feedMode || this.feedFinished) return;
    this.feedFinished = true;
    FeedAcquisitionService.completeSession();
  }

  private containsTouch(node: Node, event: EventTouch): boolean {
    if (!node?.isValid || !node.activeInHierarchy) return false;
    // Cocos 3.8 hitTest expects screen coordinates, not design-resolution UI coordinates.
    // Mixing these makes an ad button press also fire on scaled/high-DPI screens.
    return !!node.getComponent(UITransform)?.hitTest(event.getLocation(), event.windowId);
  }

  private toast(title: string): void {
    try {
      if (typeof tt !== "undefined" && typeof tt.showToast === "function") tt.showToast({ title, icon: "none" });
      else console.log(`[balloonWheelFeedGameScene] ${title}`);
    } catch { console.log(`[balloonWheelFeedGameScene] ${title}`); }
  }
}
