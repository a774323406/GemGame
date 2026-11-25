import { _decorator, Button, Component, Game, game, Label, Node, ResolutionPolicy, view } from 'cc';
import AudioManager from './framework/AudioManager';
import { GameSceneBundle, GameSceneName } from './framework/GameSceneBundle';
import { adc } from './framework/Platform/ADController';
import { FeedAcquisitionService, FeedAcquisitionState } from './framework/Platform/FeedAcquisitionService';
import { EnvTool } from './framework/Platform/sdk/EnvTool';
import { SdkUtils } from './framework/Platform/sdk/SdkUtils';
import { soundName } from './gamePrefabMgr';
import { LANE_EDGE, LANE_Y, MARBLE_TARGET, MarbleBottleRound } from './marbleBottleRules';

const { ccclass, property } = _decorator;

@ccclass('marbleBottleFeedGameScene')
export class marbleBottleFeedGameScene extends Component {
    @property(Node) surface: Node = null;
    @property(Node) cue: Node = null;
    @property(Node) bottle: Node = null;
    @property(Node) hud: Node = null;
    @property(Node) resultOverlay: Node = null;
    @property(Node) exitOverlay: Node = null;
    @property([Node]) balls: Node[] = [];
    @property(Label) countLabel: Label = null;
    @property(Label) remainingLabel: Label = null;
    @property(Label) resultTitle: Label = null;
    @property(Label) resultDetail: Label = null;
    @property(Button) backButton: Button = null;
    @property(Button) slowdownButton: Button = null;
    @property(Button) replayButton: Button = null;
    @property(Button) homeButton: Button = null;
    @property(Button) continueButton: Button = null;
    @property(Button) exitButton: Button = null;

    round = new MarbleBottleRound();
    private feed = false;
    private entered = true;
    private exited = false;
    private startedPlaying = false;
    private previewElapsed = 0;
    private hidden = false;
    private disposed = false;
    private leaving = false;
    private adInFlight = false;
    private adScheduled = false;
    private serial = 0;
    private audioTouchRecovered = false;
    private resultDelay = 0;
    private buttons: [Button, () => void][] = [];

    protected onLoad(): void {
        view.setDesignResolutionSize(750, 1624, ResolutionPolicy.FIXED_WIDTH);
        FeedAcquisitionService.init();
        this.feed = FeedAcquisitionService.isActive();
        const state = FeedAcquisitionService.getState();
        this.entered = !this.feed || state.entered;
        this.exited = this.feed && state.exited;
        this.buttons = [
            [this.backButton, this.requestExit], [this.continueButton, this.cancelExit],
            [this.exitButton, this.home], [this.homeButton, this.home],
            [this.slowdownButton, this.slowdown], [this.replayButton, this.replay],
        ];
        for (const [button, action] of this.buttons) button.node.on(Button.EventType.CLICK, action, this);
        this.surface.on(Node.EventType.TOUCH_START, this.onTap, this);
        game.on(Game.EVENT_HIDE, this.onHide, this);
        game.on(Game.EVENT_SHOW, this.onShow, this);
        this.replay();
        FeedAcquisitionService.addListener(this.feedChanged);
    }

    protected start(): void {
        adc.onEnterGame(this.node);
        if (this.feed) {
            void FeedAcquisitionService.reportSceneReadyAfterStableRender({
                owner: this.node, requiredVisibleNodes: [this.surface, this.bottle, this.cue],
                stableFrameCount: 3, surfaceDelayMs: 180,
                isReady: () => !this.disposed && !this.leaving && !this.exited,
            });
        }
        this.scheduleAd();
        this.syncAudio();
    }

    private feedChanged = (state: FeedAcquisitionState): void => {
        if (!this.feed) return;
        const wasPlaying = this.entered && !this.exited;
        this.entered = state.entered;
        this.exited = state.exited;
        if (this.entered && !this.exited) {
            if (!this.startedPlaying) this.round.startAtPreview(this.previewElapsed);
            this.startedPlaying = true;
            this.scheduleAd();
        } else {
            if (this.adScheduled) adc.cancelFeedEntryInterstitial();
            this.adScheduled = false;
            if (this.exited) {
                this.serial++;
                this.adInFlight = false;
            }
        }
        this.render();
        this.syncAudio(wasPlaying !== (this.entered && !this.exited));
    };

    private scheduleAd(): void {
        if (!this.feed || !this.entered || this.exited || this.adScheduled) return;
        this.adScheduled = true;
        adc.scheduleFeedEntryInterstitial(() => !this.disposed && !this.leaving && this.entered && !this.exited);
    }

    private paused(): boolean {
        return this.hidden || this.leaving || this.disposed || this.exitOverlay.active ||
            this.adInFlight || SdkUtils.isRewardedVideoBusy();
    }

    private activate(): boolean {
        if (this.paused() || this.exited) return false;
        if (this.feed && !this.entered) FeedAcquisitionService.activateFromFirstTouch();
        return this.entered && !this.exited;
    }

    private syncAudio(restart = false): void {
        if (this.paused()) {
            this.audioTouchRecovered = false;
            AudioManager.pauseBgmForVideo();
        } else {
            AudioManager.setSoundEvent();
            if (restart) AudioManager.restartMusic(soundName.getUserBgm);
            else AudioManager.playMusic(soundName.getUserBgm);
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

    private onTap(): void {
        if (!this.activate() || this.round.phase !== 'playing') return;
        if (!this.audioTouchRecovered) {
            this.syncAudio(true);
            this.audioTouchRecovered = true;
        }
        if (this.round.strike()) AudioManager.playEffect(soundName.pingPongHit);
        this.render();
    }

    protected update(dt: number): void {
        if (this.paused()) return;
        const step = Number.isFinite(dt) ? Math.max(0, Math.min(.1, dt)) : 0;
        if (!this.entered || this.exited) {
            if (this.round.phase === 'playing') {
                this.previewElapsed += step;
                this.render();
            }
            return;
        }
        if (this.resultDelay > 0) {
            this.resultDelay = Math.max(0, this.resultDelay - step);
            if (this.resultDelay === 0) this.showResult();
            return;
        }
        if (this.resultOverlay.active) return;
        this.round.tick(step);
        this.render();
        if (this.round.phase === 'success') {
            this.resultDelay = .45;
            void AudioManager.playEffectByName('up');
        } else if (this.round.phase === 'failure') {
            this.showResult();
        }
    }

    private render(): void {
        const preview = !this.entered || this.exited;
        for (let index = 0; index < this.balls.length; index++) {
            const ball = this.round.balls[index];
            const inPreviewLane = preview && ball.state === 'lane';
            const x = inPreviewLane ? MarbleBottleRound.previewX(index, this.previewElapsed) : ball.x;
            const node = this.balls[index];
            node.active = ball.state !== 'gone' && Math.abs(x) <= LANE_EDGE;
            if (node.active) node.setPosition(x, inPreviewLane ? LANE_Y : ball.y, 0);
        }
        this.cue.setPosition(0, -231 + 56 * this.round.cueExtension, 0);
        this.countLabel.string = `已入瓶 ${this.round.pocketed}/${MARBLE_TARGET}`;
        this.remainingLabel.string = `剩余弹珠 ${this.round.remaining}`;
        this.slowdownButton.interactable = !this.paused() && !this.exited && this.round.phase === 'playing';
    }

    private showResult(): void {
        const won = this.round.phase === 'success';
        this.resultTitle.string = won ? '挑战成功' : '挑战失败';
        this.resultDetail.string = won ? '成功打入 10 颗弹珠！' : `进瓶 ${this.round.pocketed} 颗，还差 ${MARBLE_TARGET - this.round.pocketed} 颗`;
        this.hud.active = false;
        this.resultOverlay.active = true;
    }

    private replay(): void {
        if (this.disposed || this.leaving) return;
        this.serial++;
        this.adInFlight = false;
        this.resultDelay = 0;
        this.previewElapsed = 0;
        this.startedPlaying = this.entered && !this.exited;
        this.round = new MarbleBottleRound();
        this.round.startAtPreview(0);
        this.resultOverlay.active = false;
        this.exitOverlay.active = false;
        this.hud.active = true;
        this.render();
    }

    private async slowdown(): Promise<void> {
        if (!this.activate() || this.round.phase !== 'playing') return;
        const serial = this.serial;
        this.adInFlight = true;
        this.syncAudio();
        this.render();
        let rewarded = false;
        try {
            rewarded = await SdkUtils.showRewardedVideo();
        } catch (error) {
            console.warn('[MarbleBottle] 激励视频播放失败', error);
        }
        if (this.disposed || this.leaving || serial !== this.serial || !this.node?.isValid) return;
        this.adInFlight = false;
        if (rewarded) this.round.slowDown();
        this.render();
        this.syncAudio();
        try {
            EnvTool.getMiniGameApi()?.showToast?.({ title: rewarded ? '弹珠已减速' : '完整看完广告才能减速', icon: 'none' });
        } catch (error) {
            console.warn('[MarbleBottle] 减速提示显示失败', error);
        }
    }

    private requestExit(): void {
        if (!this.activate() || this.round.phase !== 'playing') return;
        this.exitOverlay.active = true;
        this.syncAudio();
    }

    private cancelExit(): void {
        if (this.leaving || this.disposed) return;
        this.exitOverlay.active = false;
        this.syncAudio();
    }

    private async home(): Promise<void> {
        if (this.leaving || this.adInFlight || this.disposed) return;
        this.leaving = true;
        this.serial++;
        this.syncAudio();
        try {
            await GameSceneBundle.loadScene(GameSceneName.Main);
        } catch (error) {
            this.leaving = false;
            this.syncAudio();
            console.error('[MarbleBottle] 返回主页失败', error);
        }
    }

    protected onDestroy(): void {
        this.disposed = true;
        this.serial++;
        if (this.surface?.isValid) this.surface.off(Node.EventType.TOUCH_START, this.onTap, this);
        for (const [button, action] of this.buttons) {
            if (button?.node?.isValid) button.node.off(Button.EventType.CLICK, action, this);
        }
        game.off(Game.EVENT_HIDE, this.onHide, this);
        game.off(Game.EVENT_SHOW, this.onShow, this);
        FeedAcquisitionService.removeListener(this.feedChanged);
        if (this.feed) {
            adc.cancelFeedEntryInterstitial();
            FeedAcquisitionService.completeSession();
        }
    }
}
