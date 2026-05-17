using UnityEngine;
using UnityEngine.UI;

namespace GemSortingPuzzle
{
    /// <summary>
    /// Updates the hole position based on the RectTransform target (anchor/pivot).
    /// Set target = booster (or any UI element that needs highlighting); the hole will follow when resizing/moving.
    /// </summary>
    [RequireComponent(typeof(Image))]
    public class UIHoleController : MonoBehaviour
    {
        [Header("Target (theo Anchor)")]
        [SerializeField] private RectTransform holeTarget;
    
        [Header("Radius")]
        [Tooltip("Hole radius (pixels). If <= 0, uses the target size.")]
        [SerializeField] private float holeRadiusPx = -1f;
        [SerializeField] private float holeSoftnessPx = 8f;
    
        [Header("Update")]
        [Tooltip("Update every frame (when the target moves). Disable if you only need to set it once when shown.")]
        [SerializeField] private bool updateEveryFrame = true;
    
        private Material _mat;
        private Canvas _canvas;
        private Camera _cam;
    
        private void Awake()
        {
            var img = GetComponent<Image>();
            if (img.material != null)
                _mat = img.material = Instantiate(img.material);
    
            _canvas = GetComponentInParent<Canvas>();
            _cam = _canvas != null && _canvas.renderMode != RenderMode.ScreenSpaceOverlay
                ? _canvas.worldCamera
                : null;
        }
    
        private void OnEnable()
        {
            RefreshHole();
        }
    
        private void LateUpdate()
        {
            if (updateEveryFrame)
                RefreshHole();
        }
    
        /// <summary>Sets target and updates the hole once.</summary>
        public void SetTarget(RectTransform target)
        {
            holeTarget = target;
            RefreshHole();
        }
    
        /// <summary>Calculates center (0-1) and radius from the target, then assigns them to the material.</summary>
        public void RefreshHole()
        {
            if (_mat == null)
            {
                var img = GetComponent<Image>();
                if (img != null && img.material != null)
                    _mat = img.material;
            }
            if (_mat == null || holeTarget == null) return;
    
            // Center of the target in screen coordinates (pixels)
            Vector2 screenCenter = RectTransformUtility.WorldToScreenPoint(_cam, holeTarget.position);
            // Normalize to 0-1 (like anchor: bottom-left = 0,0, top-right = 1,1)
            float w = Screen.width;
            float h = Screen.height;
            Vector2 norm = new Vector2(screenCenter.x / w, screenCenter.y / h);
            _mat.SetVector("_HoleCenterNorm", new Vector4(norm.x, norm.y, 0f, 0f));
    
            float radiusPx = holeRadiusPx;
            if (radiusPx <= 0f)
            {
                Vector3[] corners = new Vector3[4];
                holeTarget.GetWorldCorners(corners);
                Vector2 a = RectTransformUtility.WorldToScreenPoint(_cam, corners[0]);
                Vector2 b = RectTransformUtility.WorldToScreenPoint(_cam, corners[2]);
                float size = Mathf.Max(Mathf.Abs(b.x - a.x), Mathf.Abs(b.y - a.y)) * 0.5f;
                radiusPx = Mathf.Max(size, 20f);
            }
            _mat.SetFloat("_HoleRadiusPx", radiusPx);
            _mat.SetFloat("_HoleSoftnessPx", holeSoftnessPx);
        }
    }
    
}
