using UnityEngine;
using DG.Tweening;

namespace GemSortingPuzzle
{
    /// <summary>
    /// Attached to the Hand object. Only animates transform <see cref="handIcon"/> (the finger Image).
    /// </summary>
    public class HandClickAnimation : MonoBehaviour
    {
        [SerializeField] private Transform handIcon;
    
        [Header("Click pulse")]
        [SerializeField] private float pressScale = 0.88f;
        [SerializeField] private float pressDuration = 0.08f;
        [SerializeField] private float releaseDuration = 0.14f;
        [SerializeField] private Ease pressEase = Ease.OutQuad;
        [SerializeField] private Ease releaseEase = Ease.OutBack;
    
        [Header("Loop (tutorial)")]
        [SerializeField] private bool playOnEnable = true;
        [SerializeField] private float intervalBetweenClicks = 1.2f;
    
        private Vector3 _baseLocalScale = Vector3.one;
        private Sequence _clickSequence;
        private Tween _loopTween;
    
        private void Awake()
        {
            if (handIcon == null)
                handIcon = transform.Find("handIcon");
    
            if (handIcon != null)
                _baseLocalScale = handIcon.localScale;
        }
    
        private void OnEnable()
        {
            if (playOnEnable && handIcon != null)
                StartLoop();
        }
    
        private void OnDisable()
        {
            KillTweens();
            if (handIcon != null)
                handIcon.localScale = _baseLocalScale;
        }
    
        /// <summary>Plays a tap-like animation beat (press down — release).</summary>
        public void PlayClick()
        {
            if (handIcon == null) return;
    
            KillClickOnly();
    
            _clickSequence = DOTween.Sequence();
            _clickSequence.Append(handIcon.DOScale(_baseLocalScale * pressScale, pressDuration).SetEase(pressEase));
            _clickSequence.Append(handIcon.DOScale(_baseLocalScale, releaseDuration).SetEase(releaseEase));
        }
    
        /// <summary>Repeat <see cref="PlayClick"/> with an interval of <see cref="intervalBetweenClicks"/>.</summary>
        public void StartLoop()
        {
            if (handIcon == null) return;
    
            StopLoop();
            PlayClick();
            _loopTween = DOTween.Sequence()
                .AppendInterval(intervalBetweenClicks)
                .AppendCallback(() => PlayClick())
                .SetLoops(-1, LoopType.Restart);
        }
    
        public void StopLoop()
        {
            if (_loopTween != null && _loopTween.IsActive())
                _loopTween.Kill();
            _loopTween = null;
            KillClickOnly();
        }
    
        private void KillClickOnly()
        {
            if (_clickSequence != null && _clickSequence.IsActive())
                _clickSequence.Kill();
            _clickSequence = null;
        }
    
        private void KillTweens()
        {
            StopLoop();
            if (handIcon != null)
                handIcon.DOKill();
        }
    }
    
}
