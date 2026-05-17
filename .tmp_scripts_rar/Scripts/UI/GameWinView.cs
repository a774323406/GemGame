using System.Collections;
using UnityEngine;
using UnityEngine.UI;

namespace GemSortingPuzzle
{
    /// <summary>
    /// GameWin screen: shows the level preview, ribbon, reward, and the Next button.
    /// Inherits BasePopup to get a fade + scale-bounce effect for the Root.
    /// </summary>
    public class GameWinView : BasePopup
    {
        [Header("Level Source")]
        [Tooltip("If assigned, reads levelIndex directly from this BoardManager. Otherwise, GameWinView will fetch it via GameManager.Instance.")]
        [SerializeField] private BoardManager boardManagerSource;
    
        [Header("Preview Resources")]
        [Tooltip("Path after Assets/Resources/ — e.g. disk: Assets/Resources/Images/LevelPreviews/ -> enter: Images/LevelPreviews")]
        [SerializeField] private string previewResourcesFolder = "Images/LevelPreviews";
    
        [Tooltip("Resource file prefix: PreviewLevel1, PreviewLevel2, ... (default: PreviewLevel).")]
        [SerializeField] private string previewFilePrefix = "PreviewLevel";
    
        [Header("Debug Preview")]
        [Tooltip("Enable to print to the Console: Resources path and load result (helps when the preview is empty).")]
        [SerializeField] private bool logPreviewLoad = true;
    
        [Header("Preview sizing")]
        [Tooltip("Maximum size (pixel UI) for the preview edge; keep aspect ratio and do not upscale beyond the original image.")]
        [SerializeField] private float previewMaxPixels = 512f;
    
        [Header("Layout")]
        [SerializeField] private Image preview;        // Preview level image (child of Board)
        [SerializeField] private Image ribbon;         // Decorative ribbon strip
        [SerializeField] private Button nextButton;    // NextBtn
        [SerializeField] private Image rewardIcon;     // RewardIcon
        [SerializeField] private Text rewardText;      // Reward text (coin/reward amount)
    
        [Header("Reward")]
        [SerializeField] private int rewardCoins = 50;
    
        private bool _isProcessingNext;
    
        private void Awake()
        {
            if (nextButton != null)
                nextButton.onClick.AddListener(OnNextLevelClicked);
        }
    
        /// <summary>Sets the level preview sprite.</summary>
        public void SetPreview(Sprite sprite)
        {
            if (preview == null) return;
            preview.sprite = sprite;
            ApplyPreviewSize(sprite);
        }
    
        /// <summary>
        /// Automatically load the preview sprite by levelIndex (game: 1, 2, 3...).
        /// File Resources: PreviewLevel1, PreviewLevel2, ...
        /// </summary>
        public void SetPreviewByLevelIndex(int levelIndex)
        {
            if (preview == null)
            {
                if (logPreviewLoad)
                    Debug.LogWarning("[GameWinView] Preview load skipped: field 'preview' (Image) is not assigned in the Inspector.");
                return;
            }
    
            string folder = (previewResourcesFolder ?? string.Empty).Trim().Trim('/');
    
            int safeLevel = Mathf.Max(1, levelIndex);
            // Fixed format required: PreviewLevel + levelIndex (PreviewLevel1, PreviewLevel2, ...)
            string fileName = $"PreviewLevel{safeLevel}";
            string resourcePath = string.IsNullOrEmpty(folder) ? fileName : $"{folder}/{fileName}";
    
            Sprite loaded = Resources.Load<Sprite>(resourcePath);
            if (loaded == null)
            {
                // Some projects import PNG as Default texture — try loading Texture2D and create a runtime Sprite.
                var tex = Resources.Load<Texture2D>(resourcePath);
                if (tex != null)
                {
                    loaded = Sprite.Create(tex, new Rect(0, 0, tex.width, tex.height), new Vector2(0.5f, 0.5f), 100f);
                    if (logPreviewLoad)
                        Debug.Log($"[GameWinView] Preview loaded via Texture2D fallback: '{resourcePath}' ({tex.width}x{tex.height}). Tip: set Texture Type = Sprite (2D and UI) for the original file.");
                }
            }
    
            if (loaded == null)
            {
                Debug.LogWarning(
                    "[GameWinView] Could not load preview.\n" +
                    $"  Resources path (no .png): \"{resourcePath}\"\n" +
                    $"  Game level: {safeLevel} -> file: \"{fileName}\"\n" +
                    $"  Folder: \"{folder}\"\n" +
                    "  Check: the image is under Assets/.../Resources/..., Import Type = Sprite, and the file name matches (e.g. PreviewLevel1).");
                return;
            }
    
            preview.sprite = loaded;
            preview.enabled = true;
            ApplyPreviewSize(loaded);
    
            if (logPreviewLoad)
                Debug.Log($"[GameWinView] Preview OK: '{resourcePath}' → sprite '{loaded.name}' (level {safeLevel}).");
        }
    
        public override void Show()
        {
            // Reset the Next state each time GameWin opens.
            _isProcessingNext = false;
            if (nextButton != null)
                nextButton.interactable = true;
    
            int idx = 1;
            if (GameManager.Instance != null)
                idx = Mathf.Max(1, GameManager.Instance.CurrentLevelIndex);
    
            // Load the preview immediately when showing so the player sees the correct image right away.
            SetPreviewByLevelIndex(idx);
            GameAudio.PlayWinGame();
            base.Show();
            StartCoroutine(ShowAdsIE());
        }
        IEnumerator ShowAdsIE()
        {
             yield return new WaitForSeconds(1.5f);
              AdsControl.Instance.ShowInterstital();
        }
    
        /// <summary>
        /// Sets the RectTransform size based on the sprite: keeps aspect ratio; width/height won't exceed previewMaxPixels; do not upscale beyond the original image.
        /// </summary>
        private void ApplyPreviewSize(Sprite sprite)
        {
            if (preview == null || sprite == null) return;
    
            preview.preserveAspect = true;
    
            float w = sprite.rect.width;
            float h = sprite.rect.height;
            if (w <= 0f || h <= 0f) return;
    
            float maxPx = Mathf.Max(1f, previewMaxPixels);
            // Uniform scale: both edges <= maxPx, and no upscale (scale <= 1).
            float scale = Mathf.Min(1f, maxPx / w, maxPx / h);
            float newW = w * scale;
            float newH = h * scale;
    
            var rt = preview.rectTransform;
            rt.SetSizeWithCurrentAnchors(RectTransform.Axis.Horizontal, newW);
            rt.SetSizeWithCurrentAnchors(RectTransform.Axis.Vertical, newH);
        }
    
        /// <summary>Sets the ribbon (if using a separate sprite for each level).</summary>
        public void SetRibbon(Sprite sprite)
        {
            if (ribbon != null && sprite != null)
                ribbon.sprite = sprite;
        }
    
        /// <summary>Sets the reward icon.</summary>
        public void SetRewardIcon(Sprite sprite)
        {
            if (rewardIcon != null && sprite != null)
                rewardIcon.sprite = sprite;
        }
    
        /// <summary>Sets the reward text (e.g. +100).</summary>
        public void SetRewardText(string text)
        {
            if (rewardText != null)
                rewardText.text = text;
        }
    
        /// <summary>Registers a callback for the Next button.</summary>
        public void SetNextClickListener(UnityEngine.Events.UnityAction onClick)
        {
            if (nextButton != null)
                nextButton.onClick.RemoveAllListeners();
            if (nextButton != null && onClick != null)
                nextButton.onClick.AddListener(onClick);
        }
    
        public Button NextButton => nextButton;
    
        private void OnNextLevelClicked()
        {
            if (_isProcessingNext)
                return;
    
            GameAudio.PlayUiButtonClick();
    
            var gm = GameManager.Instance;
            if (gm == null)
            {
                Debug.LogWarning("[GameWinView] GameManager.Instance is null, cannot go to next level.");
                return;
            }
    
            _isProcessingNext = true;
            if (nextButton != null)
                nextButton.interactable = false;
    
            // If there is a CoinView (via GameManager -> UIManager), run the coin-receive effect first, then handle the next level.
            var coinView = gm.CoinView;
            if (coinView != null && rewardCoins > 0)
            {
                coinView.ReceiveCoin(rewardCoins, () =>
                {
                    ProceedToNextLevel(gm);
                });
            }
            else
            {
                ProceedToNextLevel(gm);
            }
        }
    
        private void ProceedToNextLevel(GameManager gm)
        {
            // Calculate the next level using the TestMode/Normal logic.
            int nextLevelIndex = gm.GetNextLevelIndex();
    
            // Clear the current board + tray.
            gm.CleanBoardAndTray();
    
            // Update the current level in GameManager.
            gm.OnLevelLoaded(nextLevelIndex);
    
            // Regenerate board for the new level (BoardManager reads CurrentLevelIndex inside GenerateTiles).
            if (gm.BoardManager != null)
            {
                gm.BoardManager.GenerateTiles();
                // GenerateBlocks is private, so GenerateTiles already set _levelData.
                // BoardManager.Start also calls GenerateBlocks after GenerateTiles.
                var generateBlocksMethod = typeof(BoardManager).GetMethod("GenerateBlocks", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance);
                generateBlocksMethod?.Invoke(gm.BoardManager, null);
            }
    
            // Reset the play state and hide GameWin.
            gm.SetPlaying();
            Hide();
            _isProcessingNext = false;
        }
    }
    
    
}
