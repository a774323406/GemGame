import { _decorator, Button, Component, Game, game, Label, Node, ResolutionPolicy, Sprite, SpriteFrame, view, Widget } from 'cc';
import AudioManager from './framework/AudioManager';
import { GameSceneBundle, GameSceneName } from './framework/GameSceneBundle';
import { adc } from './framework/Platform/ADController';
import { FeedAcquisitionService, FeedAcquisitionState } from './framework/Platform/FeedAcquisitionService';
import { EnvTool } from './framework/Platform/sdk/EnvTool';
import { SdkUtils } from './framework/Platform/sdk/SdkUtils';
import { soundName } from './gamePrefabMgr';
import { bladeY, KNIFE_STAGES, KnifeClimbRound } from './knifeClimbRules';

const HIT_DURATION = .85;

const { ccclass, property } = _decorator;

@ccclass('knifeClimbFeedGameScene')
export class knifeClimbFeedGameScene extends Component {
    @property(Node) surface: Node = null;
    @property(Node) food: Node = null;
    @property(Node) apple: Node = null;
    @property(Node) watermelon: Node = null;
    @property(Node) world: Node = null;
    @property(Node) flag: Node = null;
    @property(Node) wall: Node = null;
    @property(Node) startHint: Node = null;
    @property(Node) hud: Node = null;
    @property(Node) resultOverlay: Node = null;
    @property(Node) exitOverlay: Node = null;
    @property([SpriteFrame]) hitFrames: SpriteFrame[] = [];
    @property([Node]) blades: Node[] = [];
    @property(Label) countdownLabel: Label = null;
    @property(Label) progressLabel: Label = null;
    @property(Label) timerLabel: Label = null;
    @property(Label) stageLabel: Label = null;
    @property(Label) resultTitle: Label = null;
    @property(Label) resultDetail: Label = null;
    @property(Button) backButton: Button = null;
    @property(Button) slowdownButton: Button = null;
    @property(Button) reviveButton: Button = null;
    @property(Button) nextButton: Button = null;
    @property(Button) replayButton: Button = null;
    @property(Button) homeButton: Button = null;
    @property(Button) continueButton: Button = null;
    @property(Button) exitButton: Button = null;

    round = new KnifeClimbRound();
    private character: Node = null;
    private characterSprite: Sprite = null;
    private normalFrame: SpriteFrame = null;
    private feed = false;
    private entered = true;
    private exited = false;
    private countdownLeft = 3;
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
            [this.exitButton, this.home], [this.homeButton, this.home], [this.reviveButton, this.revive],
            [this.slowdownButton, this.slowdown], [this.replayButton, this.replay], [this.nextButton, this.nextStage],
        ];
        for (const [button, action] of this.buttons) button.node.on(Button.EventType.CLICK, action, this);
        this.surface.on(Node.EventType.TOUCH_START, this.onTap, this);
        game.on(Game.EVENT_HIDE, this.onHide, this);
        game.on(Game.EVENT_SHOW, this.onShow, this);
        this.startStage(1);
        FeedAcquisitionService.addListener(this.feedChanged);
    }

    protected start(): void {
        adc.onEnterGame(this.node);
        if (this.feed) {
            void FeedAcquisitionService.reportSceneReadyAfterStableRender({
                owner: this.node, requiredVisibleNodes: [this.surface, this.character, this.blades[0]],
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
        this.render();
        this.syncAudio(true);
    }

    private onTap(): void {
        if (!this.activate() || this.resultOverlay.active) return;
        if (!this.audioTouchRecovered) {
            this.syncAudio(true);
            this.audioTouchRecovered = true;
        }
        this.round.tap();
        this.render();
    }

    protected update(dt: number): void {
        if (this.paused()) return;
        let step = Number.isFinite(dt) ? Math.max(0, Math.min(.1, dt)) : 0;
        if (this.exited) return;
        if (this.round.phase === 'ready') {
            const warmup = this.entered ? Math.min(this.countdownLeft, step) : step;
            this.round.tick(warmup);
            if (this.entered) {
                this.countdownLeft = Math.max(0, this.countdownLeft - warmup);
                if (this.countdownLeft < 1e-8) this.round.start();
            }
            this.render();
            step -= warmup;
        }
        if (!this.entered || step <= 0) return;
        if (this.resultDelay > 0) {
            this.resultDelay = Math.max(0, this.resultDelay - step);
            if (this.round.hitBladeIndex >= 0) {
                this.round.advanceHitBlade(step);
                this.render();
            }
            if (this.resultDelay === 0) this.showResult();
            return;
        }
        if (this.resultOverlay.active || this.round.phase === 'ready') return;
        const lastLanded = this.round.landed;
        this.round.tick(step);
        this.render();
        if (this.round.landed > lastLanded) AudioManager.playEffect(soundName.pingPongHit);
        if (this.round.phase === 'success') {
            this.resultDelay = .4;
            AudioManager.playEffect(soundName.up);
        } else if (this.round.hitBladeIndex >= 0) {
            this.resultDelay = HIT_DURATION;
        } else if (this.round.phase === 'failure') {
            this.showResult();
        }
    }

    private render(): void {
        const r = this.round;
        this.character.setPosition(r.foodX, r.foodY, 0);
        if (r.hitBladeIndex >= 0) {
            const age = HIT_DURATION - this.resultDelay;
            const red = (age >= .04 && age < .14) || (age >= .21 && age < .32) || (age >= .41 && age < .55);
            this.characterSprite.spriteFrame = red ? this.hitFrames[r.stageNumber - 1] : this.normalFrame;
        }
        this.world.setPosition(0, -r.cameraHeight, 0);
        for (let i = 0; i < this.blades.length; i++) {
            const blade = r.blades[i];
            this.blades[i].active = !!blade && blade.state !== 'hidden' &&
                !(r.hitBladeIndex >= 0 && blade.state === 'waiting');
            if (this.blades[i].active) this.blades[i].setPosition(blade.x, bladeY(i), 0);
        }
        this.timerLabel.string = `操作时间：${Math.ceil(r.timeLeft)}秒`;
        this.progressLabel.string = `已插刀 ${r.lockedCount}/${r.stage.knifeCount}`;
        this.startHint.active = r.phase === 'ready';
        this.countdownLabel.node.active = this.startHint.active && this.entered && !this.exited;
        if (this.countdownLabel.node.active) {
            this.countdownLabel.string = String(Math.max(1, Math.ceil(this.countdownLeft - 1e-8)));
        }
        this.slowdownButton.interactable = !this.paused() && !this.exited && (r.phase === 'ready' || r.phase === 'playing');
        this.reviveButton.node.active = r.phase === 'failure';
        this.nextButton.node.active = r.phase === 'success' && r.stageNumber < KNIFE_STAGES.length;
        for (const button of [this.reviveButton, this.nextButton, this.replayButton, this.homeButton]) {
            button.interactable = !this.adInFlight && !this.leaving && !this.exited;
        }
    }

    private showResult(): void {
        const r = this.round;
        const won = r.phase === 'success';
        this.resultTitle.string = won ? '挑战成功' : '挑战失败';
        const campaignWon = won && r.stageNumber === KNIFE_STAGES.length;
        if (won) this.resultDetail.string = campaignWon ? '三关全部通关' : `${r.stage.name}已登上终点旗台！`;
        else {
            const cause = r.failureReason === 'timeout' ? '时间到啦' : r.failureReason === 'side' ? `刀碰到了${r.stage.name}` : `${r.stage.name}掉下去了`;
            this.resultDetail.string = `${cause}！\n已插刀 ${r.lockedCount}/${r.stage.knifeCount}`;
        }
        this.hud.active = false;
        this.resultOverlay.active = true;
        this.replayButton.node.getComponent(Widget).verticalCenter = (campaignWon ? -270 : -345) / 1334;
        this.homeButton.node.getComponent(Widget).verticalCenter = (campaignWon ? -445 : -510) / 1334;
        this.render();
    }

    private replay(): void {
        if (!this.resultOverlay.active || !this.activate()) return;
        const campaignWon = this.round.phase === 'success' && this.round.stageNumber === KNIFE_STAGES.length;
        this.startStage(campaignWon ? 1 : this.round.stageNumber);
    }

    private nextStage(): void {
        const r = this.round;
        if (!this.resultOverlay.active || r.phase !== 'success' || r.stageNumber >= KNIFE_STAGES.length || !this.activate()) return;
        this.startStage(r.stageNumber + 1);
    }

    private startStage(stageNumber: number): void {
        this.serial++;
        this.resultDelay = 0;
        this.countdownLeft = 3;
        this.round = new KnifeClimbRound(stageNumber);
        const characters = [this.food, this.apple, this.watermelon];
        this.character = characters[stageNumber - 1];
        this.characterSprite = this.character.getComponent(Sprite);
        this.normalFrame = this.characterSprite.spriteFrame;
        for (const character of characters) character.active = character === this.character;
        this.stageLabel.string = `第${stageNumber}关 · ${this.round.stage.name}`;
        this.wall.setPosition(this.wall.position.x, this.round.goalY, 0);
        this.flag.setPosition(this.flag.position.x, this.round.goalY, 0);
        this.resultOverlay.active = false;
        this.exitOverlay.active = false;
        this.hud.active = true;
        this.render();
    }

    private slowdown(): Promise<void> { return this.requestReward('slowdown'); }
    private revive(): Promise<void> { return this.requestReward('revive'); }

    private async requestReward(kind: 'slowdown' | 'revive'): Promise<void> {
        if (!this.activate()) return;
        if (kind === 'revive' ? !this.resultOverlay.active || this.round.phase !== 'failure' : !this.slowdownButton.interactable) return;
        const serial = this.serial;
        this.adInFlight = true;
        this.syncAudio();
        this.render();
        let rewarded = false;
        try {
            rewarded = await SdkUtils.showRewardedVideo();
        } catch (error) {
            console.warn('[KnifeClimb] 激励视频播放失败', error);
        }
        if (this.disposed || this.leaving || serial !== this.serial || !this.node?.isValid) return;
        this.adInFlight = false;
        if (kind === 'revive' && rewarded && this.round.revive()) {
            this.resultOverlay.active = false;
            this.hud.active = true;
        }
        if (kind === 'slowdown' && rewarded) this.round.slowDown();
        if (!rewarded || kind === 'slowdown') {
            const message = rewarded ? '移动速度已降低' : kind === 'revive' ? '完整看完广告才能复活' : '完整看完广告才能减速';
            try {
                EnvTool.getMiniGameApi()?.showToast?.({ title: message, icon: 'none' });
            } catch (error) {
                console.warn('[KnifeClimb] 广告结果提示显示失败', error);
            }
        }
        this.render();
        this.syncAudio();
    }

    private requestExit(): void {
        if (!this.activate() || this.resultOverlay.active || this.resultDelay > 0) return;
        this.exitOverlay.active = true;
        this.syncAudio();
    }

    private cancelExit(): void {
        if (this.leaving || this.disposed) return;
        this.exitOverlay.active = false;
        this.render();
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
            console.error('[KnifeClimb] 返回主页失败', error);
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
