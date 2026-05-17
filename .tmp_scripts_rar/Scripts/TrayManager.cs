using System.Collections.Generic;
using UnityEngine;
using DG.Tweening;

namespace GemSortingPuzzle
{
    /// <summary>
    /// Generates TraySlot instances from prefab. Slots are arranged in configurable rows,
    /// 12 per row, centered along x-axis. Parent transform is SlotRoot.
    /// </summary>
    public class TrayManager : MonoBehaviour
    {
        private const string TraySlotPrefabPath = "Prefabs/Blocks/TraySlot";
        private const int SlotsPerRow = 12;
        private const string TraySortingLayerName = "Tray";
    
        [Header("References")]
        [SerializeField] private GameObject slotPrefab;
        [SerializeField] private Transform slotRoot;
        [SerializeField] private SpriteRenderer trayBG;
        [SerializeField] private Transform moreSlotTransform;
        [SerializeField] private Collider2D moreSlotCollider;
    
        /// <summary>Child MoreSlots — same reference as moreSlotTransform.</summary>
        public GameObject MoreSlotsObject => moreSlotTransform != null ? moreSlotTransform.gameObject : null;
    
        [Header("Layout")]
        [SerializeField] private int rows = 2;
        [SerializeField] private float cellSize = 1f;
        [SerializeField] private float heightPerRow = 1.5f;
        [SerializeField] private float moreSlotYPadding = 0f;
    
        [Header("More Slots Purchase")]
        [Tooltip("Coin price to unlock 1 more slot row (when rows < 3).")]
        [SerializeField] private int moreSlotsBuyPrice = 250;
    
        [Header("Animation")]
        // Values are driven by GameManager -> GameConfig.
        private float moveToTrayDuration = 0.25f;
        private float staggerDelay = 0.1f;
        private float sortDuration = 0.2f;
        private Ease moveEase = Ease.OutQuad;
    
        private List<TraySlot> _slots = new List<TraySlot>();
    
        public float MoveToTrayDuration => moveToTrayDuration;
        public Ease TrayMoveEase => moveEase;
    
        private void Awake()
        {
            CacheSlotRoot();
            CacheMoreSlot();
        }
    
        private void ApplyGameConfig()
        {
            var gm = GameManager.Instance != null ? GameManager.Instance : FindObjectOfType<GameManager>();
            var cfg = gm != null ? gm.GameConfig : null;
            if (cfg == null)
            {
                Debug.LogWarning("[TrayManager] GameConfig is null. Using default tray move timings.");
                return;
            }
    
            moveToTrayDuration = cfg.moveToTrayDuration;
            staggerDelay = cfg.trayStaggerDelay;
            sortDuration = cfg.traySortDuration;
            moveEase = cfg.trayMoveEase;
    
            Debug.Log($"[TrayManager] Config applied: moveToTrayDuration={moveToTrayDuration}, stagger={staggerDelay}, sort={sortDuration}, ease={moveEase}");
        }
    
        /// <summary>
        /// Called by GameManager to initialize the tray for the current level.
        /// Do not call it automatically in Start to avoid running before GameManager.
        /// </summary>
        public void Init()
        {
            ApplyGameConfig();
            GenerateSlots();
        }
    
        private void CacheSlotRoot()
        {
            if (slotRoot == null)
                slotRoot = transform.Find("SlotRoot");
            if (trayBG == null)
            {
                var trayBGObj = transform.Find("TrayBG");
                if (trayBGObj != null)
                    trayBG = trayBGObj.GetComponent<SpriteRenderer>();
            }
        }
    
        private void CacheMoreSlot()
        {
            if (moreSlotTransform == null)
            {
                var moreSlotObj = transform.Find("MoreSlots");
                if (moreSlotObj != null)
                    moreSlotTransform = moreSlotObj;
            }
    
            if (moreSlotCollider == null && moreSlotTransform != null)
                moreSlotCollider = moreSlotTransform.GetComponent<Collider2D>();
    
            UpdateMoreSlotPositionAndVisibility();
        }
    
        /// <summary>
        /// Generate TraySlot grid: configurable rows, 12 slots per row, centered on x-axis.
        /// </summary>
        public void GenerateSlots()
        {
            ClearSlots();
    
            var prefab = slotPrefab != null ? slotPrefab : Resources.Load<GameObject>(TraySlotPrefabPath);
            if (prefab == null)
            {
                Debug.LogError("[TrayManager] TraySlot prefab not found.");
                return;
            }
    
            var parent = slotRoot != null ? slotRoot : transform;
    
            int cols = SlotsPerRow;
    
            for (int r = 0; r < rows; r++)
            {
                for (int c = 0; c < cols; c++)
                {
                    var instance = Instantiate(prefab, parent);
                    instance.name = $"TraySlot_{r}_{c}";
    
                    // Centered on x-axis: (c - (cols-1)/2) * cellSize
                    // Rows: row 0 at top (higher y), row 1 below
                    float x = (c - (cols - 1) * 0.5f) * cellSize;
                    float y = ((rows - 1) * 0.5f - r) * cellSize;
                    instance.transform.localPosition = new Vector3(x, y, 0f);
    
                    var slot = instance.GetComponent<TraySlot>();
                    if (slot != null)
                        _slots.Add(slot);
                }
            }
    
            UpdateTrayBGHeight();
            UpdateMoreSlotPositionAndVisibility();
    
            Debug.Log($"[TrayManager] Created {_slots.Count} slots ({rows}x{cols})");
        }
    
        /// <summary>
        /// Increase the number of rows by 1 (up to 3) while keeping the blocks currently on the tray.
        /// Reposition all existing slots according to the new rows, then add new slots for the added row.
        /// </summary>
        private void ExpandRowsByOne()
        {
            if (rows >= 3) return;
    
            int oldRows = rows;
            int cols = SlotsPerRow;
            int existingSlotCount = _slots.Count;
    
            rows = Mathf.Min(rows + 1, 3);
    
            var parent = slotRoot != null ? slotRoot : transform;
            var prefab = slotPrefab != null ? slotPrefab : Resources.Load<GameObject>(TraySlotPrefabPath);
            if (prefab == null)
            {
                Debug.LogError("[TrayManager] TraySlot prefab not found (ExpandRowsByOne).");
                return;
            }
    
            // Reposition all existing slots based on the new rows (child blocks follow their slots automatically).
            for (int i = 0; i < existingSlotCount; i++)
            {
                var slot = _slots[i];
                if (slot == null) continue;
    
                int r = i / cols;
                int c = i % cols;
    
                float x = (c - (cols - 1) * 0.5f) * cellSize;
                float y = ((rows - 1) * 0.5f - r) * cellSize;
                slot.transform.localPosition = new Vector3(x, y, 0f);
            }
    
            // Create slots for the new row (if rows increased)
            for (int r = oldRows; r < rows; r++)
            {
                for (int c = 0; c < cols; c++)
                {
                    var instance = Instantiate(prefab, parent);
                    instance.name = $"TraySlot_{r}_{c}";
    
                    float x = (c - (cols - 1) * 0.5f) * cellSize;
                    float y = ((rows - 1) * 0.5f - r) * cellSize;
                    instance.transform.localPosition = new Vector3(x, y, 0f);
    
                    var slot = instance.GetComponent<TraySlot>();
                    if (slot != null)
                        _slots.Add(slot);
                }
            }
    
            UpdateTrayBGHeight();
            UpdateMoreSlotPositionAndVisibility();
        }
    
        /// <summary>
        /// Update TrayBG SpriteRenderer size height based on number of rows.
        /// </summary>
        private void UpdateTrayBGHeight()
        {
            if (trayBG == null) return;
    
            var size = trayBG.size;
            size.y = heightPerRow * rows;
            trayBG.size = size;
        }
    
        private void UpdateMoreSlotPositionAndVisibility()
        {
            if (moreSlotTransform == null || trayBG == null)
                return;
    
            // Hide when reaching the maximum of 3 rows.
            bool show = rows < 3;
            // TutorialView may force-hide MoreSlots — do not re-enable it when Init/GenerateSlots runs after the tutorial called SetActive(false).
            if (TutorialView.Instance != null && TutorialView.Instance.IsTutorialHidingMoreSlots)
                show = false;
    
            moreSlotTransform.gameObject.SetActive(show);
            if (!show) return;
    
            // Place MoreSlot at the bottom-center of TrayBG, with Y padding to adjust up/down.
            // Use bounds (world) to calculate, then apply back to MoreSlot.
            var bounds = trayBG.bounds;
            float y = bounds.min.y + moreSlotYPadding;
            Vector3 bottomCenter = new Vector3(bounds.center.x, y, moreSlotTransform.position.z);
            moreSlotTransform.position = bottomCenter;
        }
    
        private void ClearSlots()
        {
            foreach (var slot in _slots)
            {
                if (slot != null && slot.gameObject != null)
                    Destroy(slot.gameObject);
            }
            _slots.Clear();
        }
    
        /// <summary>
        /// Called by GameManager when preparing to load a new level:
        /// - Reset the tray to a one-row layout (rows = 1).
        /// - Clear all old slots and create empty slots again.
        /// (Blocks were destroyed by BoardManager during ClearBlocks.)
        /// </summary>
        public void ResetToOneRow()
        {
            rows = 1;
            GenerateSlots();
        }
    
        /// <summary>
        /// Try to place given blocks into empty tray slots (left-to-right, top-to-bottom).
        /// Returns true if all blocks were placed, false if there were not enough empty slots
        /// or blocks collection was empty.
        /// </summary>
        /// <summary>
        /// Returns true if the block is currently in one of this tray's slots.
        /// </summary>
        public bool IsBlockOnTray(Block block)
        {
            if (block == null) return false;
            foreach (var slot in _slots)
            {
                if (slot != null && slot.CurrentBlock == block)
                    return true;
            }
            return false;
        }
    
        /// <summary>
        /// Remove block from its tray slot (e.g. when moving block back to board). Returns true if block was on tray.
        /// </summary>
        public bool RemoveBlockFromTray(Block block)
        {
            if (block == null) return false;
            foreach (var slot in _slots)
            {
                if (slot != null && slot.CurrentBlock == block)
                {
                    slot.SetCurrentBlock(null);
                    return true;
                }
            }
            return false;
        }
    
         /// <summary>
         /// Find the TraySlot that currently holds the given block. Returns null if the block is not on this tray.
         /// </summary>
         public TraySlot FindSlotForBlock(Block block)
         {
             if (block == null) return null;
             foreach (var slot in _slots)
             {
                 if (slot != null && slot.CurrentBlock == block)
                     return slot;
             }
             return null;
         }
    
        public bool TryPlaceBlocks(IReadOnlyCollection<Block> blocks)
        {
            if (blocks == null || blocks.Count == 0) return false;
    
            var blocksToPlace = new List<Block>();
            foreach (var b in blocks)
            {
                if (b != null && !IsBlockOnTray(b))
                    blocksToPlace.Add(b);
            }
            if (blocksToPlace.Count == 0) return false;
    
            var emptySlots = new List<TraySlot>();
            foreach (var slot in _slots)
            {
                if (slot != null && slot.IsEmpty)
                    emptySlots.Add(slot);
            }
    
            if (emptySlots.Count < blocksToPlace.Count)
                return false;
    
            for (int i = 0; i < blocksToPlace.Count; i++)
            {
                var block = blocksToPlace[i];
                var slot = emptySlots[i];
    
                if (block == null || slot == null) continue;
    
                slot.SetCurrentBlock(block);
                block.UnSelectBlock();
                block.SetRootScale(1f);
                block.SetSortingToSelectedOrder();
                block.SetIconSortingLayer(TraySortingLayerName);
    
                var blockTransform = block.transform;
                Vector3 startWorldPos = blockTransform.position;
                float startScale = blockTransform.lossyScale.x;
    
                blockTransform.SetParent(slot.transform, true);
                blockTransform.position = startWorldPos;
                blockTransform.localScale = Vector3.one * startScale;
    
                float delay = i * staggerDelay;
                GameAudio.PlayMoveGem();
                blockTransform
                    .DOLocalMove(Vector3.zero, moveToTrayDuration)
                    .SetDelay(delay)
                    .SetEase(moveEase)
                    .OnComplete(() =>
                    {
                        GameAudio.PlayGemStop();
                        block.SetSortingToDefaultOrder();
                    });
    
                blockTransform.DOScale(0.5f, moveToTrayDuration).SetDelay(delay).SetEase(moveEase);
            }
    
            float sortStartDelay = (blocksToPlace.Count - 1) * staggerDelay + moveToTrayDuration;
            DOVirtual.DelayedCall(sortStartDelay, () => SortTrayBlocksByColor());
            return true;
        }
    
        /// <summary>
        /// Handle clicks on the MoreSlots button (BoxCollider2D on moreSlotTransform).
        /// If clicked, increase the number of rows (max 3) and update the layout.
        /// Returns true if the click was processed.
        /// </summary>
        public bool TryHandleMoreSlotClick(Vector2 worldPoint)
        {
            if (moreSlotCollider == null || !moreSlotCollider.gameObject.activeInHierarchy)
                return false;
    
            if (!moreSlotCollider.OverlapPoint(worldPoint))
                return false;
    
            GameAudio.PlayUiButtonClick();
    
            // Increase rows: 1 -> 2 -> 3, max 3, while keeping existing blocks.
            if (rows < 3)
            {
                var gm = GameManager.Instance;
                if (gm == null)
                {
                    Debug.LogWarning("[TrayManager] GameManager.Instance is null. Cannot buy MoreSlots.");
                    return true;
                }
    
                // Requirement: you must have enough coins to perform the add logic.
                if (gm.TrySpendCoin(moreSlotsBuyPrice))
                {
                    ExpandRowsByOne();
                }
                else
                {
                    OpenShopView();
                }
            }
            else
            {
                UpdateMoreSlotPositionAndVisibility();
            }
            return true;
        }
    
        private void OpenShopView()
        {
            var gm = GameManager.Instance;
            if (gm != null && gm.UIManager != null)
            {
                gm.UIManager.Show(UIManager.ViewId.Shop);
                return;
            }
    
            var shop = FindObjectOfType<ShopView>(true);
            shop?.Show();
        }
    
        /// <summary>
        /// Try to place given blocks into consecutive empty tray slots starting from a specific TraySlot.
        /// </summary>
        public bool TryPlaceBlocksFromSlot(TraySlot startSlot, IReadOnlyCollection<Block> blocks)
        {
            if (startSlot == null || blocks == null || blocks.Count == 0) return false;
    
            int startIndex = _slots.IndexOf(startSlot);
            if (startIndex < 0) return false;
    
            // Only proceed if the clicked slot itself is empty
            if (!startSlot.IsEmpty) return false;
    
            var blocksToPlace = new List<Block>();
            foreach (var b in blocks)
            {
                if (b != null && !IsBlockOnTray(b))
                    blocksToPlace.Add(b);
            }
            if (blocksToPlace.Count == 0) return false;
    
            // Collect all empty slots across the tray (index 0 -> end), so blocks can fill
            // the tray from left to right, starting anywhere but including the clicked slot.
            var emptySlots = new List<TraySlot>();
            for (int i = 0; i < _slots.Count; i++)
            {
                var slot = _slots[i];
                if (slot != null && slot.IsEmpty)
                    emptySlots.Add(slot);
            }
    
            if (emptySlots.Count == 0) return false;
    
            int count = Mathf.Min(blocksToPlace.Count, emptySlots.Count);
    
            for (int i = 0; i < count; i++)
            {
                var block = blocksToPlace[i];
                var slot = emptySlots[i];
                if (block == null || slot == null) continue;
    
                slot.SetCurrentBlock(block);
                block.UnSelectBlock();
                block.SetRootScale(1f);
                block.SetSortingToSelectedOrder();
                block.SetIconSortingLayer(TraySortingLayerName);
    
                var blockTransform = block.transform;
                Vector3 startWorldPos = blockTransform.position;
                float startScale = blockTransform.lossyScale.x;
    
                blockTransform.SetParent(slot.transform, true);
                blockTransform.position = startWorldPos;
                blockTransform.localScale = Vector3.one * startScale;
    
                float delay = i * staggerDelay;
                GameAudio.PlayMoveGem();
                blockTransform
                    .DOLocalMove(Vector3.zero, moveToTrayDuration)
                    .SetDelay(delay)
                    .SetEase(moveEase)
                    .OnComplete(() =>
                    {
                        GameAudio.PlayGemStop();
                        block.SetSortingToDefaultOrder();
                    });
    
                blockTransform.DOScale(0.5f, moveToTrayDuration).SetDelay(delay).SetEase(moveEase);
            }
    
            float sortStartDelay = (count - 1) * staggerDelay + moveToTrayDuration;
            DOVirtual.DelayedCall(sortStartDelay, () => SortTrayBlocksByColor());
            return true;
        }
    
        /// <summary>
        /// Get contiguous blocks of the same color around the given block on the tray.
        /// Blocks are returned in increasing TraySlot index order.
        /// </summary>
        public List<Block> GetContiguousBlocksSameColor(Block startBlock)
        {
            var result = new List<Block>();
            if (startBlock == null) return result;
    
            int startIndex = -1;
            for (int i = 0; i < _slots.Count; i++)
            {
                var slot = _slots[i];
                if (slot != null && slot.CurrentBlock == startBlock)
                {
                    startIndex = i;
                    break;
                }
            }
            if (startIndex < 0) return result;
    
            int targetColor = startBlock.ColorIndex;
    
            // expand left
            for (int i = startIndex; i >= 0; i--)
            {
                var slot = _slots[i];
                if (slot == null) break;
                var block = slot.CurrentBlock;
                if (block == null || block.ColorIndex != targetColor) break;
                result.Add(block);
            }
    
            // expand right (skip startIndex, already included from left loop)
            for (int i = startIndex + 1; i < _slots.Count; i++)
            {
                var slot = _slots[i];
                if (slot == null) break;
                var block = slot.CurrentBlock;
                if (block == null || block.ColorIndex != targetColor) break;
                result.Add(block);
            }
    
            // result naturally ordered from lower index to higher index
            return result;
        }
    
        /// <summary>
        /// Returns true if we need to sort: (1) same-color blocks are not in adjacent slots, or
        /// (2) there is an empty slot in the middle of blocks, or leading empty slots before the first block.
        /// </summary>
        private bool NeedSortTray()
        {
            int n = _slots.Count;
            if (n == 0) return false;
    
            // Build slot states (empty vs color index)
            var slotStates = new List<(bool isEmpty, int color)>();
            for (int i = 0; i < n; i++)
            {
                var slot = _slots[i];
                if (slot == null || slot.IsEmpty)
                {
                    slotStates.Add((true, -1));
                    continue;
                }
                var block = slot.CurrentBlock;
                slotStates.Add((false, block != null ? block.ColorIndex : -1));
            }
    
            // Condition 1: same color not adjacent — any color appears in more than one "run"
            var colorsInPreviousRuns = new HashSet<int>();
            int runColor = -1;
            for (int i = 0; i < n; i++)
            {
                var (isEmpty, color) = slotStates[i];
                if (isEmpty || color < 0)
                {
                    if (runColor >= 0)
                    {
                        colorsInPreviousRuns.Add(runColor);
                        runColor = -1;
                    }
                    continue;
                }
                if (runColor < 0)
                {
                    if (colorsInPreviousRuns.Contains(color)) return true;
                    runColor = color;
                }
                else if (runColor != color)
                {
                    colorsInPreviousRuns.Add(runColor);
                    if (colorsInPreviousRuns.Contains(color)) return true;
                    runColor = color;
                }
            }
    
            // Condition 2a: leading empty — first block is not at index 0
            int firstBlockIndex = -1;
            for (int i = 0; i < n; i++)
            {
                if (!slotStates[i].isEmpty) { firstBlockIndex = i; break; }
            }
            if (firstBlockIndex > 0) return true;
    
            // Condition 2b: empty in middle — after at least one block, we see empty then block again
            bool foundBlock = false;
            bool foundEmptyAfterBlock = false;
            for (int i = 0; i < n; i++)
            {
                if (slotStates[i].isEmpty)
                {
                    if (foundBlock) foundEmptyAfterBlock = true;
                }
                else
                {
                    if (foundEmptyAfterBlock) return true;
                    foundBlock = true;
                }
            }
    
            return false;
        }
    
        /// <summary>
        /// Sort all blocks on the tray by color index so same-color blocks are adjacent (like sorting cards).
        /// Only runs when needed: same-color blocks not adjacent, or gaps (leading empty / empty in middle).
        /// </summary>
        public void SortTrayBlocksByColor()
        {
            if (!NeedSortTray()) return;
    
            var blocks = new List<Block>();
            foreach (var slot in _slots)
            {
                if (slot == null || slot.IsEmpty) continue;
                var block = slot.CurrentBlock;
                if (block != null)
                {
                    blocks.Add(block);
                    slot.SetCurrentBlock(null);
                }
            }
    
            if (blocks.Count == 0) return;
    
            blocks.Sort((a, b) => a.ColorIndex.CompareTo(b.ColorIndex));
    
            for (int i = 0; i < blocks.Count && i < _slots.Count; i++)
            {
                var block = blocks[i];
                var slot = _slots[i];
                if (slot == null) continue;
    
                slot.SetCurrentBlock(block);
                var blockTransform = block.transform;
                Vector3 startWorldPos = blockTransform.position;
                float keepScale = blockTransform.lossyScale.x;
    
                blockTransform.SetParent(slot.transform, true);
                blockTransform.position = startWorldPos;
                blockTransform.localScale = Vector3.one * keepScale;
    
                block.SetIconSortingLayer(TraySortingLayerName);
    
                blockTransform
                    .DOLocalMove(Vector3.zero, sortDuration)
                    .SetEase(moveEase)
                    .OnComplete(() =>
                    {
                        GameAudio.PlayGemStop();
                    });
            }
        }
    
        public IReadOnlyList<TraySlot> Slots => _slots;
    }
    
}
