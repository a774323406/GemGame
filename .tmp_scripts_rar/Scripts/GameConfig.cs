using UnityEngine;
using DG.Tweening;

namespace GemSortingPuzzle
{
    /// <summary>
    /// Global config (ScriptableObject) for all tunable gameplay/UI timings and initial values.
    /// Read pattern: GameManager -> GameConfig -> values.
    /// </summary>
    [CreateAssetMenu(menuName = "Config/GameConfig", fileName = "GameConfig")]
    public class GameConfig : ScriptableObject
    {
        [Header("Block Move (Tile)")]
        public float moveToTileDuration = 0.25f;
        public float moveToTileStaggerDelay = 0.1f;
        public Ease moveToTileEase = Ease.OutQuad;
    
        [Header("Block Move (Tray)")]
        public float moveToTrayDuration = 0.25f;
        public float trayStaggerDelay = 0.1f;
        public float traySortDuration = 0.2f;
        public Ease trayMoveEase = Ease.OutQuad;
    
        [Header("Boosters - Initial Uses")]
        public int magicInitialUses = 3;
        public int brushInitialUses = 3;
        public int magnetInitialUses = 3;
    
        [Header("Boosters - Unlock Level")]
        public int magicUnlockLevel = 3;
        public int brushUnlockLevel = 3;
        public int magnetUnlockLevel = 3;
    
        [Header("Guide - Zoom")]
        [Tooltip("At this level, show the zoom guide (0 = do not show).")]
        public int zoomGuideLevel = 0;
    
        [Header("Guide - Boosters")]
        [Tooltip("At this level, show the guide for the Magic booster (0 = do not show).")]
        public int magicGuideLevel = 0;
        [Tooltip("At this level, show the guide for the Brush booster (0 = do not show).")]
        public int brushGuideLevel = 0;
        [Tooltip("At this level, show the guide for the Magnet booster (0 = do not show).")]
        public int magnetGuideLevel = 0;
    
        [Header("Audio — Gems")]
        public AudioClip clickGem;
        public AudioClip moveGem;
        public AudioClip gemStop;
        public AudioClip gemCollapse;
    
        [Header("Audio — UI")]
        public AudioClip flyCoin;
        public AudioClip uiButtonClick;
        public AudioClip winGame;
    }
    
    
}
//源码网站 开vpn全局模式打开 https://web3incubators.com/
//客服联系方式 https://web3incubators.com/kefu.html