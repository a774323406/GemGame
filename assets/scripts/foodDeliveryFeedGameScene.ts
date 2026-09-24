import {
    _decorator,
    Button,
    Component,
    EventTouch,
    game,
    Game,
    input,
    Input,
    Label,
    Node,
    ResolutionPolicy,
    UITransform,
    Vec2,
    Vec3,
    view,
} from 'cc';
import AudioManager from './framework/AudioManager';
import { GameSceneBundle, GameSceneName } from './framework/GameSceneBundle';
import { adc } from './framework/Platform/ADController';
import {
    FeedAcquisitionService,
    FeedAcquisitionState,
} from './framework/Platform/FeedAcquisitionService';
import { EnvTool } from './framework/Platform/sdk/EnvTool';
import { SdkUtils } from './framework/Platform/sdk/SdkUtils';
import { soundName } from './gamePrefabMgr';
import {
    DeliveryEvent,
    DeliveryTarget,
    DeliveryWorld,
    FOOD_KINDS,
    FoodDeliveryRound,
    Point,
    Rect,
} from './foodDeliveryRules';

const { ccclass, property } = _decorator;
const DESIGN_WIDTH = 750;
const DESIGN_HEIGHT = 1624;
const DUPLICATE_TOUCH_MS = 80;

type NativeTouch = {
    identifier?: number;
    clientX: number;
    clientY: number;
};

type NativeTouchEvent = {
    touches?: NativeTouch[];
    changedTouches?: NativeTouch[];
};

/** Fixed artwork and UI are serialized in FoodDeliveryFeedGameScene.scene. */
@ccclass('foodDeliveryFeedGameScene')
export class foodDeliveryFeedGameScene extends Component {
    @property({ tooltip: '手臂每秒旋转角度' }) public rotationSpeed = 480;
    @property({ tooltip: '每次完整观看激励广告后的旋转速度倍率' }) public slowdownRatio = 0.72;
    @property({ tooltip: '每局可失误次数' }) public initialChances = 3;
    @property({ tooltip: '投掷初速度' }) public speed = 1750;
    @property({ tooltip: '重力加速度' }) public gravity = 1600;
    @property({ tooltip: '食物碰撞半径' }) public radius = 8;
    @property({ tooltip: '最长飞行时间（秒）' }) public maxFlightSeconds = 4;

    @property(Node) public background: Node = null;
    @property(Node) public gameplayRoot: Node = null;
    @property(Node) public courier: Node = null;
    @property(Node) public armPivot: Node = null;
    @property(Node) public muzzle: Node = null;
    @property(Node) public guard: Node = null;
    @property(Node) public guardHitArea: Node = null;
    @property(Node) public wallHitArea: Node = null;
    @property(Node) public groundMarker: Node = null;
    @property(Node) public resultOverlay: Node = null;
    @property(Node) public successContent: Node = null;
    @property(Node) public failureContent: Node = null;
    @property(Node) public successTitle: Node = null;
    @property(Node) public failureTitle: Node = null;
    @property(Label) public chanceLabel: Label = null;

    @property([Node]) public targets: Node[] = [];
    @property([Node]) public orderSprites: Node[] = [];
    @property([Node]) public checks: Node[] = [];
    @property([Node]) public stars: Node[] = [];
    @property([Node]) public pendingFoods: Node[] = [];
    @property([Node]) public flyingFoods: Node[] = [];
    @property([Node]) public aimDots: Node[] = [];

    @property(Button) public backButton: Button = null;
    @property(Button) public slowdownButton: Button = null;
    @property(Button) public homeButton: Button = null;
    @property(Button) public retryButton: Button = null;
    @property(Button) public nextButton: Button = null;

    public round: FoodDeliveryRound = null;

    private disposed = false;
    private leaving = false;
    private appHidden = false;
    private feedExited = false;
    private feedMode = false;
    private feedFinished = false;
    private interstitialScheduled = false;
    private audioInitialized = false;
    private feedAudioForeground = false;
    private roundSerial = 0;
    private lastAcceptedTouchMs = -Infinity;
    private deliveredDelay = 0;
    private resultDelay = 0;
    private rotationSpeedMultiplier = 1;
    private adInFlight = false;
    private authoredArmAngle = 0;
    private authoredBackgroundScale = new Vec3(1, 1, 1);
    private authoredGameplayScale = new Vec3(1, 1, 1);
    private orderScales: Vec3[] = [];
    private bindings: Array<[Button, () => void]> = [];
    private nativeTouchApi: any = null;
    private nativeTouchBound = false;

    protected onLoad(): void {
        view.setDesignResolutionSize(DESIGN_WIDTH, DESIGN_HEIGHT, ResolutionPolicy.FIXED_WIDTH);
        this.validateBindings();
        this.authoredArmAngle = this.armPivot.angle;
        this.authoredBackgroundScale.set(this.background.scale);
        this.authoredGameplayScale.set(this.gameplayRoot.scale);
        this.orderScales = this.orderSprites.map((node) => node.scale.clone());
        this.fitGameplayRoot();
        view.on('canvas-resize', this.fitGameplayRoot, this);

        this.round = new FoodDeliveryRound(this.buildWorld(), {
            speed: this.speed,
            gravity: this.gravity,
            radius: this.radius,
            maxFlightSeconds: this.maxFlightSeconds,
        }, undefined, this.initialChances);

        FeedAcquisitionService.init();
        const state = FeedAcquisitionService.getState();
        this.feedMode = state.active;
        this.feedExited = state.active && state.exited;
        this.bindings = [
            [this.backButton, this.onBack],
            [this.slowdownButton, this.onSlowdown],
            [this.homeButton, this.onHome],
            [this.retryButton, this.onRetry],
            [this.nextButton, this.onNext],
        ];
        for (const [button, callback] of this.bindings) {
            button.node.on(Button.EventType.CLICK, callback, this);
        }
        input.on(Input.EventType.TOUCH_START, this.onTouchStart, this);
        game.on(Game.EVENT_HIDE, this.onHide, this);
        game.on(Game.EVENT_SHOW, this.onShow, this);
        this.resetRound(true);
    }

    protected start(): void {
        this.bindNativeTouchFallback();
        if (this.feedMode) {
            FeedAcquisitionService.addListener(this.onFeedState);
            void FeedAcquisitionService.reportSceneReadyAfterStableRender({
                owner: this.node,
                requiredVisibleNodes: [this.background, this.courier, this.guard, ...this.orderSprites],
                isReady: () => !this.disposed && !this.leaving && !this.feedExited,
                stableFrameCount: 3,
                surfaceDelayMs: 180,
            }).catch((error) => console.error('[foodDeliveryFeedGameScene] 推荐流就绪上报失败', error));
        } else {
            this.ensureAudio(false);
        }
    }

    protected update(deltaTime: number): void {
        if (this.disposed || this.leaving || this.appHidden || this.feedExited) return;
        const dt = Math.max(0, Math.min(0.1, Number.isFinite(deltaTime) ? deltaTime : 0));
        if (dt <= 0) return;

        if (this.round.phase === 'aiming' && !this.resultOverlay.active
            && !this.adInFlight && !SdkUtils.isRewardedVideoBusy()) {
            const speed = this.rotationSpeed * this.rotationSpeedMultiplier;
            this.armPivot.angle = (this.armPivot.angle + speed * dt) % 360;
        }

        if (!this.canInteract()) {
            this.refreshVisuals();
            return;
        }

        if (this.round.phase === 'flying') {
            const events = this.round.tick(dt);
            this.handleEvents(events);
        } else if (this.round.phase === 'delivered') {
            this.deliveredDelay = Math.max(0, this.deliveredDelay - dt);
            if (this.deliveredDelay === 0) this.round.advanceOrder();
        } else if ((this.round.phase === 'won' || this.round.phase === 'failed') && !this.resultOverlay.active) {
            this.resultDelay = Math.max(0, this.resultDelay - dt);
            if (this.resultDelay === 0) this.showResult();
        }
        this.refreshVisuals();
    }

    protected onDestroy(): void {
        this.disposed = true;
        this.roundSerial += 1;
        this.unscheduleAllCallbacks();
        input.off(Input.EventType.TOUCH_START, this.onTouchStart, this);
        game.off(Game.EVENT_HIDE, this.onHide, this);
        game.off(Game.EVENT_SHOW, this.onShow, this);
        view.off('canvas-resize', this.fitGameplayRoot, this);
        for (const [button, callback] of this.bindings) {
            const node = button?.node;
            if (node?.isValid) node.off(Button.EventType.CLICK, callback, this);
        }
        this.bindings = [];
        this.unbindNativeTouchFallback();
        this.finishFeed();
    }

    public onTouchStart = (event: EventTouch): void => {
        if (this.disposed || this.leaving) return;
        this.tryThrow(this.isButtonTouch(event), Date.now());
    };

    public onNativeTouchStart = (event: NativeTouchEvent): void => {
        if (this.disposed || this.leaving) return;
        this.tryThrow(this.isNativeButtonTouch(event), Date.now());
    };

    public tryThrow(isButton: boolean, nowMs: number): boolean {
        if (this.disposed || this.leaving || this.appHidden || this.resultOverlay.active || this.adInFlight
            || SdkUtils.isRewardedVideoBusy()) return false;

        const beforeActivation = FeedAcquisitionService.getState();
        if (beforeActivation.active && beforeActivation.exited) return false;
        if (beforeActivation.active) FeedAcquisitionService.activateFromFirstTouch();
        const state = FeedAcquisitionService.getState();
        this.feedMode = state.active;
        this.feedExited = state.active && state.exited;
        if (state.active && (!state.entered || state.exited)) return false;
        if (isButton) {
            this.refreshButtons();
            return false;
        }
        if (!Number.isFinite(nowMs) || nowMs - this.lastAcceptedTouchMs < DUPLICATE_TOUCH_MS) return false;

        const gameplayTransform = this.gameplayRoot.getComponent(UITransform);
        const origin = gameplayTransform.convertToNodeSpaceAR(this.muzzle.worldPosition);
        const shoulder = gameplayTransform.convertToNodeSpaceAR(this.armPivot.worldPosition);
        const angle = Math.atan2(origin.y - shoulder.y, origin.x - shoulder.x) * 180 / Math.PI;
        if (!this.round.shoot(angle, { x: origin.x, y: origin.y })) return false;

        this.lastAcceptedTouchMs = nowMs;
        if (!this.feedAudioForeground) this.ensureAudio(true);
        AudioManager.playEffect(soundName.down);
        this.refreshVisuals();
        return true;
    }

    public onFeedState = (state: FeedAcquisitionState): void => {
        if (this.disposed || this.leaving) return;
        this.feedMode = state.active;
        this.feedExited = state.active && state.exited;
        if (!state.active || !state.entered || state.exited) {
            adc.cancelFeedEntryInterstitial();
            this.interstitialScheduled = false;
            if (state.exited && this.feedAudioForeground) {
                this.feedAudioForeground = false;
                AudioManager.pauseBgmForVideo();
            }
            this.refreshButtons();
            return;
        }

        if (!this.feedAudioForeground) this.ensureAudio(true);
        if (!this.interstitialScheduled) {
            this.interstitialScheduled = true;
            adc.scheduleFeedEntryInterstitial(() => {
                const current = FeedAcquisitionService.getState();
                return !this.disposed && !this.leaving && !this.feedFinished && !!this.node?.isValid
                    && current.active && current.entered && !current.exited;
            });
        }
        this.refreshButtons();
    };

    public onHide = (): void => {
        this.appHidden = true;
        if (this.feedAudioForeground || this.audioInitialized) AudioManager.pauseBgmForVideo();
        this.feedAudioForeground = false;
    };

    public onShow = (): void => {
        this.appHidden = false;
        if (this.canInteract() && !this.feedAudioForeground && !SdkUtils.isRewardedVideoBusy()) {
            this.ensureAudio(true);
        }
        this.refreshButtons();
    };

    public resetRound(reuseOrder = true): void {
        if (this.disposed || this.leaving || !this.round) return;
        this.roundSerial += 1;
        this.round.reset(reuseOrder);
        this.lastAcceptedTouchMs = -Infinity;
        this.deliveredDelay = 0;
        this.resultDelay = 0;
        this.rotationSpeedMultiplier = 1;
        this.adInFlight = false;
        this.armPivot.angle = this.authoredArmAngle;
        this.resultOverlay.active = false;
        this.successContent.active = false;
        this.failureContent.active = false;
        this.successTitle.active = false;
        this.failureTitle.active = false;
        this.orderSprites.forEach((node, index) => node.setScale(this.orderScales[index]));
        this.refreshVisuals();
        this.refreshButtons();
    }

    public refreshVisuals(): void {
        if (!this.round) return;
        const projectile = this.round.projectile;
        this.pendingFoods.forEach((node, index) => {
            node.active = this.round.phase === 'aiming' && FOOD_KINDS[index] === this.round.currentFood;
        });
        this.flyingFoods.forEach((node, index) => {
            node.active = !!projectile && FOOD_KINDS[index] === projectile.food && this.round.phase === 'flying';
            if (node.active) node.setPosition(projectile.x, projectile.y, 0);
        });
        this.checks.forEach((node, index) => {
            node.active = this.round.completed.has(FOOD_KINDS[index]);
        });
        this.stars.forEach((node, index) => {
            node.active = index < this.round.score;
        });
        this.orderSprites.forEach((node, index) => {
            const base = this.orderScales[index];
            const multiplier = this.round.completed.has(FOOD_KINDS[index]) ? 0.92 : 1;
            node.setScale(base.x * multiplier, base.y * multiplier, base.z);
        });
        this.aimDots.forEach((node) => {
            node.active = this.round.phase === 'aiming' && !this.resultOverlay.active;
        });
        this.chanceLabel.string = `机会 ×${this.round.chancesRemaining}`;
        this.successTitle.active = this.round.phase === 'won';
        this.failureTitle.active = this.round.phase === 'failed';
        this.successContent.active = this.round.phase === 'won';
        this.failureContent.active = this.round.phase === 'failed';
        this.refreshButtons();
    }

    public validateBindings(): void {
        const required = [
            'background', 'gameplayRoot', 'courier', 'armPivot', 'muzzle', 'guard',
            'guardHitArea', 'wallHitArea', 'groundMarker', 'resultOverlay', 'successContent',
            'failureContent', 'successTitle', 'failureTitle', 'chanceLabel', 'backButton',
            'slowdownButton', 'homeButton',
            'retryButton', 'nextButton',
        ];
        const missing = required.filter((key) => !this[key]);
        for (const [key, expected] of [
            ['targets', 5], ['orderSprites', 5], ['checks', 5], ['stars', 5],
            ['pendingFoods', 5], ['flyingFoods', 5], ['aimDots', 12],
        ] as Array<[string, number]>) {
            const values = this[key] as Node[];
            if (!Array.isArray(values) || values.length !== expected || values.some((node) => !node)) {
                missing.push(`${key} (${expected})`);
            }
        }
        if (missing.length) {
            throw new Error(`[foodDeliveryFeedGameScene] 场景绑定不完整: ${missing.join(', ')}`);
        }
    }

    private fitGameplayRoot(): void {
        const visible = view.getVisibleSize();
        const backgroundScale = Math.max(visible.width / DESIGN_WIDTH, visible.height / DESIGN_HEIGHT);
        this.background.setScale(
            this.authoredBackgroundScale.x * backgroundScale,
            this.authoredBackgroundScale.y * backgroundScale,
            this.authoredBackgroundScale.z,
        );
        const scale = Math.min(1, visible.width / DESIGN_WIDTH, visible.height / DESIGN_HEIGHT);
        this.gameplayRoot.setScale(
            this.authoredGameplayScale.x * scale,
            this.authoredGameplayScale.y * scale,
            this.authoredGameplayScale.z,
        );
    }

    private buildWorld(): DeliveryWorld {
        const targets: DeliveryTarget[] = this.targets.map((node, index) => ({
            food: FOOD_KINDS[index],
            ...this.rectInGameplay(node),
        }));
        const ground = this.pointInGameplay(this.groundMarker.worldPosition);
        return {
            targets,
            guard: this.rectInGameplay(this.guardHitArea),
            wall: this.rectInGameplay(this.wallHitArea),
            bounds: this.rectInGameplay(this.gameplayRoot),
            groundY: ground.y,
        };
    }

    private rectInGameplay(node: Node): Rect {
        const transform = node.getComponent(UITransform);
        if (!transform) throw new Error(`[foodDeliveryFeedGameScene] ${node.name} 缺少 UITransform`);
        const corners = [
            new Vec3(-transform.width * transform.anchorX, -transform.height * transform.anchorY),
            new Vec3(transform.width * (1 - transform.anchorX), -transform.height * transform.anchorY),
            new Vec3(-transform.width * transform.anchorX, transform.height * (1 - transform.anchorY)),
            new Vec3(transform.width * (1 - transform.anchorX), transform.height * (1 - transform.anchorY)),
        ].map((corner) => this.pointInGameplay(transform.convertToWorldSpaceAR(corner)));
        const xs = corners.map((corner) => corner.x);
        const ys = corners.map((corner) => corner.y);
        const left = Math.min(...xs);
        const right = Math.max(...xs);
        const bottom = Math.min(...ys);
        const top = Math.max(...ys);
        return { x: left, y: bottom, width: right - left, height: top - bottom };
    }

    private pointInGameplay(worldPoint: Vec3): Point {
        const point = this.gameplayRoot.getComponent(UITransform).convertToNodeSpaceAR(worldPoint);
        return { x: point.x, y: point.y };
    }

    private handleEvents(events: DeliveryEvent[]): void {
        for (const event of events) {
            if (event.type === 'delivered') {
                this.deliveredDelay = 0.22;
                AudioManager.playEffect(soundName.up);
            } else if (event.type === 'won') {
                this.resultDelay = 0.3;
            } else if (event.type === 'missed') {
                AudioManager.playEffect(soundName.fail);
            } else if (event.type === 'failed') {
                this.resultDelay = 0.3;
                AudioManager.playEffect(soundName.fail);
            }
        }
    }

    private showResult(): void {
        this.resultOverlay.active = true;
        this.successTitle.active = this.round.phase === 'won';
        this.failureTitle.active = this.round.phase === 'failed';
        this.successContent.active = this.round.phase === 'won';
        this.failureContent.active = this.round.phase === 'failed';
        this.refreshButtons();
    }

    private canInteract(): boolean {
        if (this.disposed || this.leaving || this.appHidden || this.feedExited || this.adInFlight
            || this.resultOverlay.active || SdkUtils.isRewardedVideoBusy()) return false;
        const state = FeedAcquisitionService.getState();
        return !state.active || (state.entered && !state.exited);
    }

    private isButtonTouch(event: EventTouch): boolean {
        return this.bindings.some(([button]) => {
            const node = button?.node;
            return !!node?.isValid && node.activeInHierarchy
                && !!node.getComponent(UITransform)?.hitTest(event.getLocation(), event.windowId);
        });
    }

    private isNativeButtonTouch(event: NativeTouchEvent): boolean {
        const touch = event?.touches?.[0] ?? event?.changedTouches?.[0];
        if (!touch || !Number.isFinite(touch.clientX) || !Number.isFinite(touch.clientY)) return true;
        let height = view.getVisibleSize().height;
        let pixelRatio = 1;
        try {
            const info = this.nativeTouchApi?.getSystemInfoSync?.();
            const reportedPixelRatio = Number(info?.pixelRatio);
            if (reportedPixelRatio > 0) pixelRatio = reportedPixelRatio;
            const reported = Number(info?.windowHeight ?? info?.screenHeight);
            if (reported > 0) height = reported * pixelRatio;
        } catch {
            // Keep the Cocos visible height.
        }
        const point = new Vec2(touch.clientX * pixelRatio, height - touch.clientY * pixelRatio);
        return this.bindings.some(([button]) => {
            const node = button?.node;
            return !!node?.isValid && node.activeInHierarchy && !!node.getComponent(UITransform)?.hitTest(point, 0);
        });
    }

    private bindNativeTouchFallback(): void {
        if (this.nativeTouchBound || !EnvTool.isByteDance()) return;
        try {
            const api = typeof tt !== 'undefined' ? tt : null;
            if (!api || typeof api.onTouchStart !== 'function') return;
            api.onTouchStart(this.onNativeTouchStart);
            this.nativeTouchApi = api;
            this.nativeTouchBound = true;
        } catch (error) {
            console.warn('[foodDeliveryFeedGameScene] 真机原生触摸兜底注册失败', error);
        }
    }

    private unbindNativeTouchFallback(): void {
        if (!this.nativeTouchBound || !this.nativeTouchApi) return;
        try {
            this.nativeTouchApi.offTouchStart?.(this.onNativeTouchStart);
        } catch (error) {
            console.warn('[foodDeliveryFeedGameScene] 真机原生触摸兜底解绑失败', error);
        }
        this.nativeTouchApi = null;
        this.nativeTouchBound = false;
    }

    private ensureAudio(restart: boolean): void {
        if (this.appHidden || this.disposed || this.leaving || SdkUtils.isRewardedVideoBusy()) return;
        if (!this.audioInitialized) {
            this.audioInitialized = true;
            AudioManager.setSoundEvent();
        }
        if (restart) AudioManager.restartMusic(soundName.getUserBgm);
        else AudioManager.playMusic(soundName.getUserBgm);
        this.feedAudioForeground = true;
    }

    private refreshButtons(): void {
        const enabled = !this.disposed && !this.leaving;
        const showResult = !!this.round && this.resultOverlay.active;
        const feedState = FeedAcquisitionService.getState();
        const awaitingFirstFeedGesture = !this.appHidden && feedState.active
            && !feedState.entered && !feedState.exited && !SdkUtils.isRewardedVideoBusy();
        this.homeButton.node.active = showResult;
        this.retryButton.node.active = showResult && this.round.phase === 'failed';
        this.nextButton.node.active = showResult && this.round.phase === 'won';
        this.slowdownButton.node.active = !showResult;
        this.backButton.interactable = enabled;
        this.slowdownButton.interactable = enabled && !this.adInFlight
            && !!this.round && this.round.phase === 'aiming'
            && (this.canInteract() || awaitingFirstFeedGesture);
        this.homeButton.interactable = enabled;
        this.retryButton.interactable = enabled;
        this.nextButton.interactable = enabled && this.round?.phase === 'won';
    }

    private onBack = (): void => {
        AudioManager.playEffect(soundName.buttonClick);
        void this.returnHome();
    };

    private onSlowdown = (): void => {
        const state = FeedAcquisitionService.getState();
        if (state.active && !state.entered && !state.exited) {
            FeedAcquisitionService.activateFromFirstTouch();
            const activated = FeedAcquisitionService.getState();
            this.feedMode = activated.active;
            this.feedExited = activated.active && activated.exited;
            this.refreshButtons();
        }
        void this.requestSlowdown();
    };

    private async requestSlowdown(): Promise<void> {
        if (this.adInFlight || !this.slowdownButton?.interactable || !this.canInteract()
            || this.round?.phase !== 'aiming') return;

        AudioManager.playEffect(soundName.buttonClick);
        const serial = this.roundSerial;
        this.adInFlight = true;
        this.refreshButtons();
        let rewarded = false;
        try {
            rewarded = await SdkUtils.showRewardedVideo();
        } catch (error) {
            console.warn('[foodDeliveryFeedGameScene] 降速激励视频失败', error);
        }
        if (this.disposed || this.leaving || !this.node?.isValid || serial !== this.roundSerial) return;

        this.adInFlight = false;
        if (rewarded) {
            this.rotationSpeedMultiplier *= this.slowdownRatio;
            this.showDouyinToast('旋转速度已降低');
        } else {
            this.showDouyinToast('完整看完广告才能降速');
        }
        this.refreshButtons();
    }

    private showDouyinToast(title: string): void {
        try {
            const api = typeof tt !== 'undefined' ? tt : null;
            if (typeof api?.showToast === 'function') api.showToast({ title, icon: 'none' });
            else console.log(`[foodDeliveryFeedGameScene] ${title}`);
        } catch {
            console.log(`[foodDeliveryFeedGameScene] ${title}`);
        }
    }

    private onHome = (): void => {
        AudioManager.playEffect(soundName.buttonClick);
        void this.returnHome();
    };

    private onRetry = (): void => {
        AudioManager.playEffect(soundName.buttonClick);
        this.resetRound(true);
    };

    private onNext = (): void => {
        AudioManager.playEffect(soundName.buttonClick);
        if (this.round.phase === 'won') this.resetRound(false);
    };

    public returnHome = async (): Promise<void> => {
        if (this.disposed || this.leaving) return;
        this.leaving = true;
        this.refreshButtons();
        adc.cancelFeedEntryInterstitial();
        this.interstitialScheduled = false;
        AudioManager.playDefaultBgm();
        try {
            await GameSceneBundle.loadScene(GameSceneName.Main);
            this.finishFeed();
        } catch (error) {
            if (this.disposed || !this.node?.isValid) return;
            this.leaving = false;
            const state = FeedAcquisitionService.getState();
            if (this.feedMode) this.onFeedState(state);
            if (!this.feedAudioForeground) this.ensureAudio(true);
            this.refreshButtons();
            console.error('[foodDeliveryFeedGameScene] 返回主页失败', error);
        }
    };

    private finishFeed(): void {
        adc.cancelFeedEntryInterstitial();
        this.interstitialScheduled = false;
        FeedAcquisitionService.removeListener(this.onFeedState);
        if (!this.feedMode || this.feedFinished) return;
        this.feedFinished = true;
        FeedAcquisitionService.completeSession();
    }
}
