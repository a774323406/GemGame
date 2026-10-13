import { _decorator, Component, Node, UIOpacity, game } from "cc";

const { ccclass } = _decorator;

/**
 * 加速路的三箭头流光。
 *
 * 参考表现里的箭头固定在路面上，通过从车尾到车头依次增强透明度形成向前流动感；
 * 节点本身不沿路移动，避免箭头看起来浮在赛道上。
 */
@ccclass("SpeedArrowEffect")
export class SpeedArrowEffect extends Component {
  private readonly arrows: Node[] = [];
  private readonly opacities: UIOpacity[] = [];
  private phaseOffset = 0;

  protected onLoad(): void {
    this.arrows.length = 0;
    this.opacities.length = 0;

    for (const name of ["Arrow1", "Arrow2", "Arrow3"]) {
      const arrow = this.node.getChildByName(name);
      if (!arrow) {
        continue;
      }
      this.arrows.push(arrow);
      this.opacities.push(arrow.getComponent(UIOpacity) || arrow.addComponent(UIOpacity));
    }

    this.applyAnimationFrame();
  }

  /** 相邻格子错开少量相位，使整条加速路的亮度波纹保持连续。 */
  public setPhaseOffset(value: number): void {
    this.phaseOffset = Number.isFinite(value) ? value : 0;
    this.applyAnimationFrame();
  }

  protected update(deltaTime: number): void {
    this.applyAnimationFrame();
  }

  private applyAnimationFrame(): void {
    const cycleSeconds = 0.68;
    // Streaming groups and pooled groups share one clock, preserving the original spatial wave.
    const basePhase = game.totalTime / 1000 / cycleSeconds + this.phaseOffset;

    this.arrows.forEach((arrow, index) => {
      // Arrow1 位于车尾方向、Arrow3 位于前方。负的索引偏移让高亮依次向前传播。
      const phase = this.wrap01(basePhase - index * 0.22);
      const distanceToPulse = Math.min(
        Math.abs(phase - 0.28),
        1 - Math.abs(phase - 0.28),
      );
      const normalized = Math.max(0, 1 - distanceToPulse / 0.34);
      const pulse = normalized * normalized * (3 - normalized * 2);

      this.opacities[index].opacity = Math.round(62 + pulse * 193);
      const scale = 0.92 + pulse * 0.1;
      arrow.setScale(scale, scale, 1);
    });
  }

  private wrap01(value: number): number {
    return ((value % 1) + 1) % 1;
  }
}

export default SpeedArrowEffect;
