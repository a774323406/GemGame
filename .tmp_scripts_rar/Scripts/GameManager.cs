using UnityEngine;
using System;

namespace GemSortingPuzzle
{
    /// <summary>
    /// Global GameManager singleton.
    /// - Holds the game state (Playing, LevelComplete).
    /// - Holds references to core managers such as BoardManager and UIManager (future).
    /// </summary>
    public class GameManager : MonoBehaviour
    {
        private const string CoinPlayerPrefsKey = "game_coin";
        private const string LevelPlayerPrefsKey = "game_level";
    
        public enum State
        {
            PLAYING,
            PAUSE,
            LEVEL_COMPLETE
        }
    
        /// <summary>Singleton instance.</summary>
        public static GameManager Instance { get; private set; }
    
        [Header("State")]
        [SerializeField] private State currentState = State.PLAYING;
    
        [Header("Managers")]
        [SerializeField] private BoardManager boardManager;
        [Header("UI")]
        [SerializeField] private UIManager uiManager;
    
        [Header("Config")]
        [SerializeField] private GameConfig gameConfig;
    
        [Header("Level Flow")]
        [Tooltip("If enabled, always load the level using testLevelIndex (for testing). If disabled, play normally starting from the first level and increase progressively.")]
        [SerializeField] private bool testMode = false;
        [SerializeField] private int testLevelIndex = 1;
        [Tooltip("Level to start when playing normally (testMode = false).")]
        [SerializeField] private int firstLevelIndex = 1;
    
        [Header("UI Timing")]
        [Tooltip("Delay before showing GameWin after setting LEVEL_COMPLETE.")]
        [SerializeField] private float gameWinDelaySeconds = 1.5f;
    
        [Header("Currency")]
        [Tooltip("Default coin value when there is no saved data.")]
        [SerializeField] private int defaultCoin = 0;
    
        public State CurrentState => currentState;
        public BoardManager BoardManager => boardManager;
        public UIManager UIManager => uiManager;
        public CoinView CoinView => uiManager != null ? uiManager.CoinView : null;
        public GameView GameView => uiManager != null ? uiManager.GameView : null;
        public GameConfig GameConfig => gameConfig;
        public bool TestMode => testMode;
        public int CurrentLevelIndex { get; private set; }
        public int CurrentCoin { get; private set; }
    
        public event Action<int> OnCoinChanged;
    
        /// <summary>Called when the current level is confirmed (start game, next level, etc.).</summary>
        public event Action<int> OnLevelIndexChanged;
    
        private void Awake()
        {
            // Basic singleton pattern
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject);
                return;
            }
    
            Instance = this;
            DontDestroyOnLoad(gameObject);
    
            LoadCoin();
    
            LoadLevel();
    
            // If not assigned in the Inspector, try to find it in the scene.
            if (boardManager == null)
                boardManager = FindObjectOfType<BoardManager>();
            if (uiManager == null)
                uiManager = FindObjectOfType<UIManager>();
            Application.targetFrameRate = 60;
        }
    
        private void Start()
        {
            // Synchronize initialization of managers (board, tray) for the current level.
            if (boardManager == null)
                boardManager = FindObjectOfType<BoardManager>();
    
            if (boardManager != null)
            {
                // Init board for the current level.
                boardManager.InitForCurrentLevel();
    
                // Init tray attached to the board.
                var tray = boardManager.TrayManager;
                if (tray != null)
                    tray.Init();
            }
    
            // Confirm the level has been loaded.
            OnLevelLoaded(CurrentLevelIndex);
        }
    
        public void SetLevelComplete()
        {
            if (currentState == State.LEVEL_COMPLETE)
                return;
    
            currentState = State.LEVEL_COMPLETE;
            Debug.Log("[GameManager] Level complete!");
    
            // Persist progression immediately on win so app restart resumes at the next level.
            if (!testMode)
                SaveLevel(GetNextLevelIndex());
    
            // Lock the game immediately (via state), but delay showing GameWin.
            StartCoroutine(ShowGameWinAfterDelay());
        }
    
        private System.Collections.IEnumerator ShowGameWinAfterDelay()
        {
            yield return new WaitForSeconds(gameWinDelaySeconds);
    
            if (uiManager == null)
                uiManager = FindObjectOfType<UIManager>();
    
            if (uiManager != null && currentState == State.LEVEL_COMPLETE)
                uiManager.Show(UIManager.ViewId.GameWin);
        }
    
        public void SetPlaying()
        {
            // If currently LEVEL_COMPLETE, keep it as-is (game is locked).
            if (currentState == State.LEVEL_COMPLETE) return;
            currentState = State.PLAYING;
        }
    
        public void SetPause()
        {
            // If currently LEVEL_COMPLETE, don't transition to PAUSE.
            if (currentState == State.LEVEL_COMPLETE) return;
            currentState = State.PAUSE;
        }
    
        /// <summary>
        /// Gets the next level index to load:
        /// - TestMode: always returns testLevelIndex.
        /// - Normal: increments from CurrentLevelIndex.
        /// </summary>
        public int GetNextLevelIndex()
        {
            if (testMode)
                return Mathf.Max(1, testLevelIndex);
    
            return Mathf.Max(1, CurrentLevelIndex + 1);
        }
    
        /// <summary>
        /// Called after a new level has been loaded successfully to update CurrentLevelIndex and state.
        /// </summary>
        public void OnLevelLoaded(int levelIndex)
        {
            CurrentLevelIndex = Mathf.Max(1, levelIndex);
            if (!testMode)
                SaveLevel(CurrentLevelIndex);
            currentState = State.PLAYING;
            OnLevelIndexChanged?.Invoke(CurrentLevelIndex);
        }
    
        /// <summary>
        /// Cleans the board & tray before loading a new level.
        /// - Board: clears existing tiles/blocks.
        /// - Tray: resets to a single-row layout (rows = 1, no blocks).
        /// </summary>
        public void CleanBoardAndTray()
        {
            if (boardManager != null)
                boardManager.CleanBoardForNewLevel();
    
            var tray = boardManager != null ? boardManager.TrayManager : null;
            if (tray != null)
                tray.ResetToOneRow();
        }
    
        public void SetCoin(int coin)
        {
            int clamped = Mathf.Max(0, coin);
            if (CurrentCoin == clamped)
            {
                NotifyCoinChanged();
                return;
            }
    
            CurrentCoin = clamped;
            SaveCoin();
            NotifyCoinChanged();
        }
    
        public void AddCoin(int amount)
        {
            if (amount <= 0) return;
            SetCoin(CurrentCoin + amount);
        }
    
        public bool TrySpendCoin(int amount)
        {
            if (amount <= 0) return true;
            if (CurrentCoin < amount) return false;
    
            SetCoin(CurrentCoin - amount);
            return true;
        }
    
        private void LoadCoin()
        {
            CurrentCoin = Mathf.Max(0, PlayerPrefs.GetInt(CoinPlayerPrefsKey, Mathf.Max(0, defaultCoin)));
            NotifyCoinChanged();
        }
    
        private void LoadLevel()
        {
            if (testMode)
            {
                CurrentLevelIndex = Mathf.Max(1, testLevelIndex);
                return;
            }
    
            int defaultLevel = Mathf.Max(1, firstLevelIndex);
            CurrentLevelIndex = Mathf.Max(1, PlayerPrefs.GetInt(LevelPlayerPrefsKey, defaultLevel));
        }
    
        private void SaveCoin()
        {
            PlayerPrefs.SetInt(CoinPlayerPrefsKey, CurrentCoin);
            PlayerPrefs.Save();
        }
    
        private void SaveLevel(int levelIndex)
        {
            if (testMode) return;
            PlayerPrefs.SetInt(LevelPlayerPrefsKey, Mathf.Max(1, levelIndex));
            PlayerPrefs.Save();
        }
    
        private void NotifyCoinChanged()
        {
            OnCoinChanged?.Invoke(CurrentCoin);
        }
    }
    
}
