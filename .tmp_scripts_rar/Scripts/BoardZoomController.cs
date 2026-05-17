using UnityEngine;

namespace GemSortingPuzzle
{
    /// <summary>
    /// Zoom applies only to the board content (BoardManager.BoardZoomRoot — usually the child Root).
    /// Mouse: scroll wheel. Mobile: pinch with 2 fingers.
    /// Pan (drag the board) at any zoom level — right/middle button (PC), 1 finger (mobile). Refit resets pan back to anchor.
    /// </summary>
    public class BoardZoomController : MonoBehaviour
    {
    
        [SerializeField] private BoardManager boardManager;
    
        [Tooltip("Overrides BoardZoomRoot from BoardManager (for testing). Leave empty to use BoardManager.BoardZoomRoot.")]
        [SerializeField] private Transform boardRootOverride;
    
        [SerializeField] private Camera zoomCamera;
    
        [SerializeField] private float minZoomMul = 0.5f;
        [SerializeField] private float maxZoomMul = 2.5f;
        [SerializeField] private float scrollSensitivity = 0.08f;
    
        [Header("Pan (all zoom levels)")]
        [Tooltip("Pan limits (local space of the parent Root) per axis, around the anchor position.")]
        [SerializeField] private Vector2 maxPanLocal = new Vector2(5f, 8f);
    
        [Header("Zoom mode")]
        [Tooltip("When zoomMul deviates from 1f beyond this threshold, allow panning with the left mouse button.")]
        [SerializeField] private float zoomModeThreshold = 0.01f;
    
        public bool IsZoomMode => Mathf.Abs(_zoomMul - 1f) > zoomModeThreshold;
    
        private bool _lastZoomEnabled = true;
    
        private Transform _target;
        private float _baseUniformScale = 1f;
        private float _zoomMul = 1f;
        private float _lastPinchDistance;
        private bool _pinchTracking;
    
        private Vector3 _designerOriginLocalPosition;
        private bool _hasDesignerOrigin;
        private Vector3 _panOffsetLocal;
        private Vector3 _panMousePrevScreen;
        private int _activePanFingerId = -1;
    
        private void Awake()
        {
            if (boardManager == null)
                boardManager = FindObjectOfType<BoardManager>();
        }
    
        private void OnEnable()
        {
            ResolveTarget();
            CaptureBaseScale();
        }
    
        /// <summary>Called from BoardManager after FitToPortraitScreen to sync the base scale (user zoom reset).</summary>
        public static void NotifyBoardRefit(BoardManager bm)
        {
            if (bm == null) return;
            var controllers = FindObjectsOfType<BoardZoomController>();
            for (int i = 0; i < controllers.Length; i++)
            {
                if (controllers[i].boardManager == bm)
                    controllers[i].CaptureBaseScale();
            }
        }
    
        public void CaptureBaseScale()
        {
            ResolveTarget();
            if (_target == null)
                return;
    
            EnsureDesignerOriginCached();
    
            _panOffsetLocal = Vector3.zero;
            _target.localPosition = _designerOriginLocalPosition;
    
            _baseUniformScale = Mathf.Max(0.0001f, _target.localScale.x);
            _zoomMul = 1f;
            ApplyBoardTransform();
        }
    
        private void EnsureDesignerOriginCached()
        {
            if (_target == null || _hasDesignerOrigin)
                return;
            _designerOriginLocalPosition = _target.localPosition;
            _hasDesignerOrigin = true;
        }
    
        private void ResolveTarget()
        {
            if (boardRootOverride != null)
            {
                _target = boardRootOverride;
                return;
            }
    
            if (boardManager == null)
                boardManager = FindObjectOfType<BoardManager>();
    
            _target = boardManager != null ? boardManager.BoardZoomRoot : null;
        }
    
        private Camera GetCam()
        {
            if (zoomCamera != null)
                return zoomCamera;
            return Camera.main;
        }
    
        private void Update()
        {
            if (_target == null)
                return;
    
            var gm = GameManager.Instance;
            if (gm != null &&
                (gm.CurrentState == GameManager.State.LEVEL_COMPLETE ||
                 gm.CurrentState == GameManager.State.PAUSE))
                return;
    
            Camera cam = GetCam();
    
            bool zoomEnabled = true;
            if (boardManager != null)
                zoomEnabled = boardManager.IsBoardZoomEnabledForCurrentLevel();
    
            if (!zoomEnabled)
            {
                if (_lastZoomEnabled)
                    CaptureBaseScale(); // reset to fit + pan=0
                _lastZoomEnabled = false;
                return; // does not accept zoom/pan input
            }
            _lastZoomEnabled = true;
    
            // Scroll (Editor / desktop)
            float scroll = Input.mouseScrollDelta.y;
            if (Mathf.Abs(scroll) > 0.001f)
            {
                float factor = 1f + scroll * scrollSensitivity;
                ApplyZoomMultiplier(factor);
            }
    
            // Pinch (touch)
            if (Input.touchCount == 2)
            {
                Touch t0 = Input.GetTouch(0);
                Touch t1 = Input.GetTouch(1);
                float distance = Vector2.Distance(t0.position, t1.position);
    
                if (t0.phase == TouchPhase.Began || t1.phase == TouchPhase.Began)
                {
                    _lastPinchDistance = Mathf.Max(distance, 1f);
                    _pinchTracking = true;
                }
                else if (_pinchTracking &&
                         (t0.phase == TouchPhase.Moved || t1.phase == TouchPhase.Moved ||
                          t0.phase == TouchPhase.Stationary || t1.phase == TouchPhase.Stationary))
                {
                    float safeLast = Mathf.Max(_lastPinchDistance, 1f);
                    float ratio = Mathf.Max(distance, 1f) / safeLast;
                    ApplyZoomMultiplier(ratio);
                    _lastPinchDistance = Mathf.Max(distance, 1f);
                }
            }
            else
                _pinchTracking = false;
    
            // Pan only while zoomed (IsZoomMode) to avoid breaking block selection clicks at zoom = 1.
            // If a WandTool is visible: prioritize dragging the WandTool, and do not pan the board with left mouse/1 finger.
            bool wandActive = false;
            {
                var wand = FindObjectOfType<WandTool>(true);
                wandActive = wand != null && wand.gameObject.activeInHierarchy;
            }
    
            if (cam != null && IsZoomMode && !wandActive)
            {
                // PC/Editor: drag board with left mouse button (ignore when there are touches).
                if (Input.touchCount == 0 && Input.GetMouseButtonDown(0))
                    _panMousePrevScreen = Input.mousePosition;
    
                if (Input.touchCount == 0 && Input.GetMouseButton(0))
                {
                    Vector3 cur = Input.mousePosition;
                    Vector3 d = cur - _panMousePrevScreen;
                    _panMousePrevScreen = cur;
                    ApplyPanScreenDelta(new Vector2(d.x, d.y), cam);
                }
    
                // Mobile: 1 active finger (no pinch). Lock pan to one finger id to avoid jump
                // when another finger taps while the first is still down.
                if (Input.touchCount >= 2)
                {
                    _activePanFingerId = -1;
                }
                else if (Input.touchCount == 1 && !_pinchTracking)
                {
                    Touch t = Input.GetTouch(0);
                    if (t.phase == TouchPhase.Began)
                    {
                        _activePanFingerId = t.fingerId;
                    }
                    else if (t.phase == TouchPhase.Ended || t.phase == TouchPhase.Canceled)
                    {
                        if (_activePanFingerId == t.fingerId)
                            _activePanFingerId = -1;
                    }
                    else if (t.phase == TouchPhase.Moved && _activePanFingerId == t.fingerId)
                    {
                        ApplyPanScreenDelta(t.deltaPosition, cam);
                    }
                }
            }
            else
            {
                _activePanFingerId = -1;
            }
    
            ApplyBoardTransform();
        }
    
        private void ApplyPanScreenDelta(Vector2 screenDelta, Camera cam)
        {
            if (_target.parent == null || !cam.orthographic)
                return;
    
            Vector2 worldDelta = ScreenDeltaToWorldDelta(screenDelta, cam);
            Vector3 worldVec = new Vector3(worldDelta.x, worldDelta.y, 0f);
            Vector3 localDelta = _target.parent.InverseTransformVector(worldVec);
    
            // Drag with your hand: drag right/up -> move the board in the same direction (add delta).
            _panOffsetLocal += new Vector3(localDelta.x, localDelta.y, 0f);
            _panOffsetLocal = ClampPanOffset(_panOffsetLocal);
        }
    
        private static Vector2 ScreenDeltaToWorldDelta(Vector2 screenDelta, Camera cam)
        {
            float orthoH = cam.orthographicSize * 2f;
            float orthoW = orthoH * Screen.width / (float)Screen.height;
            float wx = (screenDelta.x / Screen.width) * orthoW;
            float wy = (screenDelta.y / Screen.height) * orthoH;
            return new Vector2(wx, wy);
        }
    
        private Vector3 ClampPanOffset(Vector3 p)
        {
            return new Vector3(
                Mathf.Clamp(p.x, -maxPanLocal.x, maxPanLocal.x),
                Mathf.Clamp(p.y, -maxPanLocal.y, maxPanLocal.y),
                0f);
        }
    
        private void ApplyZoomMultiplier(float delta)
        {
            if (_target == null || delta <= 0f)
                return;
    
            _zoomMul = Mathf.Clamp(_zoomMul * delta, minZoomMul, maxZoomMul);
            ApplyBoardTransform();
        }
    
        private void ApplyBoardTransform()
        {
            if (_target == null)
                return;
    
            EnsureDesignerOriginCached();
    
            float s = _baseUniformScale * _zoomMul;
            _target.localScale = new Vector3(s, s, s);
            if (IsZoomMode)
            {
                _panOffsetLocal = ClampPanOffset(_panOffsetLocal);
                _target.localPosition = _designerOriginLocalPosition + _panOffsetLocal;
            }
            else
            {
                // When returning to the exact fit level (zoomMul ~ 1), reset pan so selection clicks work reliably.
                _panOffsetLocal = Vector3.zero;
                _target.localPosition = _designerOriginLocalPosition;
            }
        }
    }
    
}
