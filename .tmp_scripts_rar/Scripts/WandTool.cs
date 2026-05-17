using UnityEngine;

namespace GemSortingPuzzle
{
    /// <summary>
    /// 2D wand tool: drag to move, drop to MakeCollapse all blocks inside its collider area.
    /// Requires a Collider2D (e.g. on the same GameObject or child) and a reference to BoardManager.
    /// To tap the wand with priority over blocks: place the wand in front of the board (Z closer to the camera; e.g. board Z=0, wand Z=-1).
    /// BoardManager ignores block click handling when a raycast hits the WandTool.
    /// </summary>
    [RequireComponent(typeof(Collider2D))]
    public class WandTool : MonoBehaviour
    {
        [SerializeField] private BoardManager boardManager;
        [SerializeField] private Camera mainCamera;
        [SerializeField] private Collider2D wandCollider;
    
        private bool _isDragging;
        private Vector3 _dragOffset;
        private float _zDepth;
    
        private void Awake()
        {
            if (wandCollider == null)
                wandCollider = GetComponent<Collider2D>();
            if (mainCamera == null)
                mainCamera = Camera.main;
            _zDepth = transform.position.z;
        }
    
        /// <summary>
        /// Called from BoardManager when a raycast hits the wand (prioritized over blocks). Drag/release is handled in Update.
        /// </summary>
        public void BeginDrag(Vector2 worldPoint)
        {
            if (mainCamera == null) mainCamera = Camera.main;
            if (mainCamera == null) return;
    
            Vector3 wp = worldPoint;
            wp.z = _zDepth;
            _dragOffset = wp - transform.position;
            _isDragging = true;
        }
    //源码网站 开vpn全局模式打开 https://web3incubators.com/
//客服联系方式 https://web3incubators.com/kefu.html
        private void Update()
        {
            if (!_isDragging) return;
    
            if (mainCamera == null) mainCamera = Camera.main;
    
            if (Input.GetMouseButtonUp(0))
            {
                _isDragging = false;
                if (boardManager != null && wandCollider != null)
                    boardManager.MakeCollapseInArea(wandCollider);
                gameObject.SetActive(false);
                return;
            }
    
            Vector3 worldPos = mainCamera != null ? mainCamera.ScreenToWorldPoint(Input.mousePosition) : transform.position;
            worldPos.z = _zDepth;
            transform.position = worldPos - _dragOffset;
        }
    
        private void OnMouseDown()
        {
            if (_isDragging) return;
            if (mainCamera == null) mainCamera = Camera.main;
            if (mainCamera == null) return;
    
            Vector3 worldPos = mainCamera.ScreenToWorldPoint(Input.mousePosition);
            worldPos.z = _zDepth;
            _dragOffset = worldPos - transform.position;
            _isDragging = true;
        }
    
        private void OnMouseDrag()
        {
            if (!_isDragging || mainCamera == null) return;
            Vector3 worldPos = mainCamera.ScreenToWorldPoint(Input.mousePosition);
            worldPos.z = _zDepth;
            transform.position = worldPos - _dragOffset;
        }
    
        private void OnMouseUp()
        {
            if (!_isDragging) return;
            _isDragging = false;
            if (boardManager != null && wandCollider != null)
                boardManager.MakeCollapseInArea(wandCollider);
            gameObject.SetActive(false);
        }
    }
    
}
