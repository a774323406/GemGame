# 原版无尽模式依据（2026-10-04）

离线输入：用户历史 drift 聊天提供的 pasted-text.txt，以及 Downloads/poki.com.har。临时目录已消失，本次从原附件重新恢复 asm.js、memory 和 Unity 资源。未访问线上服务。

- RoadCreator `.cctor` → Yyl：ROAD_COUNT_IN_TRANSITION=10，POOL_COUNT=20，SCALE_DOWN_LEVEL=3。
- GameSettings（Unity MonoBehaviour path ID870，872字节）：RoadLevelColors 数量8，offset480；每项40字节。PointToChange 为0、10、25、45、70、110、160、220；背景色亦直接提取。
- SpawnWithType → Sul：非 transition 的弯道使 PointCount 增长，PointCount 大于下一主题阈值且普通道路已生成至少6段时进入 transition；先补1段直道，然后10段过渡直道；第1段标记 Begin、第7段 Mid、第10段 End。
- Car TransitionStart → zZj：additionalVelocity=4；TransitionMid → FZj：additionalVelocity=1、additionalTurn=2；TransitionEnd → GZj：additionalTurn=1、isInTransition=false。
- Car.FixedUpdate → jXj：过渡阶段沿起点射线追随速度并修正横向偏移；GameSettings 序列化 LevelUpTransitionCorrectionSpeed=10。
- RoadCreator PickARandomRoad → Uul：受趋势/直路/回头弯状态控制；BackTurn 分支调用 SwitchRoadLevel → uvl 切换 isRoadHigh。CheckToCreateNewRoad → Pwl 在接近 activeRoads 尾部10段范围时续路，并回收前部路。

迁移边界：继续使用当前 Cocos 的 R300/600道路图与拉索物理。过渡映射为600单位直道，6段爆冲+3段恢复区；回头弯映射已有180度图并切换层，不宣称随机道路序列或高架素材与 Unity 逐像素相同。为避免当前固定朝向视野内弹出，增加按屏幕矩形提前续路、屏外回收和完整爆冲走廊安全检查。镜头无旋转/缩放，仅碰撞短震动。
