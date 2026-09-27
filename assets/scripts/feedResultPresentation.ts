import { _decorator, Component, Label, Node, Sprite, SpriteFrame, Widget } from 'cc';
const { ccclass, property } = _decorator;

/** Presentation only: no gameplay, rewards, navigation or ad state changes. */
@ccclass('FeedResultPresentation')
export class FeedResultPresentation extends Component {
  @property([Label]) titles: Label[] = [];
  @property([Sprite]) artworks: Sprite[] = [];
  @property(SpriteFrame) successFrame: SpriteFrame = null;
  @property(SpriteFrame) failureFrame: SpriteFrame = null;
  @property([Node]) gameplayHud: Node[] = [];
  @property([Widget]) successButtons: Widget[] = [];
  @property({ min: 0, max: 0.2 }) successLift = 0;
  private buttonPositions: number[] = [];
  private previousHud: Array<{ node: Node; active: boolean }> = [];

  protected onEnable(): void {
    this.buttonPositions = this.successButtons.map(widget => widget.verticalCenter);
    this.previousHud = this.gameplayHud.filter(node => node?.isValid)
      .map(node => ({ node, active: node.active }));
    for (const { node } of this.previousHud) node.active = false;
    // Some controllers activate the overlay before assigning its result text.
    this.scheduleOnce(this.syncTitle, 0);
  }

  private syncTitle = (): void => {
    const success = this.titles.some(title => title?.string.includes('成功'));
    this.successButtons.forEach((widget, index) => {
      widget.verticalCenter = this.buttonPositions[index] + (success ? this.successLift : 0);
      widget.updateAlignment();
    });
    this.titles.forEach((title, index) => {
      const artwork = this.artworks[index];
      if (!title || !artwork) return;
      const frame = title.string.includes('成功') ? this.successFrame
        : title.string.includes('失败') ? this.failureFrame : null;
      artwork.node.active = !!frame;
      if (frame) artwork.spriteFrame = frame;
      title.enabled = !frame; // Pause and other contextual headings stay live text.
    });
  };

  protected onDisable(): void {
    this.unscheduleAllCallbacks();
    this.successButtons.forEach((widget,index) => { widget.verticalCenter = this.buttonPositions[index]; widget.updateAlignment(); });
    for (const { node, active } of this.previousHud) if (node.isValid) node.active = active;
    this.previousHud = [];
  }
}
