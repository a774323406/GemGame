using UnityEngine;
using UnityEngine.UI;

namespace GemSortingPuzzle
{
    /// <summary>
    /// Booster button: Magic / Brush / Magnet.
    /// Includes icon, remaining uses count, and CoinBar (purchase price).
    /// </summary>
    public class BoosterButton : MonoBehaviour
    {
        public enum BoosterType
        {
            Magic,
            Brush,
            Magnet
        }
    
        [Header("Type")]
        [SerializeField] private BoosterType boosterType = BoosterType.Magic;
    
        [Header("References")]
        [SerializeField] private Image boosterIcon;
        [SerializeField] private Text boosterValue;
        [SerializeField] private RectTransform boosterValueRoot;
        [SerializeField] private RectTransform coinBar;
        [SerializeField] private Text coinPriceValue;
        [SerializeField] private GameObject lockObject;
        [SerializeField] private Text levelLockTxt;
    
        [Header("Button")]
        [SerializeField] private Button button;
    
        private int _remainingUses;
        private bool _isLocked;
        private UnityEngine.Events.UnityAction _onBoosterActivated;
    
        [Header("Purchase (when uses == 0)")]
        [Tooltip("Coin price to buy 1 more booster use when uses are exhausted.")]
        [SerializeField] private int buyOneUsePrice = 250;
    
        public BoosterType Type => boosterType;
    
        private void Awake()
        {
            if (button == null)
                button = GetComponent<Button>();
    
            // Internal click handler wraps external booster logic
            if (button != null)
            {
                button.onClick.RemoveAllListeners();
                button.onClick.AddListener(HandleClickInternal);
            }
    
            // Load saved uses from PlayerPrefs (per booster type).
            // Fallback initial uses are taken from GameManager -> GameConfig.
            int defaultUses = GetInitialUsesFromConfig();
    
            string key = GetPrefsKey();
            if (PlayerPrefs.HasKey(key))
            {
                _remainingUses = Mathf.Max(0, PlayerPrefs.GetInt(key, defaultUses));
            }
            else
            {
                _remainingUses = Mathf.Max(0, defaultUses);
                PlayerPrefs.SetInt(key, _remainingUses);
            }
    
            RefreshVisualState();
        }
    
        /// <summary>Sets the booster icon.</summary>
        public void SetIcon(Sprite sprite)
        {
            if (boosterIcon != null && sprite != null)
                boosterIcon.sprite = sprite;
        }
    
        /// <summary>Displays remaining uses count.</summary>
        public void SetCount(int count)
        {
            if (boosterValue != null)
                boosterValue.text = count.ToString();
        }
    
        /// <summary>Displays the price (coin).</summary>
        public void SetPrice(int price)
        {
            if (coinPriceValue != null)
                coinPriceValue.text = price.ToString();
        }
    
        /// <summary>Show/hide CoinBar (when you have enough coins or already purchased).</summary>
        public void SetCoinBarVisible(bool visible)
        {
            if (coinBar != null)
                coinBar.gameObject.SetActive(visible);
        }
    
        /// <summary>
        /// Updates the lock state by level.
        /// - Lock: hide CoinBar + BoosterIcon + BoosterValueRoot, show LockObject + level text.
        /// - Unlock: show the booster UI again according to the remaining uses logic.
        /// </summary>
        public void SetLocked(bool isLocked, int unlockLevel)
        {
            _isLocked = isLocked;
    
            if (lockObject != null)
                lockObject.SetActive(_isLocked);
    
            if (levelLockTxt != null)
                levelLockTxt.text = $"Level{Mathf.Max(1, unlockLevel)}";
    
            if (_isLocked)
            {
                if (boosterIcon != null)
                    boosterIcon.gameObject.SetActive(false);
                if (boosterValueRoot != null)
                    boosterValueRoot.gameObject.SetActive(false);
                if (coinBar != null)
                    coinBar.gameObject.SetActive(false);
                SetInteractable(false);
                return;
            }
    
            if (boosterIcon != null)
                boosterIcon.gameObject.SetActive(true);
            SetInteractable(true);
            RefreshVisualState();
        }
    
        /// <summary>Enable/disable button interaction.</summary>
        public void SetInteractable(bool interactable)
        {
            if (button != null)
                button.interactable = interactable;
        }
    
        /// <summary>
        /// Registers the booster logic callback when activated.
        /// Store it without overriding the internal handler (except remaining uses and UI updates).
        /// </summary>
        public void SetClickListener(UnityEngine.Events.UnityAction onClick)
        {
            _onBoosterActivated = onClick;
        }
    
        /// <summary>
        /// Internal click handler:
        /// - If there are remaining uses, subtract 1, update UI, and invoke booster logic.
        /// - If uses are exhausted, show CoinBar, hide valueRoot, and TODO: show toast / use coins.
        /// </summary>
        private void HandleClickInternal()
        {
            if (_isLocked)
                return;
    
            GameAudio.PlayUiButtonClick();
    
            if (_remainingUses > 0)
            {
                _remainingUses--;
                RefreshVisualState();
                SaveUses();
    
                _onBoosterActivated?.Invoke();
            }
            else
            {
                // Uses exhausted: if you have enough coins buy 1 more, otherwise open Shop.
                TryBuyOneUseOrOpenShop();
            }
        }
    
        private void TryBuyOneUseOrOpenShop()
        {
            var gm = GameManager.Instance;
            if (gm == null)
            {
                Debug.LogWarning($"[BoosterButton] GameManager.Instance is null. Cannot buy booster use for {boosterType}.");
                return;
            }
    
            if (gm.TrySpendCoin(buyOneUsePrice))
            {
                _remainingUses++;
                RefreshVisualState();
                SaveUses();
                return;
            }
    
            // Not enough coins: open the shop for the user to buy more.
            var ui = gm.UIManager;
            if (ui != null)
            {
                ui.Show(UIManager.ViewId.Shop);
                return;
            }
    
            // Fallback if UIManager is not ready.
            var shop = FindObjectOfType<ShopView>(true);
            shop?.Show();
        }
    
        /// <summary>
        /// Updates visuals depending on the remaining uses.
        /// - Has uses: hide CoinBar, show boosterValueRoot + the quantity text.
        /// - No uses: show CoinBar, hide boosterValueRoot.
        /// </summary>
        private void RefreshVisualState()
        {
            SetCount(_remainingUses);
            if (_isLocked)
                return;
    
            bool hasUses = _remainingUses > 0;
    
            if (boosterValueRoot != null)
                boosterValueRoot.gameObject.SetActive(hasUses);
    
            if (coinBar != null)
                coinBar.gameObject.SetActive(!hasUses);
        }
    
        private string GetPrefsKey()
        {
            return $"Booster_{boosterType}_Uses";
        }
    
        private int GetInitialUsesFromConfig()
        {
            var cfg = GameManager.Instance != null ? GameManager.Instance.GameConfig : null;
            if (cfg == null)
                return 3;
    
            switch (boosterType)
            {
                case BoosterType.Magic: return Mathf.Max(0, cfg.magicInitialUses);
                case BoosterType.Brush: return Mathf.Max(0, cfg.brushInitialUses);
                case BoosterType.Magnet: return Mathf.Max(0, cfg.magnetInitialUses);
                default: return 3;
            }
        }
    
        private void SaveUses()
        {
            string key = GetPrefsKey();
            PlayerPrefs.SetInt(key, _remainingUses);
            PlayerPrefs.Save();
        }
    }
    
}
