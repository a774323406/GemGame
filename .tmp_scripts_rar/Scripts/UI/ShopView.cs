using UnityEngine;
#if ADS_ENABLED
using GoogleMobileAds.Api;
using UnityEngine.Advertisements;
using static GemSortingPuzzle.AdsControl;
#endif
using UnityEngine.UI;

namespace GemSortingPuzzle
{
    /// <summary>
    /// Shop popup: Free + 3 IAP packs (500/3000/5000 coins).
    /// </summary>
    public class ShopView : BasePopup
    {
        private const string FreeName = "Free";
        private const string CloseName = "Close";
        private const string SmallPackName = "SmallPack";
        private const string MediumPackName = "MediumPack";
        private const string BigPackName = "BigPack";
        private const string BuyName = "Buy";
        private const string PriceTextName = "coinPriceValue";
    
        [Header("Free reward")]
        [SerializeField] private int freeCoins = 50;
    
        [Header("Product buttons")]
        [SerializeField] private bool bindButtonsOnAwake = true;
    
        private Button _freeButton;
        private Button _closeButton;
    
        private Button _buySmallButton;
        private Button _buyMediumButton;
        private Button _buyBigButton;
    
        private Text _smallPriceText;
        private Text _mediumPriceText;
        private Text _bigPriceText;
    
        private bool _isBindingDone;
    
        private void Awake()
        {
            if (bindButtonsOnAwake)
                CacheNodesAndBindButtons();
        }
    
        private void CacheNodesAndBindButtons()
        {
            _freeButton = EnsureButton(FindDeepChildGameObject(transform, FreeName));
            _closeButton = EnsureButton(FindDeepChildGameObject(transform, CloseName));
    
            var smallPack = FindDeepChild(transform, SmallPackName);
            var mediumPack = FindDeepChild(transform, MediumPackName);
            var bigPack = FindDeepChild(transform, BigPackName);
    
            _buySmallButton = EnsureButton(FindDeepChildGameObject(smallPack, BuyName));
            _buyMediumButton = EnsureButton(FindDeepChildGameObject(mediumPack, BuyName));
            _buyBigButton = EnsureButton(FindDeepChildGameObject(bigPack, BuyName));
    
            _smallPriceText = FindDeepChildText(smallPack, PriceTextName);
            _mediumPriceText = FindDeepChildText(mediumPack, PriceTextName);
            _bigPriceText = FindDeepChildText(bigPack, PriceTextName);
    
            if (_freeButton != null)
            {
                _freeButton.onClick.RemoveAllListeners();
                _freeButton.onClick.AddListener(WatchAds);
            }
    
            if (_closeButton != null)
            {
                _closeButton.onClick.RemoveAllListeners();
                _closeButton.onClick.AddListener(OnCloseClicked);
            }
    
            if (_buySmallButton != null)
            {
                _buySmallButton.onClick.RemoveAllListeners();
                _buySmallButton.onClick.AddListener(() => TryBuyCoins500());
            }
    
            if (_buyMediumButton != null)
            {
                _buyMediumButton.onClick.RemoveAllListeners();
                _buyMediumButton.onClick.AddListener(() => TryBuyCoins3000());
            }
    
            if (_buyBigButton != null)
            {
                _buyBigButton.onClick.RemoveAllListeners();
                _buyBigButton.onClick.AddListener(() => TryBuyCoins5000());
            }
    
            _isBindingDone = true;
        }
    
        public override void Show()
        {
            // Pause gameplay while shop is visible.
            var gm = GameManager.Instance;
            if (gm != null)
                gm.SetPause();
    
            // Ensure binding exists even if object became active later.
            if (!_isBindingDone && bindButtonsOnAwake == false)
                CacheNodesAndBindButtons();
    
            var iap = IAPManager.Instance;
            if (iap != null)
                iap.InitializeIfNeeded();
    
            RefreshInteractableAndPrice();
            base.Show();
        }
    
        protected override void OnHidden()
        {
            // Resume gameplay when shop popup fully hides.
            var gm = GameManager.Instance;
            if (gm != null && gm.CurrentState == GameManager.State.PAUSE)
                gm.SetPlaying();
        }
    
        private void RefreshInteractableAndPrice()
        {
            var iap = IAPManager.Instance;
            bool iapReady = iap != null && iap.IsInitialized;
    
            if (_buySmallButton != null) _buySmallButton.interactable = iapReady;
            if (_buyMediumButton != null) _buyMediumButton.interactable = iapReady;
            if (_buyBigButton != null) _buyBigButton.interactable = iapReady;
    
            // Update price labels when possible; otherwise keep whatever is in scene.
            if (iapReady)
            {
                string pSmall = iap.GetCoins500PriceString();
                string pMed = iap.GetCoins3000PriceString();
                string pBig = iap.GetCoins5000PriceString();
                if (!string.IsNullOrEmpty(pSmall) && _smallPriceText != null) _smallPriceText.text = pSmall;
                if (!string.IsNullOrEmpty(pMed) && _mediumPriceText != null) _mediumPriceText.text = pMed;
                if (!string.IsNullOrEmpty(pBig) && _bigPriceText != null) _bigPriceText.text = pBig;
            }
        }
    
        private void OnFreeClicked()
        {
            // TODO: placeholder for ads; now directly grant.
            var coinView = GameManager.Instance != null ? GameManager.Instance.CoinView : null;
            if (coinView != null)
                coinView.ReceiveCoin(freeCoins);
            else
                GameManager.Instance?.AddCoin(freeCoins);
        }
    
        private void OnCloseClicked()
        {
            GameAudio.PlayUiButtonClick();
            Hide();
    
            var ui = GameManager.Instance != null ? GameManager.Instance.UIManager : null;
            if (ui != null)
                ui.Show(UIManager.ViewId.Game);
        }
    
        private void TryBuyCoins500()
        {
            GameAudio.PlayUiButtonClick();
            if (IAPManager.Instance == null) return;
            if (!IAPManager.Instance.IsInitialized) return;
            IAPManager.Instance.BuyCoins500();
        }
    
        private void TryBuyCoins3000()
        {
            GameAudio.PlayUiButtonClick();
            if (IAPManager.Instance == null) return;
            if (!IAPManager.Instance.IsInitialized) return;
            IAPManager.Instance.BuyCoins3000();
        }
    
        private void TryBuyCoins5000()
        {
            GameAudio.PlayUiButtonClick();
            if (IAPManager.Instance == null) return;
            if (!IAPManager.Instance.IsInitialized) return;
            IAPManager.Instance.BuyCoins5000();
        }
    
        private static GameObject FindDeepChildGameObject(Transform parent, string name)
        {
            var t = FindDeepChild(parent, name);
            return t != null ? t.gameObject : null;
        }
    
        private static Transform FindDeepChild(Transform parent, string name)
        {
            if (parent == null) return null;
            if (string.IsNullOrEmpty(name)) return null;
    
            foreach (Transform child in parent)
            {
                if (child != null && child.name == name)
                    return child;
    
                var found = FindDeepChild(child, name);
                if (found != null)
                    return found;
            }
    
            return null;
        }
    
        private static Text FindDeepChildText(Transform parent, string name)
        {
            var go = FindDeepChildGameObject(parent, name);
            return go != null ? go.GetComponent<Text>() : null;
        }
    
        private static Button EnsureButton(GameObject go)
        {
            if (go == null) return null;
    
            var btn = go.GetComponent<Button>();
            if (btn == null)
                btn = go.AddComponent<Button>();
    
            if (btn.targetGraphic == null)
                btn.targetGraphic = go.GetComponentInChildren<Graphic>();
    
            return btn;
        }
        public void WatchAds()
        {
            GameAudio.PlayUiButtonClick();
    #if ADS_ENABLED
            if (AdsControl.Instance.currentAdsType == ADS_TYPE.ADMOB)
            {
                if (AdsControl.Instance.rewardedAd != null)
                {
                    if (AdsControl.Instance.rewardedAd.CanShowAd())
                    {
                        AdsControl.Instance.ShowRewardAd(EarnReward);
                    }
                }
            }
            else if (AdsControl.Instance.currentAdsType == ADS_TYPE.UNITY)
            {
                ShowRWUnityAds();
            }
            else if (AdsControl.Instance.currentAdsType == ADS_TYPE.MEDIATION)
            {
                if (AdsControl.Instance.rewardedAd.CanShowAd())
    
                    AdsControl.Instance.ShowRewardAd(EarnReward);
    
                else
                    ShowRWUnityAds();
            }
    #endif
        }
    
    #if ADS_ENABLED
        public void EarnReward(Reward reward)
        {
            OnFreeClicked();
            Hide();
        }
    #endif
        public void ShowRWUnityAds()
        {
    #if ADS_ENABLED
            AdsControl.Instance.PlayUnityVideoAd((string ID, UnityAdsShowCompletionState callBackState) =>
            {
    
                if (ID.Equals(AdsControl.Instance.adUnityRWUnitId) && callBackState.Equals(UnityAdsShowCompletionState.COMPLETED))
                {
    
                    // TODO: Implement ad watching logic
                    Debug.Log("Watch Ad clicked - Implement ad logic here");
    
                    // For testing: Add prop uses directly
                    OnFreeClicked();
                    Hide();
                }
    
                if (ID.Equals(AdsControl.Instance.adUnityRWUnitId) && callBackState.Equals(UnityAdsShowCompletionState.COMPLETED))
                {
                    AdsControl.Instance.LoadUnityAd();
                }
    
            });
    #endif
        }
    }
    
    
}
