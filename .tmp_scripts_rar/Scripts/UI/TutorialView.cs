using UnityEngine;

namespace GemSortingPuzzle
{
    /// <summary>
    /// TutorialView singleton manager.
    /// - Manages showing/hiding the whole tutorial via the outermost canvasGroup.
    /// - Manages 6 StepViews (each step has its own canvasGroup).
    /// - Tracks whether it is currently showing and which step is active.
    /// </summary>
    public class TutorialView : MonoBehaviour
    {
        private const int StepCount = 6;
        /// <summary>Similar to BoardManager: GetBlockConfig(i) loads asset Block{i-1} — e.g. Green (Block4.asset) has ColorIndex = 5.</summary>
        private const string BlockConfigResourcesPath = "Configs/Blocks";

        public static TutorialView Instance { get; private set; }

        [Header("Root")]
        [SerializeField] private CanvasGroup rootCanvasGroup;
        [SerializeField] private Transform stepRoot;

        [Header("Step CanvasGroups (Step1..Step6)")]
        [SerializeField] private CanvasGroup[] stepCanvasGroups = new CanvasGroup[StepCount];

        [Header("Init")]
        [SerializeField] private bool hideOnAwake = true;
        [SerializeField] private int initialStepIndex = 0;

        [Header("Tutorial Rules")]
        [SerializeField] private bool onlyRunOnLevelOne = true;
        [SerializeField] private int levelIndexForTutorial = 1;
        [Tooltip("Auto-resolve indices from BlockConfig (BlockColor.Green / Pink). Enable this to match BoardManager (ColorIndex = GetBlockConfig index, not the BlockColor enum).")]
        [SerializeField] private bool autoResolveColorIndicesFromConfigs = true;
        [Tooltip("ColorIndex in the game = block index in the level (GetBlockConfig). Default Green = Block4 -> 5.")]
        [SerializeField] private int tutorialGreenColorIndex = 5;
        [Tooltip("Default Pink = Block9 -> 10.")]
        [SerializeField] private int tutorialPinkColorIndex = 10;

        public bool IsShowing { get; private set; }
        public int CurrentStepIndex { get; private set; } = -1;
        public int CurrentStepNumber => CurrentStepIndex + 1;
        public int TotalSteps => StepCount;
        public bool IsTutorialActive => IsShowing && CurrentStepIndex >= 0 && IsAvailableForCurrentLevel();

        /// <summary>
        /// Currently applying a forced hide of MoreSlots (and external UI) for the tutorial — <see cref="TrayManager"/> must not re-enable MoreSlots in <c>UpdateMoreSlotPositionAndVisibility</c>.
        /// </summary>
        public bool IsTutorialHidingMoreSlots { get; private set; }

        private GameManager _gm;
        private bool _boundLevelEvent;
        private bool _tutorialFinished;
        private bool _externalHiddenApplied;

        private void Awake()
        {
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject);
                return;
            }

            Instance = this;

            CacheReferences();

            if (hideOnAwake)
                HideImmediate();
            else
                Show(initialStepIndex);
        }

        private void Start()
        {
            if (autoResolveColorIndicesFromConfigs)
                ResolveTutorialColorIndicesFromBlockConfigs();
            BindGameManagerEventsIfNeeded();
            RefreshByCurrentLevel();
        }

        /// <summary>
        /// BoardManager: _blockConfigs[i+1] = asset Block{i} -> ColorIndex of Block{k} in gameplay = k+1.
        /// </summary>
        private void ResolveTutorialColorIndicesFromBlockConfigs()
        {
            bool gotGreen = false;
            bool gotPink = false;
            for (int i = 0; i <= 20; i++)
            {
                var cfg = Resources.Load<BlockConfig>($"{BlockConfigResourcesPath}/Block{i}");
                if (cfg == null) continue;
                int colorIndexInGame = i + 1;
                if (!gotGreen && cfg.color == BlockColor.Green)
                {
                    tutorialGreenColorIndex = colorIndexInGame;
                    gotGreen = true;
                }
                if (!gotPink && cfg.color == BlockColor.Pink)
                {
                    tutorialPinkColorIndex = colorIndexInGame;
                    gotPink = true;
                }
                if (gotGreen && gotPink) break;
            }
        }

        private void Update()
        {
            // Case: GameManager is created later than TutorialView.
            BindGameManagerEventsIfNeeded();
        }

        private void OnDestroy()
        {
            UnbindGameManagerEvents();
        }

        private void CacheReferences()
        {
            if (rootCanvasGroup == null)
                rootCanvasGroup = GetComponent<CanvasGroup>();

            if (stepRoot == null)
                stepRoot = transform.Find("Root");

            if (stepCanvasGroups == null || stepCanvasGroups.Length != StepCount)
                stepCanvasGroups = new CanvasGroup[StepCount];

            for (int i = 0; i < StepCount; i++)
            {
                if (stepCanvasGroups[i] != null) continue;
                if (stepRoot == null) continue;

                Transform step = stepRoot.Find($"Step{i + 1}View");
                if (step == null) continue;

                var cg = step.GetComponent<CanvasGroup>();
                if (cg == null)
                    cg = step.gameObject.AddComponent<CanvasGroup>();
                stepCanvasGroups[i] = cg;
            }
        }

        private static CoinView ResolveCoinView()
        {
            var gm = GameManager.Instance;
            if (gm != null && gm.CoinView != null)
                return gm.CoinView;
            return FindObjectOfType<CoinView>(true);
        }

        private static GameView ResolveGameView()
        {
            var gm = GameManager.Instance;
            if (gm != null && gm.GameView != null)
                return gm.GameView;
            return FindObjectOfType<GameView>(true);
        }

        private static GameObject ResolveMoreSlotsObject()
        {
            var gm = GameManager.Instance;
            if (gm != null && gm.BoardManager != null && gm.BoardManager.TrayManager != null)
            {
                var go = gm.BoardManager.TrayManager.MoreSlotsObject;
                if (go != null) return go;
            }

            var tray = FindObjectOfType<TrayManager>(true);
            return tray != null ? tray.MoreSlotsObject : null;
        }

        public void Show(int stepIndex = 0)
        {
            CacheReferences();
            _tutorialFinished = false;
            ApplyExternalUiHidden(true);
            SetCanvasGroupVisible(rootCanvasGroup, true);
            IsShowing = true;
            ShowStep(stepIndex);
        }

        public void Hide()
        {
            HideImmediate();
        }

        public void ShowStep(int stepIndex)
        {
            CacheReferences();

            int index = Mathf.Clamp(stepIndex, 0, StepCount - 1);
            CurrentStepIndex = index;
            IsShowing = true;
            ApplyExternalUiHidden(true);
            SetCanvasGroupVisible(rootCanvasGroup, true);

            for (int i = 0; i < StepCount; i++)
                SetCanvasGroupVisible(stepCanvasGroups[i], i == index);
        }

        public bool NextStep()
        {
            if (CurrentStepIndex >= StepCount - 1) return false;
            ShowStep(CurrentStepIndex + 1);
            return true;
        }

        public bool PrevStep()
        {
            if (CurrentStepIndex <= 0) return false;
            ShowStep(CurrentStepIndex - 1);
            return true;
        }

        public void SetShowing(bool show, int stepIndex = 0)
        {
            if (show) Show(stepIndex);
            else Hide();
        }

        /// <summary>
        /// Tutorial click gate cho Block.
        /// - Step 0: only Green
        /// - Step 2: only Pink
        /// - Step 4: only Green
        /// </summary>
        public bool TryHandleBlockClick(Block block)
        {
            if (!IsTutorialActive) return true;
            if (block == null) return false;

            switch (CurrentStepIndex)
            {
                case 0:
                    if (block.ColorIndex == tutorialGreenColorIndex)
                    {
                        ShowStep(1);
                        return true;
                    }
                    return false;

                case 2:
                    if (block.ColorIndex == tutorialPinkColorIndex)
                    {
                        ShowStep(3);
                        return true;
                    }
                    return false;

                case 4:
                    if (block.ColorIndex == tutorialGreenColorIndex)
                    {
                        ShowStep(5);
                        return true;
                    }
                    return false;

                default:
                    return false;
            }
        }

        /// <summary>
        /// Tutorial click gate cho TraySlot.
        /// - Step 1: click any TraySlot -> Step 2
        /// </summary>
        public bool TryHandleTraySlotClick(TraySlot traySlot)
        {
            if (!IsTutorialActive) return true;
            if (traySlot == null) return false;

            if (CurrentStepIndex == 1)
            {
                ShowStep(2);
                return true;
            }

            return false;
        }

        /// <summary>
        /// Tutorial click gate cho Tile.
        /// - Step 3: click an empty tile -> Step 4
        /// - Step 5: click an empty tile -> finish tutorial
        /// </summary>
        public bool TryHandleTileClick(Tile tile)
        {
            if (!IsTutorialActive) return true;
            if (tile == null) return false;

            switch (CurrentStepIndex)
            {
                case 3:
                    if (tile.IsEmpty)
                    {
                        ShowStep(4);
                        return true;
                    }
                    return false;

                case 5:
                    if (tile.IsEmpty)
                    {
                        FinishTutorial();
                        return true;
                    }
                    return false;

                default:
                    return false;
            }
        }

        public void StartTutorialAtStep0()
        {
            _tutorialFinished = false;
            Show(0);
        }

        public void FinishTutorial()
        {
            _tutorialFinished = true;
            HideImmediate();
        }

        private void HideImmediate()
        {
            CacheReferences();
            SetCanvasGroupVisible(rootCanvasGroup, false);

            for (int i = 0; i < StepCount; i++)
                SetCanvasGroupVisible(stepCanvasGroups[i], false);

            IsShowing = false;
            CurrentStepIndex = -1;
            ApplyExternalUiHidden(false);
        }

        private void ApplyExternalUiHidden(bool tutorialShowing)
        {
            CacheReferences();
            IsTutorialHidingMoreSlots = tutorialShowing;

            if (tutorialShowing)
            {
                if (!_externalHiddenApplied)
                {
                    ResolveCoinView()?.Hide();
                    ResolveGameView()?.Hide();
                    _externalHiddenApplied = true;
                }
                // Always force-hide: TrayManager.Init/GenerateSlots calls UpdateMoreSlotPositionAndVisibility and may SetActive(true) again.
                var moreSlots = ResolveMoreSlotsObject();
                if (moreSlots != null)
                    moreSlots.SetActive(false);
                return;
            }

            if (!_externalHiddenApplied) return;

            ResolveCoinView()?.Show();
            ResolveGameView()?.Show();
            // var more = ResolveMoreSlotsObject();
            // if (more != null)
            //     more.SetActive(true);

            _externalHiddenApplied = false;
        }

        private void BindGameManagerEventsIfNeeded()
        {
            if (_boundLevelEvent) return;
            _gm = GameManager.Instance;
            if (_gm == null) return;
            _gm.OnLevelIndexChanged += OnLevelChanged;
            _boundLevelEvent = true;
        }

        private void UnbindGameManagerEvents()
        {
            if (!_boundLevelEvent) return;
            if (_gm != null)
                _gm.OnLevelIndexChanged -= OnLevelChanged;
            _boundLevelEvent = false;
        }

        private void OnLevelChanged(int _)
        {
            RefreshByCurrentLevel();
        }

        private void RefreshByCurrentLevel()
        {
            if (IsAvailableForCurrentLevel() && !_tutorialFinished)
            {
                Show(0);
                return;
            }

            HideImmediate();
        }

        private bool IsAvailableForCurrentLevel()
        {
            var gm = GameManager.Instance;
            if (gm == null) return false;
            if (!onlyRunOnLevelOne) return true;
            return gm.CurrentLevelIndex == levelIndexForTutorial;
        }

        private static void SetCanvasGroupVisible(CanvasGroup cg, bool visible)
        {
            if (cg == null) return;
            cg.alpha = visible ? 1f : 0f;
            //cg.interactable = visible;
            //cg.blocksRaycasts = visible;
        }
    }

}
