using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using UnityEngine;
#if IAP_ENABLED
using UnityEngine.Purchasing;
#endif

namespace GemSortingPuzzle
{
    /// <summary>
    /// In-App Purchasing manager (Unity IAP).
    /// Create 3 consumable products:
    /// - buy 500 coins (2.99$)
    /// - buy 3000 coins (9.99$)
    /// - buy 5000 coins (19.99$)
    /// Restore transactions for iOS.
    /// </summary>
    public class IAPManager : MonoBehaviour
    {
        public static IAPManager Instance { get; private set; }
    
        [Header("Product IDs (must match the Unity IAP Catalog)")]
        [SerializeField] private string coins500ProductId = "coins_500";
        [SerializeField] private string coins3000ProductId = "coins_3000";
        [SerializeField] private string coins5000ProductId = "coins_5000";
    
        [Header("Editor simulation")]
        [Tooltip("If running in the Editor, pressing Buy will simulate a purchase (does not call the store).")]
        [SerializeField] private bool simulateInEditor = true;
    
    #if IAP_ENABLED
        private StoreController _storeController;
    #else
        private object _storeController;
    #endif
        private bool _isInitialized;
    
        public bool IsInitialized => _isInitialized;
    
        private readonly Dictionary<string, int> _coinsByProductId = new Dictionary<string, int>();
        private readonly HashSet<string> _processedTransactionIds = new HashSet<string>();
    
        public event Action<bool> OnIAPInitialized;
    
        private void Awake()
        {
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject);
                return;
            }
            Instance = this;
            DontDestroyOnLoad(gameObject);
    
            _coinsByProductId.Clear();
            _coinsByProductId[coins500ProductId] = 500;
            _coinsByProductId[coins3000ProductId] = 3000;
            _coinsByProductId[coins5000ProductId] = 5000;
        }
    
        private void Start()
        {
            InitializeIfNeeded();
        }
    
        public void InitializeIfNeeded()
        {
            if (_isInitialized) return;
    
            // Editor simulation: still mark as ready so the UI can be clicked.
    #if UNITY_EDITOR
            if (simulateInEditor)
            {
                _isInitialized = true;
                _storeController = null;
                OnIAPInitialized?.Invoke(true);
                return;
            }
    #endif
    
    #if IAP_ENABLED
            _ = InitializeIapAsync();
    #else
            Debug.LogWarning("[IAPManager] IAP package is not enabled. Add Scripting Define Symbol: IAP_ENABLED.");
            _isInitialized = false;
            OnIAPInitialized?.Invoke(false);
    #endif
        }
    
        private async Task InitializeIapAsync()
        {
            if (_isInitialized) return;
    
    #if IAP_ENABLED
            try
            {
                _storeController = UnityIAPServices.StoreController();
    
                // Purchase flow: reward on pending order, then confirm.
                _storeController.OnPurchasePending += OnPurchasePending;
                _storeController.OnPurchaseConfirmed += OnPurchaseConfirmed;
                _storeController.OnPurchaseFailed += OnPurchaseFailed;
    
                // Products flow: initialize once products fetched.
                _storeController.OnProductsFetched += OnProductsFetched;
                _storeController.OnProductsFetchFailed += OnProductsFetchFailed;
    
                // Connection flow logs.
                _storeController.OnStoreDisconnected += OnStoreDisconnected;
    
                Debug.Log("[IAPManager] Connecting to store...");
                await _storeController.Connect();
    
                var initialProductsToFetch = new List<ProductDefinition>
                {
                    new(coins500ProductId, ProductType.Consumable),
                    new(coins3000ProductId, ProductType.Consumable),
                    new(coins5000ProductId, ProductType.Consumable),
                };
    
                _storeController.FetchProducts(initialProductsToFetch);
            }
            catch (Exception ex)
            {
                Debug.LogError($"[IAPManager] IAP initialization exception: {ex}");
                _isInitialized = false;
                OnIAPInitialized?.Invoke(false);
            }
    #else
            await Task.CompletedTask;
    #endif
        }
    
    #if IAP_ENABLED
        private void OnProductsFetched(List<Product> products)
        {
            _isInitialized = true;
            OnIAPInitialized?.Invoke(true);
    
            // Fetch existing purchases so restore entitlements triggers purchase callbacks.
            _storeController?.FetchPurchases();
        }
    
        private void OnProductsFetchFailed(ProductFetchFailed failure)
        {
            Debug.LogError($"[IAPManager] IAP Products fetch failed: {failure?.FailureReason}");
            _isInitialized = false;
            OnIAPInitialized?.Invoke(false);
        }
    
        private void OnStoreDisconnected(StoreConnectionFailureDescription description)
        {
            Debug.LogWarning($"[IAPManager] Store disconnected: {description?.message}");
            _isInitialized = false;
            OnIAPInitialized?.Invoke(false);
        }
    #endif
    
        public void BuyCoins500() => BuyProductById(coins500ProductId);
        public void BuyCoins3000() => BuyProductById(coins3000ProductId);
        public void BuyCoins5000() => BuyProductById(coins5000ProductId);
    
        private void BuyProductById(string productId)
        {
            if (string.IsNullOrEmpty(productId))
                return;
    
            int coins = _coinsByProductId.TryGetValue(productId, out var c) ? c : 0;
            if (coins <= 0)
            {
                Debug.LogWarning($"[IAPManager] Unknown productId='{productId}'");
                return;
            }
    
            // Editor simulation path
            if (Application.isEditor && simulateInEditor)
            {
                SimulatePurchase(productId, coins);
                return;
            }
    
            if (!IsInitialized || _storeController == null)
            {
                Debug.LogWarning($"[IAPManager] IAP not initialized. productId='{productId}'");
                return;
            }
    
    #if IAP_ENABLED
            Product product = _storeController.GetProductById(productId);
            if (product == null)
            {
                Debug.LogWarning($"[IAPManager] Product not found in store: '{productId}'");
                return;
            }
    
            if (!product.availableToPurchase)
            {
                Debug.LogWarning($"[IAPManager] Product not available to purchase: '{productId}'");
                return;
            }
    
            Debug.Log($"[IAPManager] Initiating purchase: '{productId}'");
            _storeController.PurchaseProduct(product);
    #else
            Debug.LogWarning($"[IAPManager] Cannot purchase '{productId}' because IAP_ENABLED is not defined.");
    #endif
        }
    
        private void SimulatePurchase(string productId, int coins)
        {
            // Fake transaction id (dedupe safe).
            string txId = $"{productId}_{Guid.NewGuid()}";
            if (!string.IsNullOrEmpty(txId))
                _processedTransactionIds.Add(txId);
    
            GrantCoins(coins);
        }
    
        private void GrantCoins(int coins)
        {
            if (coins <= 0) return;
    
            var coinView = GameManager.Instance != null ? GameManager.Instance.CoinView : null;
            if (coinView != null)
                coinView.ReceiveCoin(coins);
            else
                GameManager.Instance?.AddCoin(coins);
        }
    
        public string GetCoins500PriceString() => GetLocalizedPriceString(coins500ProductId);
        public string GetCoins3000PriceString() => GetLocalizedPriceString(coins3000ProductId);
        public string GetCoins5000PriceString() => GetLocalizedPriceString(coins5000ProductId);
    
        private string GetLocalizedPriceString(string productId)
        {
            if (!IsInitialized || _storeController == null) return null;
            if (string.IsNullOrEmpty(productId)) return null;
    
    #if IAP_ENABLED
            var product = _storeController.GetProductById(productId);
            if (product == null) return null;
            var localized = product.metadata?.localizedPriceString;
            return string.IsNullOrEmpty(localized) ? null : localized;
    #else
            return null;
    #endif
        }
    
        public void RestorePurchases(Action<bool> onCompleted = null)
        {
            // Restore only on iOS (requested).
    #if UNITY_IOS && IAP_ENABLED
            if (!IsInitialized)
            {
                onCompleted?.Invoke(false);
                return;
            }
    
            if (_storeController == null)
            {
                onCompleted?.Invoke(false);
                return;
            }
    
            _storeController.RestoreTransactions((success, error) =>
            {
                Debug.Log($"[IAPManager] RestoreTransactions result={success} error={error}");
                onCompleted?.Invoke(success);
            });
    #else
            // Other platforms: no-op
            onCompleted?.Invoke(false);
    #endif
        }
    
    #if IAP_ENABLED
        private void OnPurchasePending(PendingOrder order)
        {
            if (order == null) return;
            if (_storeController == null) return;
    
            // Pending order: transaction id should be available for dedupe.
            string txId = order.Info != null ? order.Info.TransactionID : null;
    
            string productId = null;
            int coinsToGrant = 0;
    
            var items = order.CartOrdered?.Items();
            if (items != null)
            {
                foreach (var cartItem in items)
                {
                    var product = cartItem?.Product;
                    var pid = product?.definition?.id;
                    if (string.IsNullOrEmpty(pid)) continue;
    
                    productId ??= pid;
                    if (_coinsByProductId.TryGetValue(pid, out int c))
                        coinsToGrant += c;
                }
            }
    
            if (string.IsNullOrEmpty(txId))
            {
                // Fallback: keep a stable-ish key when transactionID is missing.
                string receipt = order.Info != null ? order.Info.Receipt : null;
                txId = string.IsNullOrEmpty(receipt)
                    ? productId
                    : $"{productId}_{receipt.GetHashCode()}";
            }
    
            if (!string.IsNullOrEmpty(txId) && _processedTransactionIds.Contains(txId))
            {
                Debug.Log($"[IAPManager] Duplicate transaction ignored: '{productId}'");
                _storeController.ConfirmPurchase(order);
                return;
            }
    
            if (!string.IsNullOrEmpty(txId))
                _processedTransactionIds.Add(txId);
    
            if (coinsToGrant > 0)
            {
                Debug.Log($"[IAPManager] Purchase pending success: productId='{productId}', coins={coinsToGrant}");
                GrantCoins(coinsToGrant);
            }
            else
            {
                Debug.LogWarning($"[IAPManager] Purchase pending unknown productId='{productId}', coins={coinsToGrant}");
            }
    
            // Confirm to complete the transaction.
            _storeController.ConfirmPurchase(order);
        }
    
        private void OnPurchaseConfirmed(Order order)
        {
            if (order == null) return;
    
            if (order is FailedOrder failed)
            {
                Debug.LogWarning($"[IAPManager] Purchase confirmed failed: reason={failed.FailureReason} details={failed.Details}");
            }
            // Confirmed order: we don't grant coins here (we already grant on pending).
        }
    
        private void OnPurchaseFailed(FailedOrder order)
        {
            if (order == null) return;
    
            var firstProduct = order.CartOrdered?.Items()?.FirstOrDefault()?.Product;
            var pid = firstProduct?.definition?.id;
            Debug.LogWarning($"[IAPManager] Purchase failed: '{pid}' reason={order.FailureReason} details={order.Details}");
        }
    #endif
    }
    
    
}
