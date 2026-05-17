using UnityEngine;

namespace GemSortingPuzzle
{
    /// <summary>
    /// A slot that can hold a Block of any color. Unlike Tile, it has no color restriction.
    /// </summary>
    public class TraySlot : MonoBehaviour
    {
        [Header("Sprite Renderers")]
        [SerializeField] private SpriteRenderer view;
    
        private Block _currentBlock;
    
        public SpriteRenderer View => view;
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
                view = transform.Find("View")?.GetComponent<SpriteRenderer>();
            }
        }
    
        /// <summary>
        /// Set the block currently in this slot. Null means slot is empty.
        /// Accepts blocks of any color.
        /// </summary>
        public void SetCurrentBlock(Block block)
        {
            _currentBlock = block;
        }
    //源码网站 开vpn全局模式打开 https://web3incubators.com/
//客服联系方式 https://web3incubators.com/kefu.html
        /// <summary>
        /// Configure slot view from BlockConfig (e.g. for empty slot sprite).
        /// </summary>
        public void Setup(BlockConfig config)
        {
            if (config == null) return;
    
            if (view != null && config.tileSprite != null)
                view.sprite = config.tileSprite;
        }
    }
    
}
