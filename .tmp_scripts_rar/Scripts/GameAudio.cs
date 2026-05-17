using UnityEngine;

namespace GemSortingPuzzle
{
    /// <summary>
    /// Plays SFX from GameConfig via AudioManager (GameManager -> GameConfig -> clip).
    /// </summary>
    public static class GameAudio
    {
        private static GameConfig Config => GameManager.Instance != null ? GameManager.Instance.GameConfig : null;
    
        public static void PlayClickGem()
        {
            var c = Config;
            if (c == null || c.clickGem == null) return;
            if (AudioManager.Instance != null)
                AudioManager.Instance.PlaySfx(c.clickGem);
        }
    
        public static void PlayMoveGem()
        {
            var c = Config;
            if (c == null || c.moveGem == null) return;
            if (AudioManager.Instance != null)
                AudioManager.Instance.PlaySfx(c.moveGem);
        }
    
        public static void PlayGemStop()
        {
            var c = Config;
            if (c == null || c.gemStop == null) return;
            if (AudioManager.Instance != null)
                AudioManager.Instance.PlaySfx(c.gemStop);
        }
    
        public static void PlayGemCollapse()
        {
            var c = Config;
            if (c == null || c.gemCollapse == null) return;
            if (AudioManager.Instance != null)
                AudioManager.Instance.PlaySfx(c.gemCollapse);
        }
    
        public static void PlayFlyCoin()
        {
            var c = Config;
            if (c == null || c.flyCoin == null) return;
            if (AudioManager.Instance != null)
                AudioManager.Instance.PlaySfx(c.flyCoin);
        }
    
        public static void PlayUiButtonClick()
        {
            var c = Config;
            if (c == null || c.uiButtonClick == null) return;
            if (AudioManager.Instance != null)
                AudioManager.Instance.PlaySfx(c.uiButtonClick);
        }
    
        public static void PlayWinGame()
        {
            var c = Config;
            if (c == null || c.winGame == null) return;
            if (AudioManager.Instance != null)
                AudioManager.Instance.PlaySfx(c.winGame);
        }
    }
    
}
