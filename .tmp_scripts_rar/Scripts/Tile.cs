using UnityEngine;

namespace GemSortingPuzzle
{
    public class Tile : MonoBehaviour
    {
        [Header("Sprite Renderers")]
        [SerializeField] private SpriteRenderer view;
    
        private int _colorIndex;
        private Block _currentBlock;
        private int _row;
        private int _column;
    
        public SpriteRenderer View => view;
        public int ColorIndex => _colorIndex;
        public int Row => _row;
        public int Column => _column;
        public Block CurrentBlock => _currentBlock;
        public bool IsEmpty => _currentBlock == null;
    
        private void Awake()
        {
            CacheSpriteRenderer();
        }
    
        private void CacheSpriteRenderer()
        {
            if (view == null)
            {
                Transform root = transform.Find("Root");
                if (root != null)
                {
                    view = root.Find("View")?.GetComponent<SpriteRenderer>();
                }
            }
        }
    
        /// <summary>
        /// Set the block currently on this tile. Null means tile is empty.
        /// </summary>
        public void SetCurrentBlock(Block block)
        {
            _currentBlock = block;
        }
    
        /// <summary>
        /// Set grid position and color index (for collapse and tile logic).
        /// </summary>
        public void SetGridData(int row, int column, int colorIndex)
        {
            _row = row;
            _column = column;
            _colorIndex = colorIndex;
        }
    
        /// <summary>
        /// Set color index from Complete Level matrix (for collapse comparison).
        /// </summary>
        public void SetColorIndex(int colorIndex)
        {
            _colorIndex = colorIndex;
        }
    
        /// <summary>
        /// Configure Tile from BlockConfig.
        /// </summary>
        public void Setup(BlockConfig config)
        {
            if (config == null) return;
    
            if (view != null && config.tileSprite != null)
                view.sprite = config.tileSprite;
        }
    }
    
}
