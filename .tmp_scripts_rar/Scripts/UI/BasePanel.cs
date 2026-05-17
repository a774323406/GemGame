using UnityEngine;
using DG.Tweening;

namespace GemSortingPuzzle
{
    /// <summary>
    /// Panel base: show/hide effect via CanvasGroup (Alpha, Interactable, Block Raycasts).
    /// </summary>
    public class BasePanel : MonoBehaviour
    {
        [Header("CanvasGroup")]
        [SerializeField] protected CanvasGroup canvasGroup;
    
        [Header("Animation")]
        [SerializeField] protected float fadeDuration = 0.25f;
    
        protected bool _isVisible;
    
        protected virtual void Awake()
        {
            if (canvasGroup == null)
                canvasGroup = GetComponent<CanvasGroup>();
            if (canvasGroup == null)
                canvasGroup = gameObject.AddComponent<CanvasGroup>();
        }
    
        protected virtual void OnDestroy()
        {
            canvasGroup?.DOKill();
        }
    
        /// <summary>Show panel: fade in and enable interaction.</summary>
        public virtual void Show()
        {
            if (canvasGroup == null) return;
    
            canvasGroup.DOKill();
    
            canvasGroup.alpha = 0f;
            canvasGroup.interactable = false;
            canvasGroup.blocksRaycasts = false;
    
            canvasGroup
                .DOFade(1f, fadeDuration)
                .SetUpdate(true)
                .OnComplete(() =>
                {
                    canvasGroup.interactable = true;
                    canvasGroup.blocksRaycasts = true;
                    _isVisible = true;
                    OnShown();
                });
        }
    
        /// <summary>Hide panel: disable interaction and fade out.</summary>
        public virtual void Hide()
        {
            if (canvasGroup == null) return;
    
            canvasGroup.DOKill();
    
            canvasGroup.interactable = false;
            canvasGroup.blocksRaycasts = false;
            _isVisible = false;
    
            canvasGroup
                .DOFade(0f, fadeDuration)
                .SetUpdate(true)
                .OnComplete(OnHidden);
        }
    
        protected virtual void OnShown() { }
        protected virtual void OnHidden() { }
    
        public bool IsVisible => _isVisible;
    }
    
}
