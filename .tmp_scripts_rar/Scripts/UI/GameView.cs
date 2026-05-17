using UnityEngine;
using UnityEngine.UI;

namespace GemSortingPuzzle
{
    /// <summary>
    /// Main in-game view: Bottom (3 boosters), Top (settings).
    /// Inherits BasePanel — uses Show/Hide for GameView.
    /// </summary>
    public class GameView : BasePanel
    {
        [Header("Board")]
        [SerializeField] private BoardManager boardManager;
    
        [Header("Guide - Zoom")]
        [Tooltip("zoomGuideView is a child object of GameView. It will fade in/out using alpha when you reach the correct level.")]
        [SerializeField] private CanvasGroup zoomGuideView;
    
        [Header("Guide - Boosters")]
        [Tooltip("magicGuideView is a child object of GameView. It will fade in/out using alpha when you reach the correct level. (Magic)")]
        [SerializeField] private CanvasGroup magicGuideView;
        [Tooltip("brushGuideView is a child object of GameView. It will fade in/out using alpha when you reach the correct level. (Brush)")]
        [SerializeField] private CanvasGroup brushGuideView;
        [Tooltip("magnetGuideView is a child object of GameView. It will fade in/out using alpha when you reach the correct level. (Magnet)")]
        [SerializeField] private CanvasGroup magnetGuideView;
    
        [Header("Boosters (Bottom)")]
        [SerializeField] private BoosterButton boosterMagic;
        [SerializeField] private BoosterButton boosterBrush;
        [SerializeField] private BoosterButton boosterMagnet;
    
        [Header("Top")]
        [SerializeField] private Button settingButton;
        [SerializeField] private Text levelText;
        [Tooltip("Example: \"Level {0}\" or \"Lv.{0}\"")]
        [SerializeField] private string levelTextFormat = "Level {0}";
    
        private bool _zoomGuideShowing;
        private bool _magicGuideShowing;
        private bool _brushGuideShowing;
        private bool _magnetGuideShowing;
    
        protected override void Awake()
        {
            base.Awake();
            CacheZoomGuideView();
            CacheBoosterGuideViews();
            HideAllGuideViews();
        }
    
        private void Start()
        {
            BindBoosters();
            SetSettingClickListener(OnSettingClicked);
            RefreshLevelText();
        }
    
        private void OnEnable()
        {
            if (GameManager.Instance != null)
                GameManager.Instance.OnLevelIndexChanged += OnLevelIndexChanged;
            RefreshLevelText();
        }
    
        private void OnDisable()
        {
            if (GameManager.Instance != null)
                GameManager.Instance.OnLevelIndexChanged -= OnLevelIndexChanged;
        }
    
        private void Update()
        {
            if (!IsAnyGuideShowing) return;
    
            // Any tap/click: hide guides.
            if (Input.GetMouseButtonDown(0) || Input.touchCount > 0)
                HideAllGuideViews();
        }
    
        private void OnLevelIndexChanged(int levelIndex)
        {
            ApplyLevelText(levelIndex);
            ApplyBoosterLockStates(levelIndex);
            ApplyZoomGuideState(levelIndex);
            ApplyBoosterGuideState(levelIndex);
        }
    
        private void RefreshLevelText()
        {
            int levelIndex = 1;
            if (GameManager.Instance != null)
                levelIndex = Mathf.Max(1, GameManager.Instance.CurrentLevelIndex);
    
            ApplyLevelText(levelIndex);
            ApplyBoosterLockStates(levelIndex);
            ApplyZoomGuideState(levelIndex);
            ApplyBoosterGuideState(levelIndex);
        }
    
        private void ApplyLevelText(int levelIndex)
        {
            if (levelText == null) return;
            string fmt = string.IsNullOrEmpty(levelTextFormat) ? "{0}" : levelTextFormat;
            levelText.text = string.Format(fmt, Mathf.Max(1, levelIndex));
        }
    
        private void BindBoosters()
        {
            if (boardManager == null) return;
    
            if (boosterMagic != null)
                boosterMagic.SetClickListener(OnMagicClicked);
            if (boosterBrush != null)
                boosterBrush.SetClickListener(OnBrushClicked);
            if (boosterMagnet != null)
                boosterMagnet.SetClickListener(OnMagnetClicked);
        }
    
        private void ApplyBoosterLockStates(int currentLevel)
        {
            var cfg = GameManager.Instance != null ? GameManager.Instance.GameConfig : null;
    
            int magicUnlock = cfg != null ? Mathf.Max(1, cfg.magicUnlockLevel) : 1;
            int brushUnlock = cfg != null ? Mathf.Max(1, cfg.brushUnlockLevel) : 1;
            int magnetUnlock = cfg != null ? Mathf.Max(1, cfg.magnetUnlockLevel) : 1;
    
            ApplyBoosterLockState(boosterMagic, currentLevel, magicUnlock);
            ApplyBoosterLockState(boosterBrush, currentLevel, brushUnlock);
            ApplyBoosterLockState(boosterMagnet, currentLevel, magnetUnlock);
        }
    
        private void CacheZoomGuideView()
        {
            if (zoomGuideView != null) return;
    
            // Prefer finding by child name (matching the requirement: zoomGuideView is a child of GameView).
            var t = transform.Find("zoomGuideView");
            if (t == null) t = transform.Find("ZoomGuideView");
            if (t == null) return;
    
            zoomGuideView = t.GetComponent<CanvasGroup>();
            if (zoomGuideView == null)
                zoomGuideView = t.gameObject.AddComponent<CanvasGroup>();
        }
    
        private void ApplyZoomGuideState(int currentLevel)
        {
            CacheZoomGuideView();
            var gm = GameManager.Instance;
            var cfg = gm != null ? gm.GameConfig : null;
            int guideLevel = cfg != null ? Mathf.Max(0, cfg.zoomGuideLevel) : 0;
    
            // If there is a tutorial, do not show the zoom guide.
            var tutorial = TutorialView.Instance;
            bool tutorialLock = tutorial != null && tutorial.IsTutorialActive;
    
            bool shouldShow = !tutorialLock && guideLevel > 0 && Mathf.Max(1, currentLevel) == guideLevel;
            SetZoomGuideVisible(shouldShow);
        }
    
        private void CacheBoosterGuideViews()
        {
            if (magicGuideView == null)
            {
                var t = transform.Find("magicGuideView");
                if (t == null) t = transform.Find("MagicGuideView");
                if (t != null)
                    magicGuideView = t.GetComponent<CanvasGroup>() ?? t.gameObject.AddComponent<CanvasGroup>();
            }
    
            if (brushGuideView == null)
            {
                var t = transform.Find("brushGuideView");
                if (t == null) t = transform.Find("BrushGuideView");
                if (t != null)
                    brushGuideView = t.GetComponent<CanvasGroup>() ?? t.gameObject.AddComponent<CanvasGroup>();
            }
    
            if (magnetGuideView == null)
            {
                var t = transform.Find("magnetGuideView");
                if (t == null) t = transform.Find("MagnetGuideView");
                if (t != null)
                    magnetGuideView = t.GetComponent<CanvasGroup>() ?? t.gameObject.AddComponent<CanvasGroup>();
            }
        }
    
        private void ApplyBoosterGuideState(int currentLevel)
        {
            var gm = GameManager.Instance;
            var cfg = gm != null ? gm.GameConfig : null;
            int magicLevel = cfg != null ? Mathf.Max(0, cfg.magicGuideLevel) : 0;
            int brushLevel = cfg != null ? Mathf.Max(0, cfg.brushGuideLevel) : 0;
            int magnetLevel = cfg != null ? Mathf.Max(0, cfg.magnetGuideLevel) : 0;
    
            // If there is a tutorial, do not show booster guides.
            var tutorial = TutorialView.Instance;
            bool tutorialLock = tutorial != null && tutorial.IsTutorialActive;
    
            int safeLevel = Mathf.Max(1, currentLevel);
    
            bool showMagic = !tutorialLock && magicLevel > 0 && safeLevel == magicLevel;
            bool showBrush = !tutorialLock && brushLevel > 0 && safeLevel == brushLevel;
            bool showMagnet = !tutorialLock && magnetLevel > 0 && safeLevel == magnetLevel;
    
            SetBoosterGuideVisible(magicGuideView, showMagic, ref _magicGuideShowing);
            SetBoosterGuideVisible(brushGuideView, showBrush, ref _brushGuideShowing);
            SetBoosterGuideVisible(magnetGuideView, showMagnet, ref _magnetGuideShowing);
        }
    
        private void SetBoosterGuideVisible(CanvasGroup view, bool visible, ref bool flag)
        {
            if (view == null)
            {
                flag = false;
                return;
            }
    
            view.alpha = visible ? 1f : 0f;
            view.interactable = false;
            view.blocksRaycasts = visible;
            flag = visible;
        }
    
        private bool IsAnyGuideShowing => _zoomGuideShowing || _magicGuideShowing || _brushGuideShowing || _magnetGuideShowing;
    
        private void SetZoomGuideVisible(bool visible)
        {
            if (zoomGuideView == null)
            {
                _zoomGuideShowing = false;
                return;
            }
    
            zoomGuideView.alpha = visible ? 1f : 0f;
            zoomGuideView.interactable = false;
            zoomGuideView.blocksRaycasts = visible; // blocks click-through while the guide is visible
            _zoomGuideShowing = visible;
        }
    
        private void HideAllGuideViews()
        {
            SetZoomGuideVisible(false);
            SetBoosterGuideVisible(magicGuideView, false, ref _magicGuideShowing);
            SetBoosterGuideVisible(brushGuideView, false, ref _brushGuideShowing);
            SetBoosterGuideVisible(magnetGuideView, false, ref _magnetGuideShowing);
        }
    
        private static void ApplyBoosterLockState(BoosterButton booster, int currentLevel, int unlockLevel)
        {
            if (booster == null) return;
            int safeCurrent = Mathf.Max(1, currentLevel);
            int safeUnlock = Mathf.Max(1, unlockLevel);
            bool isLocked = safeCurrent < safeUnlock;
            booster.SetLocked(isLocked, safeUnlock);
        }
    
        private void OnMagicClicked()
        {
            boardManager.ShowWandTool();
        }
    
        private void OnBrushClicked()
        {
            boardManager.TryCleanTray();
        }
    
        private void OnMagnetClicked()
        {
            boardManager.TryUseMagnet();
        }
    
        private void OnSettingClicked()
        {
            GameAudio.PlayUiButtonClick();
            // Prefer UIManager to keep hide/show logic in sync.
            var ui = GameManager.Instance != null ? GameManager.Instance.UIManager : null;
            if (ui != null)
            {
                Hide();
                ui.Show(UIManager.ViewId.Setting);
                return;
            }
    
            // Fallback if UIManager is not ready.
            var settingView = FindObjectOfType<SettingView>(true);
            if (settingView != null)
            {
                Hide();
                settingView.Show();
            }
        }
    
        /// <summary>Booster by type.</summary>
        public BoosterButton GetBooster(BoosterButton.BoosterType type)
        {
            switch (type)
            {
                case BoosterButton.BoosterType.Magic: return boosterMagic;
                case BoosterButton.BoosterType.Brush: return boosterBrush;
                case BoosterButton.BoosterType.Magnet: return boosterMagnet;
                default: return null;
            }
        }
    
        public BoosterButton BoosterMagic => boosterMagic;
        public BoosterButton BoosterBrush => boosterBrush;
        public BoosterButton BoosterMagnet => boosterMagnet;
        public Button SettingButton => settingButton;
    
        /// <summary>Registers a click handler for Setting.</summary>
        public void SetSettingClickListener(UnityEngine.Events.UnityAction onClick)
        {
            if (settingButton != null)
                settingButton.onClick.RemoveAllListeners();
            if (settingButton != null && onClick != null)
                settingButton.onClick.AddListener(onClick);
        }
    }
    
}
