using System.Collections.Generic;
using DG.Tweening;
using UnityEngine;
using UnityEngine.UI;

namespace GemSortingPuzzle
{
    /// <summary>
    /// Displays coins and the coin-receive animation:
    /// - FlyCoins burst randomly around Vector2.zero
    /// - Fly sequentially to the target along a curved path
    /// - Only at the end: add coins and tween the coinValue text
    /// </summary>
    public class CoinView : BasePanel
    {
        public enum CurveDirection
        {
            Auto,
            Left,
            Right
        }
    
        [Header("Layout")]
        [SerializeField] private Text coinValue;
        [SerializeField] private RectTransform targetTransform;
    
        [Header("Shop (Plus Button)")]
        [Tooltip("Find an object in the scene by name to bind a click that opens ShopView. Default: 'Plus'.")]
        [SerializeField] private string plusObjectName = "Plus";
        [SerializeField] private bool bindPlusAutomatically = true;
    
        [Header("Fly Coins")]
        [Tooltip("List of fly coins. Do not hard-code the count.")]
        [SerializeField] private List<RectTransform> flyCoins = new List<RectTransform>();
        [Tooltip("Auto-cache children whose names start with 'FlyCoin' when the list is empty.")]
        [SerializeField] private bool autoCollectFlyCoins = true;
        [SerializeField] private string flyCoinNamePrefix = "FlyCoin";
    
        [Header("Spread (Burst)")]
        [SerializeField] private float burstRadiusMin = 40f;
        [SerializeField] private float burstRadiusMax = 120f;
        [SerializeField] private float burstDuration = 0.2f;
        [SerializeField] private Ease burstEase = Ease.OutQuad;
    
        [Header("Fly To Target")]
        [SerializeField] private float perCoinDelay = 0.05f;
        [SerializeField] private float flyDuration = 0.45f;
        [SerializeField] private Ease flyEase = Ease.InQuad;
        [Tooltip("Curvature strength of the flying trajectory. Larger value means more curve.")]
        [SerializeField] private float curveStrength = 80f;
        [Tooltip("Curve smoothness (number of sample points).")]
        [SerializeField] private int curveSmoothness = 16;
        [Tooltip("Enable so all fly coins use the same curved path (no random curve per coin).")]
        [SerializeField] private bool useConsistentCurve = true;
        [SerializeField] private CurveDirection curveDirection = CurveDirection.Right;
        [Tooltip("Curvature profile over flight time. Larger value deviates more from a straight line.")]
        [SerializeField] private AnimationCurve curveProfile = new AnimationCurve(
            new Keyframe(0f, 0f),
            new Keyframe(0.25f, 0.18f),
            new Keyframe(0.7f, 1f),
            new Keyframe(1f, 0f)
        );
    
        [Header("Editor Gizmos")]
        [SerializeField] private bool showTrajectoryGizmos = true;
        [SerializeField] private Color trajectoryGizmoColor = new Color(1f, 0.85f, 0.2f, 0.9f);
        [SerializeField] private int trajectoryPreviewCount = 3;
    
        [Header("Coin Value Tween")]
        [SerializeField] private float coinValueTweenDuration = 0.35f;
        [SerializeField] private Ease coinValueTweenEase = Ease.OutCubic;
    
        private bool _isSubscribed;
        private bool _suppressCoinChanged;
        private Tween _coinValueTween;
        private Sequence _receiveCoinSequence;
        private int _displayedCoin;
    
        protected override void Awake()
        {
            base.Awake();
            AutoCollectFlyCoinsIfNeeded();
            ResetFlyCoinsImmediate();
        }
    
        private void OnEnable()
        {
            BindAndRefresh();
            if (bindPlusAutomatically)
                BindPlusButton();
        }
    
        private void Start()
        {
            // Ensure the app always shows the correct coin immediately on initialization.
            BindAndRefresh();
        }
    
        private void BindPlusButton()
        {
            if (string.IsNullOrEmpty(plusObjectName))
                return;
    
            var go = GameObject.Find(plusObjectName);
            if (go == null)
                return;
    
            var btn = go.GetComponent<Button>();
            if (btn == null)
                btn = go.AddComponent<Button>();
    
            if (btn.targetGraphic == null)
            {
                var graphic = go.GetComponent<Graphic>();
                if (graphic != null)
                    btn.targetGraphic = graphic;
            }
    
            btn.onClick.RemoveAllListeners();
            btn.onClick.AddListener(OnPlusClicked);
        }
    
        private void OnPlusClicked()
        {
            GameAudio.PlayUiButtonClick();
            // Prefer UIManager.
            var ui = GameManager.Instance != null ? GameManager.Instance.UIManager : FindObjectOfType<UIManager>();
            if (ui != null)
            {
                ui.Show(UIManager.ViewId.Shop);
                return;
            }
    
            var shop = FindObjectOfType<ShopView>(true);
            if (shop != null)
                shop.Show();
        }
    
        private void OnDisable()
        {
            Unbind();
            KillTweens();
        }
    
        protected override void OnDestroy()
        {
            KillTweens();
            base.OnDestroy();
        }
    
        private void Update()
        {
            // Debug shortcut: press G to test receiving 200 coins and the fly animation.
            if (Input.GetKeyDown(KeyCode.G))
                ReceiveCoin(200);
        }
    
        /// <summary>
        /// Coin receive animation. Only after all fly coins finish will the coin amount increase.
        /// </summary>
        public void ReceiveCoin(int amount)
        {
            ReceiveCoin(amount, targetTransform, null);
        }
    
        /// <summary>
        /// Coin receive animation with callback when completed (after coins were added and the coinValue tween finished).
        /// </summary>
        public void ReceiveCoin(int amount, System.Action onCompleted)
        {
            ReceiveCoin(amount, targetTransform, onCompleted);
        }
    
        /// <summary>
        /// Coin receive animation with an optional target.
        /// </summary>
        public void ReceiveCoin(int amount, RectTransform target, System.Action onCompleted = null)
        {
            if (amount <= 0) return;
    
            var gm = GetGameManager();
            if (gm == null)
            {
                Debug.LogWarning("[CoinView] GameManager not found.");
                return;
            }
    
            AutoCollectFlyCoinsIfNeeded();
            KillTweens();
            ResetFlyCoinsImmediate();
    
            int startCoin = gm.CurrentCoin;
            int endCoin = startCoin + amount;
    
            int count = flyCoins != null ? flyCoins.Count : 0;
            if (count == 0 || target == null)
            {
                ApplyCoinIncreaseWithTween(gm, startCoin, endCoin, onCompleted);
                return;
            }
    
            _receiveCoinSequence = DOTween.Sequence();
    
            for (int i = 0; i < count; i++)
            {
                var fly = flyCoins[i];
                if (fly == null) continue;
    
                fly.gameObject.SetActive(true);
                fly.anchoredPosition = Vector2.zero;
    
                Vector2 burstTarget = Random.insideUnitCircle.normalized * Random.Range(burstRadiusMin, burstRadiusMax);
                _receiveCoinSequence.Insert(0f, fly.DOLocalMove(burstTarget, burstDuration).SetEase(burstEase));
            }
    
            for (int i = 0; i < count; i++)
            {
                var fly = flyCoins[i];
                if (fly == null) continue;
    
                float startAt = burstDuration + i * perCoinDelay;
                var flyTween = CreateFlyToTargetTween(fly, target);
                flyTween.OnStart(() => GameAudio.PlayFlyCoin());
                _receiveCoinSequence.Insert(startAt, flyTween);
            }
    
            _receiveCoinSequence.OnComplete(() =>
            {
                ApplyCoinIncreaseWithTween(gm, startCoin, endCoin, onCompleted);
                ResetFlyCoinsImmediate();
            });
        }
    
        private Tween CreateFlyToTargetTween(RectTransform fly, RectTransform target)
        {
            Vector3 start = fly.position;
            Vector3 end = target.position;
            float sign = ResolveCurveSign(start, end);
            Vector3[] path = BuildCurvePath(start, end, curveStrength, Mathf.Max(4, curveSmoothness), sign, curveProfile);
    
            return fly
                .DOPath(path, flyDuration, PathType.CatmullRom, PathMode.Ignore, resolution: Mathf.Max(5, curveSmoothness))
                .SetEase(flyEase)
                .OnComplete(() =>
                {
                    fly.gameObject.SetActive(false);
                    fly.anchoredPosition = Vector2.zero;
                });
        }
    
        private static Vector3[] BuildCurvePath(Vector3 start, Vector3 end, float strength, int smoothness, float sign, AnimationCurve profile)
        {
            smoothness = Mathf.Max(4, smoothness);
    
            Vector3 dir = end - start;
            Vector3 perp = Vector3.Cross(dir.normalized, Vector3.forward); // 2D XY
    
            var points = new Vector3[smoothness];
            for (int i = 0; i < smoothness; i++)
            {
                float t = (i + 1f) / smoothness;
                Vector3 linear = Vector3.LerpUnclamped(start, end, t);
                float offset = Mathf.Max(0f, profile != null ? profile.Evaluate(t) : 0f);
                points[i] = linear + perp * (offset * strength * sign);
            }
            return points;
        }
    
        private static Vector3 EvaluateQuadraticBezier(Vector3 p0, Vector3 p1, Vector3 p2, float t)
        {
            float oneMinusT = 1f - t;
            return oneMinusT * oneMinusT * p0 + 2f * oneMinusT * t * p1 + t * t * p2;
        }
    
        private static Vector3[] BuildPreviewCurvePath(Vector3 start, Vector3 end, float strength, int smoothness, float sign, AnimationCurve profile)
        {
            smoothness = Mathf.Max(4, smoothness);
    
            Vector3 dir = end - start;
            Vector3 perp = Vector3.Cross(dir.normalized, Vector3.forward); // 2D XY
    
            var points = new Vector3[smoothness + 1];
            points[0] = start;
            for (int i = 1; i <= smoothness; i++)
            {
                float t = i / (float)smoothness;
                Vector3 linear = Vector3.LerpUnclamped(start, end, t);
                float offset = Mathf.Max(0f, profile != null ? profile.Evaluate(t) : 0f);
                points[i] = linear + perp * (offset * strength * sign);
            }
            return points;
        }
    
        private float ResolveCurveSign(Vector3 start, Vector3 end)
        {
            if (!useConsistentCurve)
                return Random.value > 0.5f ? 1f : -1f;
    
            switch (curveDirection)
            {
                case CurveDirection.Left:
                    return -1f;
                case CurveDirection.Right:
                    return 1f;
                default:
                    // Auto: if going from left to right, curve right; otherwise curve left.
                    return end.x >= start.x ? 1f : -1f;
            }
        }
    
        private void OnDrawGizmosSelected()
        {
            if (!showTrajectoryGizmos || targetTransform == null) return;
    
            Vector3 start = transform.position;
            Vector3 end = targetTransform.position;
    
            Gizmos.color = trajectoryGizmoColor;
            Gizmos.DrawSphere(start, 0.04f);
            Gizmos.DrawSphere(end, 0.04f);
    
            int count = Mathf.Max(1, trajectoryPreviewCount);
            float baseSign = ResolveCurveSign(start, end);
            for (int i = 0; i < count; i++)
            {
                float strengthScale = 1f + i * 0.15f;
                var preview = BuildPreviewCurvePath(
                    start,
                    end,
                    curveStrength * strengthScale,
                    Mathf.Max(4, curveSmoothness),
                    baseSign,
                    curveProfile
                );
    
                for (int p = 1; p < preview.Length; p++)
                    Gizmos.DrawLine(preview[p - 1], preview[p]);
            }
        }
    
        private void ApplyCoinIncreaseWithTween(GameManager gm, int fromValue, int toValue, System.Action onCompleted)
        {
            _suppressCoinChanged = true;
            gm.SetCoin(toValue); // coin data increases immediately when the fly animation completes
    
            _coinValueTween?.Kill();
            _coinValueTween = DOTween
                .To(() => fromValue, val =>
                {
                    _displayedCoin = val;
                    UpdateCoinText(_displayedCoin);
                }, toValue, coinValueTweenDuration)
                .SetEase(coinValueTweenEase)
                .OnComplete(() =>
                {
                    _suppressCoinChanged = false;
                    HandleCoinChanged(gm.CurrentCoin);
                    onCompleted?.Invoke();
                });
        }
    
        private void AutoCollectFlyCoinsIfNeeded()
        {
            if (!autoCollectFlyCoins) return;
            if (flyCoins != null && flyCoins.Count > 0) return;
    
            flyCoins = new List<RectTransform>();
            for (int i = 0; i < transform.childCount; i++)
            {
                var child = transform.GetChild(i);
                CollectFlyCoinsRecursive(child);
            }
        }
    
        private void CollectFlyCoinsRecursive(Transform node)
        {
            if (node == null) return;
    
            if (!string.IsNullOrEmpty(flyCoinNamePrefix) && node.name.StartsWith(flyCoinNamePrefix))
            {
                var rt = node as RectTransform;
                if (rt != null)
                    flyCoins.Add(rt);
            }
    
            for (int i = 0; i < node.childCount; i++)
                CollectFlyCoinsRecursive(node.GetChild(i));
        }
    
        private void ResetFlyCoinsImmediate()
        {
            if (flyCoins == null) return;
    
            for (int i = 0; i < flyCoins.Count; i++)
            {
                var fly = flyCoins[i];
                if (fly == null) continue;
    
                fly.DOKill();
                fly.anchoredPosition = Vector2.zero;
                fly.gameObject.SetActive(false);
            }
        }
    
        private void KillTweens()
        {
            _coinValueTween?.Kill();
            _receiveCoinSequence?.Kill();
            _coinValueTween = null;
            _receiveCoinSequence = null;
        }
    
        private void BindAndRefresh()
        {
            var gm = GetGameManager();
            if (gm == null) return;
    
            if (!_isSubscribed)
            {
                gm.OnCoinChanged += HandleCoinChanged;
                _isSubscribed = true;
            }
    
            HandleCoinChanged(gm.CurrentCoin);
        }
    
        private void Unbind()
        {
            if (!_isSubscribed) return;
    
            var gm = GameManager.Instance;
            if (gm != null)
                gm.OnCoinChanged -= HandleCoinChanged;
    
            _isSubscribed = false;
        }
    
        private void HandleCoinChanged(int coin)
        {
            if (_suppressCoinChanged) return;
            _displayedCoin = coin;
            UpdateCoinText(coin);
        }
    
        private void UpdateCoinText(int value)
        {
            if (coinValue == null) return;
            coinValue.text = value.ToString();
        }
    
        private static GameManager GetGameManager()
        {
            return GameManager.Instance != null ? GameManager.Instance : FindObjectOfType<GameManager>();
        }
    }
    
    
}
