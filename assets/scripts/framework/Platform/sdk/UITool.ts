import { Node, ProgressBar, Tween, UIOpacity, Vec3, clamp01, easing, tween, v3 } from "cc";

export class UITool {
  public static SetProgressBar(node: Node, progress: number | string) {
    if (!node) {
      console.warn(`!!! SetProgressBar node = null`);
      return;
    }
    let com = node.getComponent(ProgressBar);
    if (!com) {
      console.warn(`node ${node.name} 没有ProgressBar组件`);
      return;
    }
    let _progress = progress;
    if (typeof _progress != "number") {
      _progress = Number(progress);
      if (!_progress) {
        return console.error("progress = ", progress, "(SetProgressBar参数类型错误)");
      }
    }

    node.getComponent(ProgressBar)!.progress = clamp01(_progress);
  }

  public static TweenProgress(node: Node, progress: number | string, timeS: number = 0.1) {
    if (!node) {
      console.warn(`!!! SetProgressBar node = null`);
      return;
    }
    let com = node.getComponent(ProgressBar);
    if (!com) {
      console.warn(`node ${node.name} 没有ProgressBar组件`);
      return;
    }
    let _progress = progress;
    if (typeof _progress != "number") {
      _progress = Number(progress);
      if (!_progress) {
        return console.error("progress = ", progress, "(SetProgressBar参数类型错误)");
      }
    }

    tween(com)
      .to(timeS, { progress: clamp01(_progress) })
      .start();
  }

  public static DoShake(node: Node, timeS: number = 0.1, angle: number = 4) {
    if (!node) {
      return;
    }
    tween(node).to(timeS, { angle: -angle }).to(timeS, { angle: angle }).union().repeatForever().start();
  }

  public static DoShakeWithTimes(node: Node, times: number = 3, timeS: number = 0.05, angle: number = 3) {
    if (!node) {
      return;
    }
    tween(node).to(timeS, { angle: -angle }).to(timeS, { angle: angle }).to(timeS, { angle: 0 }).union().repeat(times).start();
  }

  public static StopNodeTween(node: Node) {
    Tween.stopAllByTarget(node);
  }

  public static DoScale(node: Node, callback: Function | undefined = undefined, delayTime: number = 0.1, times: number = 1) {
    if (!node || !node.isValid) {
      return;
    }

    UITool.StopNodeTween(node);
    tween(node)
      .to(delayTime, { scale: v3(1.1, 1.1, 1.1) })
      .to(delayTime, { scale: Vec3.ONE })
      .union()
      .repeat(times)
      .call(() => {
        callback && callback();
      })
      .start();
  }

  public static DoBreath(node: Node, timeS: number = 0.5, toScale?: number) {
    let scaleVec = toScale ? v3(toScale, toScale, toScale) : v3(1.1, 1.1, 1.1);
    tween(node).to(timeS, { scale: scaleVec }).to(timeS, { scale: Vec3.ONE }).union().repeatForever().start();
  }

  public static DoFloat(node: Node, timeS: number = 1, floatY = 10) {
    let pos = node.position;
    let pos1 = v3(pos.x, pos.y + floatY, 0);
    let pos2 = v3(pos.x, pos.y, 0);
    tween(node)
      .to(timeS * 2, { position: pos1 }, { easing: easing.sineOut })
      .to(timeS * 2, { position: pos2 }, { easing: easing.sineOut })
      .union()
      .repeatForever()
      .start();
  }

  public static shakeWithTimes(node: Node, timeS: number = 0.1, times: number = 5, callback?: Function, angle: number = 4) {
    if (!node) {
      return;
    }
    let originalAngle = node.angle;
    tween(node)
      .to(timeS, { angle: -angle })
      .to(timeS, { angle: angle })
      .union()
      .repeat(times)
      .to(timeS, { angle: originalAngle })
      .call(() => {
        callback && callback();
      })
      .start();
  }

  public static fadeFromTo(node: Node, opacity1: number, opacity2: number, duration: number, callback?: Function) {
    const opacityComp = node.getComponent(UIOpacity) ? node.getComponent(UIOpacity) : node.addComponent(UIOpacity);
    if (opacityComp) {
      opacityComp.opacity = opacity1;
      Tween.stopAllByTarget(opacityComp);
      tween(opacityComp)
        .to(duration, { opacity: opacity2 })
        .call(() => {
          if (callback) {
            callback();
          }
        })
        .start();
    }
  }

  // /**
  //  * 设置进度条
  //  * @param node 需要设置的节点
  //  * @param progress 进度百分比，0～1之间
  //  */
  public static tweenProgressBar(node: Node, progress: number | string) {
    if (!node) {
      console.warn(`!!! SetProgressBar node = null`);
      return;
    }
    let com = node.getComponent(ProgressBar);
    if (!com) {
      console.warn(`node ${node.name} 没有ProgressBar组件`);
      return;
    }
    let _progress = progress;
    if (typeof _progress != "number") {
      _progress = Number(progress);
      if (!_progress) {
        return console.error("progress = ", progress, "(SetProgressBar参数类型错误)");
      }
    }

    // if (_progress > 1 || _progress < 0) {
    // console.warn("progress = ", progress, "（progress不在0～1之间，请核对progress值是否正确）");
    // }
    let pb = node.getComponent(ProgressBar)!;
    this.StopNodeTween(node);
    tween(pb)
      .to(0.3, {
        progress: clamp01(_progress),
      })
      .start();
  }
}
