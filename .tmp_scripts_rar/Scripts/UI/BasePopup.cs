using UnityEngine;
using DG.Tweening;

namespace GemSortingPuzzle
{
    /// <summary>
    /// Popup base: similar to Panel (CanvasGroup Alpha, Interactable, Block Raycasts)
    /// and adds a scale-bounce animation for RootContent when showing/hiding.
    /// </summary>
    public class BasePopup : BasePanel
    {
        [Header("Popup - Root Content")]
        [SerializeField] protected RectTransform rootContent;
    
        [Header("Scale Animation")]
        [SerializeField] protected float scaleDuration = 0.35f;
        [SerializeField] protected Ease scaleEase = Ease.OutBounce;
    
        protected override void Awake()
        {
            base.Awake();
            if (rootContent == null)
                rootContent = GetComponent<RectTransform>();
        }
    
        protected override void OnDestroy()
        {
            base.OnDestroy();
            rootContent?.DOKill();
        }
    
        public override void Show()
        {
            if (canvasGroup == null) return;
    
            canvasGroup.alpha = 0f;
            canvasGroup.interactable = false;
            canvasGroup.blocksRaycasts = false;
    
            if (rootContent != null)
                rootContent.localScale = Vector3.zero;
    
            var fadeTween = canvasGroup
                .DOFade(1f, fadeDuration)
                .SetUpdate(true);
    
            if (rootContent != null)
            {
                rootContent
                    .DOScale(Vector3.one, scaleDuration)
                    .SetEase(scaleEase)
                    .SetUpdate(true)
                    .OnComplete(() =>
                    {
                        canvasGroup.interactable = true;
                        canvasGroup.blocksRaycasts = true;
                        _isVisible = true;
                        OnShown();
                    });
            }
            else
            {
                fadeTween.OnComplete(() =>
                {
                    canvasGroup.interactable = true;
                    canvasGroup.blocksRaycasts = true;
                    _isVisible = true;
                    OnShown();
                });
            }
        }
    
        public override void Hide()
        {
            if (canvasGroup == null) return;
    
            canvasGroup.interactable = false;
            canvasGroup.blocksRaycasts = false;
            _isVisible = false;
    
            int completed = 0;
            const int total = 2;
    
            void TryFinish()
            {
                completed++;
                if (completed >= total)
                    OnHidden();
            }
    
            canvasGroup
                .DOFade(0f, fadeDuration)
                .SetUpdate(true)
                .OnComplete(TryFinish);
    
            if (rootContent != null)
            {
                rootContent
                    .DOScale(Vector3.zero, scaleDuration * 0.7f)
                    .SetEase(Ease.InBack)
                    .SetUpdate(true)
                    .OnComplete(TryFinish);
            }
            else
            {
                TryFinish();
            }
        }
    }
    
}
