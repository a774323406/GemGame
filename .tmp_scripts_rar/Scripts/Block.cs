using UnityEngine;

namespace GemSortingPuzzle
{
    public class Block : MonoBehaviour
    {
        [Header("Sprite Renderers")]
        [SerializeField] private SpriteRenderer iconView;
        [SerializeField] private SpriteRenderer iconCollapsed;
        [SerializeField] private SpriteRenderer collapseEffect;
    
        [Header("Collapse Effect")]
        [SerializeField] private ParticleSystem collapseParticles;
    
        [Header("Selection")]
        [SerializeField] private float selectHeightOffset = 0.3f;
        [SerializeField] private int selectSortingOrder = 32767;
        private const int UnselectSortingOrder = 10;
    
        private Vector3 _iconViewOriginalLocalPosition;
        private bool _isSelected;
        private bool _isCollapsed;
        private int _row;
        private int _column;
        private int _colorIndex;
    
        public int Row => _row;
        public int Column => _column;
        public int ColorIndex => _colorIndex;
    
        public SpriteRenderer IconView => iconView;
        public SpriteRenderer IconCollapsed => iconCollapsed;
        public SpriteRenderer CollapseEffect => collapseEffect;
    
        private void Awake()
        {
            CacheSpriteRenderers();
            if (iconView != null)
                _iconViewOriginalLocalPosition = iconView.transform.localPosition;
        }
    
        private void CacheSpriteRenderers()
        {
            if (iconView == null || iconCollapsed == null || collapseEffect == null)
            {
                Transform root = transform.Find("Root");
                if (root != null)
                {
                    if (iconView == null) iconView = root.Find("IconView")?.GetComponent<SpriteRenderer>();
                    if (iconCollapsed == null) iconCollapsed = root.Find("IconCollapsed")?.GetComponent<SpriteRenderer>();
                    if (collapseEffect == null) collapseEffect = root.Find("CollapseEffect")?.GetComponent<SpriteRenderer>();
                }
            }
            if (collapseParticles == null)
            {
                var ps = GetComponentInChildren<ParticleSystem>(true);
                if (ps != null) collapseParticles = ps;
            }
        }
    
        /// <summary>
        /// Set grid position and color index for magic selection.
        /// </summary>
        public void SetGridData(int row, int column, int colorIndex)
        {
            _row = row;
            _column = column;
            _colorIndex = colorIndex;
        }
    
        /// <summary>
        /// Configure Block from BlockConfig.
        /// </summary>
        public void Setup(BlockConfig config)
        {
            if (config == null) return;
    
            if (iconView != null)
            {
                if (config.blockSprite != null)
                    iconView.sprite = config.blockSprite;
                iconView.sortingOrder = UnselectSortingOrder;
            }
    
            if (iconCollapsed != null && config.collapseBlockSprite != null)
                iconCollapsed.sprite = config.collapseBlockSprite;
    
            SetIconCollapsedVisible(false);
            SetCollapseEffectVisible(false);
        }
    
        /// <summary>
        /// Select block: raises iconView on Y axis and shows selection.
        /// Collapsed blocks cannot be selected.
        /// </summary>
        public void SelectBlock()
        {
            if (_isCollapsed || _isSelected) return;
            _isSelected = true;
    
            if (iconView != null)
            {
                var pos = _iconViewOriginalLocalPosition;
                iconView.transform.localPosition = new Vector3(pos.x, pos.y + selectHeightOffset, pos.z);
                iconView.sortingOrder = selectSortingOrder;
            }
            // Selection highlight renderer removed; selection is represented by iconView lift/sorting only.
        }
    
        /// <summary>
        /// Unselect block: restores iconView to original position and hides selection.
        /// </summary>
        public void UnSelectBlock()
        {
            if (!_isSelected) return;
            _isSelected = false;
    
            if (iconView != null)
            {
                iconView.transform.localPosition = _iconViewOriginalLocalPosition;
                iconView.sortingOrder = UnselectSortingOrder;
            }
        }
    
        public bool IsSelected => _isSelected;
        public bool IsCollapsed => _isCollapsed;
    
        /// <summary>
        /// Set the scale of the Root transform (e.g. 0.5 when block is in tray).
        /// </summary>
        public void SetRootScale(float scale)
        {
            var root = transform.Find("Root");
            (root != null ? root : transform).localScale = Vector3.one * scale;
        }
    
        /// <summary>
        /// Force iconView sorting order to selected (used while moving).
        /// </summary>
        public void SetSortingToSelectedOrder()
        {
            if (iconView != null)
            {
                iconView.sortingOrder = selectSortingOrder;
            }
    
        }
    
        /// <summary>
        /// Force iconView sorting order back to default/unselected.
        /// </summary>
        public void SetSortingToDefaultOrder()
        {
            if (iconView != null)
            {
                iconView.sortingOrder = UnselectSortingOrder;
            }
        }
    
        /// <summary>
        /// Set sorting layer for icon sprites when moving between board and tray.
        /// Applies to IconView + IconCollapsed only.
        /// </summary>
        public void SetIconSortingLayer(string sortingLayerName)
        {
            if (string.IsNullOrEmpty(sortingLayerName)) return;
            if (iconView != null)
                iconView.sortingLayerName = sortingLayerName;
            if (iconCollapsed != null)
                iconCollapsed.sortingLayerName = sortingLayerName;
        }
    
        /// <summary>
        /// Set collapse state based on tile. If block and tile have same color index, collapse = true.
        /// Collapsed blocks cannot be selected.
        /// </summary>
        /// <param name="playCollapseFeedback">False when spawning the board for the first time: no particles, no sound.</param>
        public void SetCollapse(Tile tile, bool playCollapseFeedback = true)
        {
            bool wasCollapsed = _isCollapsed;
            _isCollapsed = tile != null && tile.ColorIndex == _colorIndex;
    
            if (_isCollapsed)
            {
                SetIconCollapsedVisible(true);
                if (iconView != null) iconView.gameObject.SetActive(false);
                if (playCollapseFeedback)
                {
                    PlayCollapseParticles();
                    if (!wasCollapsed)
                        GameAudio.PlayGemCollapse();
                }
            }
            else
            {
                SetIconCollapsedVisible(false);
                if (iconView != null) iconView.gameObject.SetActive(true);
            }
        }
    
        /// <summary>
        /// Play particle system for collapse effect (if assigned).
        /// </summary>
        public void PlayCollapseParticles()
        {
            if (collapseParticles == null) return;
            collapseParticles.gameObject.SetActive(true);
            collapseParticles.Clear(true);
            collapseParticles.Play(true);
        }
    
        public void SetIconCollapsedVisible(bool visible)
        {
            if (iconCollapsed != null)
                iconCollapsed.gameObject.SetActive(visible);
        }
    
        public void SetCollapseEffectVisible(bool visible)
        {
            if (collapseEffect != null)
                collapseEffect.gameObject.SetActive(visible);
        }
    }
    
}
