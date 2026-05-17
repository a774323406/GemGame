using System.Collections.Generic;
using UnityEngine;
using DG.Tweening;

namespace GemSortingPuzzle
{
    public class BoardManager : MonoBehaviour
    {
        private const string BlockConfigPath = "Configs/Blocks";
        private const string TilePrefabPath = "Prefabs/Blocks/Tile";
        private const string EmptyTilePrefabPath = "Prefabs/Blocks/EmptyTile";
        private const string EmptyBlockPrefabPath = "Prefabs/Blocks/EmptyBlock";
        private const string BlockPrefabPath = "Prefabs/Blocks/Block";
        private const string BoardSortingLayerName = "Block";
        private const string TraySortingLayerName = "Tray";
    
        [Header("References")]
        [SerializeField] private GameObject tilePrefab;
        [SerializeField] private GameObject emptyTilePrefab;
        [SerializeField] private GameObject blockPrefab;
        [SerializeField] private GameObject emptyBlockPrefab;
        [SerializeField] private Transform tileRoot;
        [SerializeField] private Transform blockRoot;
        [SerializeField] private Camera mainCamera;
        [SerializeField] private TrayManager trayManager;
        [SerializeField] private WandTool wandTool;
        [SerializeField] private GameManager gameManager;
        [Tooltip("BoxCollider2D on a separate GameObject. Board (tileRoot/blockRoot) is scaled to fit inside this bounds; collider is not scaled.")]
        [SerializeField] private BoxCollider2D boardBoundsCollider;
    
        [Header("Board zoom (optional)")]
        [Tooltip("Common parent of TileRoot + BlockRoot. If assigned (or there is a child named BoardRoot/Root), FitToPortrait scales only this object; the localPosition in the scene is kept unchanged.")]
        [SerializeField] private Transform boardRootForZoom;
    
        [Header("Board zoom limits")]
        [Tooltip("Enable zoom mode (user zoom/pan) only when rows or cols >= this value.")]
        [SerializeField] private int boardZoomMinDimension = 18;
    
        [Tooltip("Used to detect when we are zooming, so we don't process block selection clicks while the user is dragging the board.")]
        [SerializeField] private BoardZoomController boardZoomController;
    
        [Header("Layout")]
        [SerializeField] private float cellSize = 1f;
        [SerializeField][Range(0.5f, 1f)] private float portraitPadding = 0.9f;
    
        [Header("Raycast")]
        [Tooltip("Layer name for Blocks. Raycast only hits this layer so Tiles are ignored. Create a 'Block' layer in Project Settings if needed.")]
        [SerializeField] private string blockLayerName = "Block";
    
        [Header("Block -> Tile Animation")]
        // Values are driven by GameManager -> GameConfig.
        private float moveToTileDuration = 0.25f;
        private float moveToTileStaggerDelay = 0.1f;
        private Ease moveToTileEase = Ease.OutQuad;
    
        private BlockConfig[] _blockConfigs;
        private LevelData _levelData;
        private List<Tile> _tiles = new List<Tile>();
        private List<Block> _blocks = new List<Block>();
        private Tile[,] _tileGrid;
        private Block[,] _blockGrid;
        private HashSet<Block> _selectedBlocks = new HashSet<Block>();
        private bool _isMoveToTilesInProgress;
        private bool _isUseMagnetInProgress;
        private float _scaleFromCollider = float.MaxValue;
    
        // When in zoom mode and the user presses the left mouse button to pan, defer click handling until the mouse button is released.
        private bool _deferredLeftClickPending;
        private Vector2 _deferredLeftClickWorldPoint;
        private Vector2 _deferredLeftClickDownScreenPos;
        private bool _deferredLeftClickDragged;
        private const float LeftClickDragThresholdPixels = 6f;
    
        public IReadOnlyCollection<Block> SelectedBlocks => _selectedBlocks;
        public TrayManager TrayManager => trayManager;
    
        /// <summary>Transform used for the zoom board (parent of TileRoot + BlockRoot). Null if not set up yet.</summary>
        public Transform BoardZoomRoot => ResolveBoardZoomRootTransform();
    
        /// <summary>
        /// Allow zoom/pan only when the board size is large enough.
        /// </summary>
        public bool IsBoardZoomEnabledForCurrentLevel()
        {
            if (_levelData == null) return false;
            return _levelData.Rows >= boardZoomMinDimension || _levelData.Columns >= boardZoomMinDimension;
        }
    
        private void Awake()
        {
            LoadBlockConfigs();
            CacheTileRoot();
            CacheBlockRoot();
            if (boardZoomController == null)
                boardZoomController = FindObjectOfType<BoardZoomController>();
            // Hide the Wand when entering the game; show only when pressing the A key.
            if (wandTool != null)
                wandTool.gameObject.SetActive(false);
    
            ApplyGameConfig();
        }
    
        private void ApplyGameConfig()
        {
            var gm = gameManager != null ? gameManager : GameManager.Instance;
            var cfg = gm != null ? gm.GameConfig : null;
            if (cfg == null) return;
    
            moveToTileDuration = cfg.moveToTileDuration;
            moveToTileStaggerDelay = cfg.moveToTileStaggerDelay;
            moveToTileEase = cfg.moveToTileEase;
        }
    
        /// <summary>
        /// Called by GameManager to initialize the board for the current level (based on GameManager.CurrentLevelIndex).
        /// Do not call it automatically in Start to avoid desync with GameManager.
        /// </summary>
        public void InitForCurrentLevel()
        {
            GenerateTiles();
            GenerateBlocks();
        }
    
        void Update()
        {
            // Game locked: level complete / pause setting
            if (gameManager != null &&
                (gameManager.CurrentState == GameManager.State.LEVEL_COMPLETE ||
                 gameManager.CurrentState == GameManager.State.PAUSE))
            {
                if (wandTool != null && wandTool.gameObject.activeSelf)
                    wandTool.gameObject.SetActive(false);
                UnselectAll();
                return;
            }
    
            // Key A: show WandTool (drag to MakeCollapse within the area)
            if (Input.GetKeyDown(KeyCode.A) && wandTool != null)
                ShowWandTool();
    
            // Clean tray with key C
            if (Input.GetKeyDown(KeyCode.C) && !_isMoveToTilesInProgress)
            {
                Debug.Log("[BoardManager] C pressed -> CleanTray()");
                TryCleanTray();
            }
    
            // Use magnet with key M: MakeCollapse for up to 12 different non-collapsed blocks on board.
            if (Input.GetKeyDown(KeyCode.M) && !_isMoveToTilesInProgress && !_isUseMagnetInProgress)
            {
                Debug.Log("[BoardManager] M pressed -> UseMagnet()");
                TryUseMagnet();
            }
    
            HandleBlockClick();
        }
    
        private void LoadBlockConfigs()
        {
            _blockConfigs = new BlockConfig[22];
            _blockConfigs[0] = Resources.Load<BlockConfig>($"{BlockConfigPath}/BlockEmpty");
            for (int i = 0; i <= 20; i++)
            {
                _blockConfigs[i + 1] = Resources.Load<BlockConfig>($"{BlockConfigPath}/Block{i}");
            }
        }
    
        private void CacheTileRoot()
        {
            if (tileRoot == null)
                tileRoot = transform.Find("TileRoot");
        }
    
        private void CacheBlockRoot()
        {
            if (blockRoot == null)
                blockRoot = transform.Find("BlockRoot");
        }
    
        private bool IsBlockOnBoard(Block block)
        {
            if (block == null || _blockGrid == null) return false;
            int rows = _blockGrid.GetLength(0);
            int cols = _blockGrid.GetLength(1);
            int r = block.Row;
            int c = block.Column;
            if (r < 0 || r >= rows || c < 0 || c >= cols) return false;
            return _blockGrid[r, c] == block;
        }
    
        /// <summary>
        /// Level complete when: (1) all blocks are on the board (none on tray), and (2) every block matches its tile color (collapsed).
        /// </summary>
        private bool AreAllBlocksOnBoardCollapsed()
        {
            if (_blockGrid == null || _blocks == null) return false;
            int rows = _blockGrid.GetLength(0);
            int cols = _blockGrid.GetLength(1);
            int blocksOnBoard = 0;
            for (int r = 0; r < rows; r++)
            {
                for (int c = 0; c < cols; c++)
                {
                    var block = _blockGrid[r, c];
                    if (block == null) continue;
                    blocksOnBoard++;
                    if (!block.IsCollapsed)
                        return false;
                }
            }
            return blocksOnBoard == _blocks.Count;
        }
    
        /// <summary>
        /// Check the level-complete conditions and trigger if applicable.
        /// Safe to call multiple times (GameManager won't show again once completed).
        /// </summary>
        private void TryTriggerLevelCompleteIfReady()
        {
            if (gameManager == null) return;
            if (gameManager.CurrentState == GameManager.State.PAUSE ||
                gameManager.CurrentState == GameManager.State.LEVEL_COMPLETE)
                return;
            if (AreAllBlocksOnBoardCollapsed())
                gameManager.SetLevelComplete();
        }
    
        /// <summary>
        /// Show WandTool (Magic booster / A key). Called from UI or input.
        /// </summary>
        public void ShowWandTool()
        {
            if (gameManager != null &&
                (gameManager.CurrentState == GameManager.State.LEVEL_COMPLETE ||
                 gameManager.CurrentState == GameManager.State.PAUSE))
                return;
            if (wandTool != null)
                wandTool.gameObject.SetActive(true);
        }
    
        /// <summary>
        /// Call CleanTray if not currently moving blocks. Used for Brush booster / C key.
        /// </summary>
        public void TryCleanTray()
        {
            if (gameManager != null &&
                (gameManager.CurrentState == GameManager.State.LEVEL_COMPLETE ||
                 gameManager.CurrentState == GameManager.State.PAUSE))
                return;
            if (_isMoveToTilesInProgress) return;
            CleanTray();
        }
    
        /// <summary>
        /// Call UseMagnet if not currently moving and not currently using magnet. Used for Magnet booster / M key.
        /// </summary>
        public void TryUseMagnet()
        {
            if (gameManager != null &&
                (gameManager.CurrentState == GameManager.State.LEVEL_COMPLETE ||
                 gameManager.CurrentState == GameManager.State.PAUSE))
                return;
            if (_isMoveToTilesInProgress || _isUseMagnetInProgress) return;
            UseMagnet();
        }
    
        /// <summary>
        /// CleanTray: move blocks from tray to empty tiles. If no matching tile
        /// is found for a given block, that block is left on the tray.
        /// </summary>
        public void CleanTray()
        {
            if (gameManager != null &&
                (gameManager.CurrentState == GameManager.State.LEVEL_COMPLETE ||
                 gameManager.CurrentState == GameManager.State.PAUSE))
                return;
            if (trayManager == null || _tileGrid == null || _blockGrid == null)
            {
                Debug.Log("[BoardManager] CleanTray aborted: missing trayManager or grids.");
                return;
            }
    
            var slots = trayManager.Slots;
            if (slots == null)
            {
                Debug.Log("[BoardManager] CleanTray aborted: tray slots is null.");
                return;
            }
    
            var trayBlocks = new List<(Block block, TraySlot slot)>();
            foreach (var slot in slots)
            {
                if (slot == null || slot.IsEmpty) continue;
                var block = slot.CurrentBlock;
                if (block != null)
                    trayBlocks.Add((block, slot));
            }
    
            if (trayBlocks.Count == 0)
            {
                Debug.Log("[BoardManager] CleanTray: no blocks on tray.");
                return;
            }
    
            int rows = _tileGrid.GetLength(0);
            int cols = _tileGrid.GetLength(1);
    
            // Precompute all empty tiles (any color) so we can reuse them when freeing slots.
            var emptyTiles = new List<Tile>();
            for (int r = 0; r < rows; r++)
            {
                for (int c = 0; c < cols; c++)
                {
                    var tile = _tileGrid[r, c];
                    if (tile != null && tile.CurrentBlock == null)
                        emptyTiles.Add(tile);
                }
            }
    
            // Track tiles that have already been successfully assigned as collapse targets for tray blocks,
            // so that each tile is used by at most one tray block.
            var usedTargetTiles = new HashSet<Tile>();
    
            Debug.Log($"[BoardManager] CleanTray: found {trayBlocks.Count} block(s) on tray, {emptyTiles.Count} empty tile(s) on board.");
    
            int movedCount = 0;
    
            // For each block on tray, try to move it to a tile with the same color (occupied or empty),
            // but only use:
            // 1) empty tiles (preferred), or
            // 2) tiles that have a block but that block has NOT collapsed yet.
            foreach (var pair in trayBlocks)
            {
                var trayBlock = pair.block;
                var fromSlot = pair.slot;
                if (trayBlock == null || fromSlot == null) continue;
    
                int color = trayBlock.ColorIndex;
    
                // 1) Find same-color tiles:
                //    - PRIORITY: same-color empty tiles
                //    - If there are no empty tiles: same-color tiles whose linked block has NOT collapsed yet
                //    - SKIP: tiles already used for another tray block (usedTargetTiles) or tiles whose block has collapsed
                Tile targetTile = null;
    
                // 1a) Prefer same-color empty tiles
                for (int r = 0; r < rows && targetTile == null; r++)
                {
                    for (int c = 0; c < cols; c++)
                    {
                        var tile = _tileGrid[r, c];
                        if (tile == null) continue;
                        if (tile.ColorIndex != color) continue;
                        if (tile.CurrentBlock != null) continue; // must be empty
                        if (usedTargetTiles.Contains(tile)) continue;
                        targetTile = tile;
                        break;
                    }
                }
    
                // 1b) If there are no same-color empty tiles, find same-color tiles with blocks that haven't collapsed yet
                if (targetTile == null)
                {
                    for (int r = 0; r < rows && targetTile == null; r++)
                    {
                        for (int c = 0; c < cols; c++)
                        {
                            var tile = _tileGrid[r, c];
                            if (tile == null) continue;
                            if (tile.ColorIndex != color) continue;
                            if (usedTargetTiles.Contains(tile)) continue;
    
                            var occ = tile.CurrentBlock;
                            if (occ == null) continue;              // already handled in 1a
                            if (occ.IsCollapsed) continue;          // don't use tiles with collapsed blocks
    
                            targetTile = tile;
                            break;
                        }
                    }
                }
    
                // No suitable matching-color tile on the board -> skip this block.
                if (targetTile == null)
                {
                    Debug.Log($"[BoardManager] CleanTray: no valid matching-color tile for tray block {trayBlock.name} color={color}");
                    continue;
                }
    
                // 2) If the matching-color tile is linked to another block, try to free space:
                //    - prioritize moving the occupying block to any empty tile
                //    - if there are no empty tiles left, temporarily skip (no swap-full-board yet to avoid complex logic).
                if (targetTile.CurrentBlock != null)
                {
                    Block occupying = targetTile.CurrentBlock;
    
                    // Find any empty tile on the board (prioritize tiles not used yet).
                    Tile emptyTarget = null;
                    for (int i = 0; i < emptyTiles.Count; i++)
                    {
                        var candidateEmpty = emptyTiles[i];
                        if (candidateEmpty == null) continue;
                        if (candidateEmpty.CurrentBlock != null) continue;
                        emptyTarget = candidateEmpty;
                        emptyTiles.RemoveAt(i);
                        break;
                    }
    
                    if (emptyTarget == null)
                    {
                        Debug.Log($"[BoardManager] CleanTray: cannot free target tile ({targetTile.Row},{targetTile.Column}) for tray block {trayBlock.name} color={color} because board has no empty tiles.");
                        continue;
                    }
    
                    // Move the occupying block to emptyTarget (free space for the trayBlock).
                    int or = targetTile.Row;
                    int oc = targetTile.Column;
                    int er = emptyTarget.Row;
                    int ec = emptyTarget.Column;
    
                    var parentForBoard = blockRoot != null ? blockRoot : transform;
                    var occTransform = occupying.transform;
    
                    float ex = (ec - (cols - 1) * 0.5f) * cellSize;
                    float ey = (-er + (rows - 1) * 0.5f) * cellSize;
                    Vector3 emptyLocalPos = new Vector3(ex, ey, 0f);
    
                    occTransform.SetParent(parentForBoard, true);
                    occTransform.localPosition = emptyLocalPos;
    
                    // Update grid/tile relations.
                    _blockGrid[or, oc] = null;
                    _blockGrid[er, ec] = occupying;
                    targetTile.SetCurrentBlock(null);
                    emptyTarget.SetCurrentBlock(occupying);
                    occupying.SetGridData(er, ec, occupying.ColorIndex);
                    occupying.SetCollapse(emptyTarget);
                    occupying.SetIconSortingLayer(BoardSortingLayerName);
                }
    
                // Mark this tile as used as a collapse target for a tray block.
                usedTargetTiles.Add(targetTile);
    
                // 3) Move the tray block to this (now) same-color empty tile with tweening, and collapse.
                fromSlot.SetCurrentBlock(null);
    
                int tr = targetTile.Row;
                int tc = targetTile.Column;
    
                var parent = blockRoot != null ? blockRoot : transform;
                var blockTransform = trayBlock.transform;
                Vector3 startWorldPos = blockTransform.position;
    
                var innerRoot = blockTransform.Find("Root");
                if (innerRoot != null)
                    innerRoot.DOKill();
                blockTransform.DOKill();
    
                ReparentBlockToBlockRootPreservingWorld(trayBlock, parent, startWorldPos);
    
                // target local position on board grid
                float x = (tc - (cols - 1) * 0.5f) * cellSize;
                float y = (-tr + (rows - 1) * 0.5f) * cellSize;
                Vector3 targetLocalPos = new Vector3(x, y, 0f);
    
                trayBlock.SetSortingToSelectedOrder();
                Tile targetTileForTween = targetTile;
                GameAudio.PlayMoveGem();
                blockTransform
                    .DOLocalMove(targetLocalPos, moveToTileDuration)
                    .SetEase(moveToTileEase)
                    .OnComplete(() =>
                    {
                        blockTransform.localScale = Vector3.one;
                        trayBlock.SetSortingToDefaultOrder();
                        trayBlock.SetIconSortingLayer(BoardSortingLayerName);
                        trayBlock.SetCollapse(targetTileForTween);
                        if (!trayBlock.IsCollapsed)
                            GameAudio.PlayGemStop();
                    });
    
                blockTransform.DOScale(Vector3.one, moveToTileDuration).SetEase(moveToTileEase);
    
                _blockGrid[tr, tc] = trayBlock;
                trayBlock.SetGridData(tr, tc, trayBlock.ColorIndex);
                targetTile.SetCurrentBlock(trayBlock);
                movedCount++;
            }
    
            // After moving blocks back to board, sort the remaining tray blocks to keep it clean.
            if (trayManager != null)
            {
                DOVirtual.DelayedCall(moveToTileDuration, () => trayManager.SortTrayBlocksByColor());
                // CleanTray uses tween and calls SetCollapse in OnComplete, so check after the tween finishes.
                DOVirtual.DelayedCall(moveToTileDuration + 0.05f, TryTriggerLevelCompleteIfReady);
            }
    
            Debug.Log($"[BoardManager] CleanTray completed. Moved {movedCount} block(s) from tray to board.");
        }
    
        /// <summary>
        /// UseMagnet: MakeCollapse for up to 12 distinct blocks on the board that have not yet collapsed.
        /// If there are fewer than 12 such blocks, attempts MakeCollapse for all of them.
        /// </summary>
        public void UseMagnet()
        {
            if (gameManager != null &&
                (gameManager.CurrentState == GameManager.State.LEVEL_COMPLETE ||
                 gameManager.CurrentState == GameManager.State.PAUSE))
                return;
            if (_blocks == null || _blockGrid == null) return;
    
            _isUseMagnetInProgress = true;
            DOVirtual.DelayedCall(moveToTileDuration, () => _isUseMagnetInProgress = false);
    
            const int maxCount = 12;
            var candidates = new List<Block>(maxCount);
    
            foreach (var b in _blocks)
            {
                if (b == null) continue;
                if (b.IsCollapsed) continue;
                if (!IsBlockOnBoard(b)) continue;
    
                candidates.Add(b);
                if (candidates.Count >= maxCount)
                    break;
            }
    
            if (candidates.Count == 0)
            {
                Debug.Log("[BoardManager] UseMagnet: no non-collapsed blocks on board.");
                _isUseMagnetInProgress = false;
                return;
            }
    
            var usedInBatch = new HashSet<Block>();
            int completed = 0;
            foreach (var b in candidates)
            {
                if (MakeCollapse(b, usedInBatch))
                    completed++;
            }
            Debug.Log($"[BoardManager] UseMagnet: requested up to {maxCount}, candidates={candidates.Count}, completed={completed}.");
    
            // UseMagnet can swap tray -> tile (with tween). Check after the tween finishes.
            DOVirtual.DelayedCall(moveToTileDuration + 0.05f, TryTriggerLevelCompleteIfReady);
        }
    
        /// <summary>
        /// Get all blocks on the board in the 3x3 window centered on the given block (by grid row/col).
        /// Clamps to board bounds so edges/corners yield fewer than 9 blocks. Only returns non-collapsed blocks.
        /// Returns empty list if block is not on board or grids are null.
        /// </summary>
        private List<Block> GetBlocksIn3x3Window(Block centerBlock)
        {
            var result = new List<Block>();
            if (centerBlock == null || _blockGrid == null) return result;
            if (!IsBlockOnBoard(centerBlock)) return result;
    
            int rows = _blockGrid.GetLength(0);
            int cols = _blockGrid.GetLength(1);
            int cr = centerBlock.Row;
            int cc = centerBlock.Column;
            if (cr < 0 || cr >= rows || cc < 0 || cc >= cols) return result;
    
            int r0 = Mathf.Max(0, cr - 1);
            int r1 = Mathf.Min(rows - 1, cr + 1);
            int c0 = Mathf.Max(0, cc - 1);
            int c1 = Mathf.Min(cols - 1, cc + 1);
    
            for (int r = r0; r <= r1; r++)
            {
                for (int c = c0; c <= c1; c++)
                {
                    var b = _blockGrid[r, c];
                    if (b == null || b.IsCollapsed) continue;
                    result.Add(b);
                }
            }
            return result;
        }
    
        /// <summary>
        /// MakeCollapse for a single block:
        /// - Find another block (on board or tray) whose color matches the tile under the given block and which is not yet collapsed.
        /// - Move that matching block into the tile so it collapses.
        /// - Swap the given block into the position the matching block vacated (tile or tray slot).
        /// Returns true if a collapse was performed, false otherwise.
        /// When usedInBatch is set (e.g. from UseMagnet), blocks already used in this batch are skipped to avoid swap-back chaos.
        /// </summary>
        public bool MakeCollapse(Block sourceBlock, HashSet<Block> usedInBatch = null)
        {
            if (sourceBlock == null || _tileGrid == null || _blockGrid == null) return false;
            if (sourceBlock.IsCollapsed) return false;
            if (usedInBatch != null && usedInBatch.Contains(sourceBlock)) return false;
    
            // Source must currently be on the board and linked to a tile.
            if (!IsBlockOnBoard(sourceBlock)) return false;
            int sr = sourceBlock.Row;
            int sc = sourceBlock.Column;
            int rows = _blockGrid.GetLength(0);
            int cols = _blockGrid.GetLength(1);
            if (sr < 0 || sr >= rows || sc < 0 || sc >= cols) return false;
    
            Tile targetTile = _tileGrid[sr, sc];
            if (targetTile == null) return false;
    
            int targetColor = targetTile.ColorIndex;
            if (targetColor <= 0) return false;
    
            // Find a non-collapsed block with the same color as the tile, on board or tray.
            Block candidateBoard = null;
            Block candidateTray = null;
    
            foreach (var b in _blocks)
            {
                if (b == null || b == sourceBlock) continue;
                if (b.IsCollapsed) continue;
                if (b.ColorIndex != targetColor) continue;
                if (usedInBatch != null && usedInBatch.Contains(b)) continue;
    
                if (IsBlockOnBoard(b))
                {
                    candidateBoard = b;
                    break;
                }
    
                if (trayManager != null && trayManager.IsBlockOnTray(b) && candidateTray == null)
                {
                    candidateTray = b;
                }
            }
    
            // Prefer blocks on the tray so one wand drop can move multiple blocks from the tray to the board.
            Block candidate = candidateTray != null ? candidateTray : candidateBoard;
            if (candidate == null) return false;
    
            if (usedInBatch != null)
            {
                usedInBatch.Add(sourceBlock);
                usedInBatch.Add(candidate);
            }
    
            if (IsBlockOnBoard(candidate))
            {
                SwapBlocksOnBoardForCollapse(sourceBlock, candidate);
                return true;
            }
    
            if (trayManager != null && trayManager.IsBlockOnTray(candidate))
            {
                SwapBlockWithTrayForCollapse(sourceBlock, candidate);
                return true;
            }
    
            return false;
        }
    
        /// <summary>
        /// MakeCollapse for a collection of blocks. Returns the number of blocks for which collapse was successfully performed.
        /// </summary>
        public int MakeCollapse(IReadOnlyCollection<Block> blocks)
        {
            if (blocks == null) return 0;
            int completed = 0;
            foreach (var b in blocks)
            {
                if (MakeCollapse(b))
                    completed++;
            }
            return completed;
        }
    
        /// <summary>
        /// MakeCollapse for all blocks on the board that lie inside the given 2D collider (e.g. wand tool area).
        /// Uses usedInBatch so no block is swapped twice. Only considers blocks on board that are not collapsed.
        /// </summary>
        public void MakeCollapseInArea(Collider2D area)
        {
            if (gameManager != null &&
                (gameManager.CurrentState == GameManager.State.LEVEL_COMPLETE ||
                 gameManager.CurrentState == GameManager.State.PAUSE))
                return;
            if (area == null || _blocks == null) return;
    
            var blocksInArea = new List<Block>();
            foreach (var b in _blocks)
            {
                if (b == null || b.IsCollapsed) continue;
                if (!IsBlockOnBoard(b)) continue;
                Vector2 worldPos = b.transform.position;
                if (!area.OverlapPoint(worldPos)) continue;
                blocksInArea.Add(b);
            }
    
            if (blocksInArea.Count == 0) return;
    
            var usedInBatch = new HashSet<Block>();
            foreach (var b in blocksInArea)
            {
                MakeCollapse(b, usedInBatch);
            }
    
            // Magic wand can swap tray -> tile (with tween). Check after the tween finishes.
            DOVirtual.DelayedCall(moveToTileDuration + 0.05f, TryTriggerLevelCompleteIfReady);
        }
    
        /// <summary>
        /// Swap two blocks that are both on the board: candidate moves onto target tile and collapses;
        /// source moves to the candidate's former tile (no tween for now, direct reposition and logical swap).
        /// </summary>
        private void SwapBlocksOnBoardForCollapse(Block source, Block candidate)
        {
            if (source == null || candidate == null || _tileGrid == null || _blockGrid == null) return;
    
            int rows = _blockGrid.GetLength(0);
            int cols = _blockGrid.GetLength(1);
    
            int sr = source.Row;
            int sc = source.Column;
            int cr = candidate.Row;
            int cc = candidate.Column;
    
            if (sr < 0 || sr >= rows || sc < 0 || sc >= cols) return;
            if (cr < 0 || cr >= rows || cc < 0 || cc >= cols) return;
    
            Tile tileSource = _tileGrid[sr, sc];
            Tile tileCandidate = _tileGrid[cr, cc];
            if (tileSource == null || tileCandidate == null) return;
    
            // Swap positions in grid.
            _blockGrid[sr, sc] = candidate;
            _blockGrid[cr, cc] = source;
    
            // Swap tile current-block references.
            tileSource.SetCurrentBlock(candidate);
            tileCandidate.SetCurrentBlock(source);
    
            // Swap transforms (local positions relative to blockRoot).
            var parent = blockRoot != null ? blockRoot : transform;
            Transform tSource = source.transform;
            Transform tCandidate = candidate.transform;
    
            Vector3 posSource = tSource.localPosition;
            Vector3 posCandidate = tCandidate.localPosition;
    
            tSource.SetParent(parent, true);
            tCandidate.SetParent(parent, true);
    
            GameAudio.PlayMoveGem();
            tSource.localPosition = posCandidate;
            tCandidate.localPosition = posSource;
    
            // Update logical grid data and collapse state.
            source.SetGridData(cr, cc, source.ColorIndex);
            candidate.SetGridData(sr, sc, candidate.ColorIndex);
    
            candidate.SetCollapse(tileSource);   // should collapse (matching color)
            source.SetCollapse(tileCandidate);   // may or may not collapse depending on color
            if (!candidate.IsCollapsed)
                GameAudio.PlayGemStop();
            if (!source.IsCollapsed)
                GameAudio.PlayGemStop();
    
            source.SetIconSortingLayer(BoardSortingLayerName);
            candidate.SetIconSortingLayer(BoardSortingLayerName);
        }
    
        /// <summary>
        /// Swap a board block with a tray block for collapse:
        /// - trayBlock moves from tray to the board tile under boardBlock and collapses
        /// - boardBlock moves from board into the tray slot previously holding trayBlock
        /// </summary>
        private void SwapBlockWithTrayForCollapse(Block boardBlock, Block trayBlock)
        {
            if (boardBlock == null || trayBlock == null || trayManager == null || _tileGrid == null || _blockGrid == null) return;
    
            int rows = _blockGrid.GetLength(0);
            int cols = _blockGrid.GetLength(1);
    
            int br = boardBlock.Row;
            int bc = boardBlock.Column;
            if (br < 0 || br >= rows || bc < 0 || bc >= cols) return;
    
            Tile tile = _tileGrid[br, bc];
            if (tile == null) return;
    
            // Find the tray slot that currently holds trayBlock.
            TraySlot slot = trayManager.FindSlotForBlock(trayBlock);
            if (slot == null) return;
    
            // Clear current relations in board grid and tile; tray slot will be reused.
            tile.SetCurrentBlock(null);
            _blockGrid[br, bc] = null;
            slot.SetCurrentBlock(null);
    
            var parent = blockRoot != null ? blockRoot : transform;
    
            // Compute target local position for the tile on the board
            float x = (bc - (cols - 1) * 0.5f) * cellSize;
            float y = (-br + (rows - 1) * 0.5f) * cellSize;
            Vector3 targetLocalPos = new Vector3(x, y, 0f);
    
            // Move trayBlock -> tile (board) with tween
            Transform tTray = trayBlock.transform;
            Vector3 trayWorldPos = tTray.position;
    
            var trayInnerRoot = tTray.Find("Root");
            if (trayInnerRoot != null)
                trayInnerRoot.DOKill();
            tTray.DOKill();
    
            ReparentBlockToBlockRootPreservingWorld(trayBlock, parent, trayWorldPos);
    
            // Set logical board state for trayBlock
            _blockGrid[br, bc] = trayBlock;
            trayBlock.SetGridData(br, bc, trayBlock.ColorIndex);
            tile.SetCurrentBlock(trayBlock);
    
            trayBlock.SetSortingToSelectedOrder();
            Tile targetTile = tile;
            float trayMoveDuration = trayManager != null ? trayManager.MoveToTrayDuration : moveToTileDuration;
            Ease trayMoveEase = trayManager != null ? trayManager.TrayMoveEase : moveToTileEase;
            GameAudio.PlayMoveGem();
            tTray
                .DOLocalMove(targetLocalPos, trayMoveDuration)
                .SetEase(trayMoveEase)
                .OnComplete(() =>
                {
                    tTray.localScale = Vector3.one;
                    trayBlock.SetSortingToDefaultOrder();
                    trayBlock.SetIconSortingLayer(BoardSortingLayerName);
                    trayBlock.SetCollapse(targetTile); // collapse when it reaches tile
                    if (!trayBlock.IsCollapsed)
                        GameAudio.PlayGemStop();
                    // After trayBlock has collapsed, the level-complete condition may be satisfied.
                    TryTriggerLevelCompleteIfReady();
                });
    
            tTray.DOScale(Vector3.one, trayMoveDuration).SetEase(trayMoveEase);
    
            // Move boardBlock -> tray slot
            Transform tBoard = boardBlock.transform;
            Vector3 boardWorldPos = tBoard.position;
    
            tBoard.SetParent(slot.transform, true);
            tBoard.position = boardWorldPos;
            tBoard.localScale = Vector3.one;
    
            var boardRoot = tBoard.Find("Root") ?? tBoard;
            boardRoot.localScale = Vector3.one * 0.5f;
    
            boardBlock.SetSortingToSelectedOrder();
            boardBlock.SetIconSortingLayer(TraySortingLayerName);
    
            // Simple tween for boardBlock into tray slot center
            GameAudio.PlayMoveGem();
            tBoard
                .DOLocalMove(Vector3.zero, trayMoveDuration)
                .SetEase(trayMoveEase)
                .OnComplete(() =>
                {
                    GameAudio.PlayGemStop();
                    boardBlock.SetSortingToDefaultOrder();
                    boardBlock.SetIconSortingLayer(TraySortingLayerName);
                });
    
            slot.SetCurrentBlock(boardBlock);
            boardBlock.SetGridData(-1, -1, boardBlock.ColorIndex);
            boardBlock.SetCollapse(null); // boardBlock is no longer on a tile
    
            // After the swap animation finishes, clean and sort the tray so it stays compact/optimized.
            if (trayManager != null)
            {
                DOVirtual.DelayedCall(trayMoveDuration, () => trayManager.SortTrayBlocksByColor());
            }
        }
    
        private static void SetLayerRecursively(Transform t, int layer)
        {
            t.gameObject.layer = layer;
            for (int i = 0; i < t.childCount; i++)
                SetLayerRecursively(t.GetChild(i), layer);
        }
    
        /// <summary>
        /// Cast 2D ray: Block layer first, then Tray layer. Block click = select; Tray click = place selected blocks into tray.
        /// </summary>
        private void HandleBlockClick()
        {
            var cam = mainCamera != null ? mainCamera : Camera.main;
            if (cam == null) return;
    
            // If we are deferring the click: decide between click or drag when the mouse button is released.
            if (_deferredLeftClickPending)
            {
                if (Input.GetMouseButton(0) && !_deferredLeftClickDragged)
                {
                    if (Vector2.Distance(Input.mousePosition, _deferredLeftClickDownScreenPos) > LeftClickDragThresholdPixels)
                        _deferredLeftClickDragged = true;
                }
    
                if (Input.GetMouseButtonUp(0))
                {
                    bool dragged = _deferredLeftClickDragged;
                    _deferredLeftClickPending = false;
    
                    if (!dragged)
                    {
                        // Use worldPoint from the current mouse position to avoid offsets due to the board being panned.
                        Vector2 currentWorldPoint = cam.ScreenToWorldPoint(Input.mousePosition);
                        if (!_isMoveToTilesInProgress)
                            HandleBlockClickAtWorldPoint(currentWorldPoint, cam);
                    }
                }
    
                return;
            }
    
            if (!Input.GetMouseButtonDown(0)) return;
            if (_isMoveToTilesInProgress) return;
    
            Vector2 worldPoint = cam.ScreenToWorldPoint(Input.mousePosition);
    
            // Prioritize WandTool over zoom/pan board (even while in zoom mode).
            {
                var tutorial = TutorialView.Instance;
                bool tutorialLock = tutorial != null && tutorial.IsTutorialActive;
    
                RaycastHit2D[] hitsTool = Physics2D.RaycastAll(worldPoint, Vector2.zero, Mathf.Infinity);
                for (int i = 0; i < hitsTool.Length; i++)
                {
                    if (hitsTool[i].collider == null) continue;
                    var wand = hitsTool[i].collider.GetComponentInParent<WandTool>();
                    if (wand != null)
                    {
                        if (tutorialLock) return;
                        wand.BeginDrag(worldPoint);
                        return;
                    }
                }
            }
    
            // In zoom mode: left mouse button is used to drag the board, so defer click selection.
            if (boardZoomController != null && boardZoomController.IsZoomMode)
            {
                _deferredLeftClickPending = true;
                _deferredLeftClickWorldPoint = worldPoint;
                _deferredLeftClickDownScreenPos = Input.mousePosition;
                _deferredLeftClickDragged = false;
                return;
            }
    
            HandleBlockClickAtWorldPoint(worldPoint, cam);
        }
    
        private void HandleBlockClickAtWorldPoint(Vector2 worldPoint, Camera cam)
        {
            var tutorial = TutorialView.Instance;
            bool tutorialLock = tutorial != null && tutorial.IsTutorialActive;
    
            // Prioritize WandTool: if the tap hits the wand, start dragging it (wand does not need OnMouseDown).
            RaycastHit2D[] hitsTool = Physics2D.RaycastAll(worldPoint, Vector2.zero, Mathf.Infinity);
            for (int i = 0; i < hitsTool.Length; i++)
            {
                if (hitsTool[i].collider == null) continue;
                var wand = hitsTool[i].collider.GetComponentInParent<WandTool>();
                if (wand != null)
                {
                    if (tutorialLock) return;
                    wand.BeginDrag(worldPoint);
                    return;
                }
            }
    
            // Click the MoreSlots button on the tray (if any)
            if (!tutorialLock && trayManager != null && trayManager.TryHandleMoreSlotClick(worldPoint))
                return;
    
            int blockMask = LayerMask.GetMask(blockLayerName);
            if (blockMask == 0)
                blockMask = ~0;
            RaycastHit2D hitBlock = Physics2D.Raycast(worldPoint, Vector2.zero, Mathf.Infinity, blockMask);
            if (hitBlock.collider != null)
            {
                var block = hitBlock.collider.GetComponentInParent<Block>();
                if (block != null)
                {
                    if (tutorialLock && !tutorial.TryHandleBlockClick(block))
                        return;
                    ProcessBlockClicked(block);
                    return;
                }
            }
    
            // Try hit TraySlot (no specific layer required - relies on collider + TraySlot component)
            {
                RaycastHit2D hitTray = Physics2D.Raycast(worldPoint, Vector2.zero, Mathf.Infinity);
                if (hitTray.collider != null && trayManager != null)
                {
                    var traySlot = hitTray.collider.GetComponentInParent<TraySlot>();
                    if (traySlot != null)
                    {
                        if (tutorialLock && !tutorial.TryHandleTraySlotClick(traySlot))
                            return;
    
                        var blocksOnBoard = new List<Block>();
                        foreach (var b in _selectedBlocks)
                        {
                            if (b != null && IsBlockOnBoard(b))
                                blocksOnBoard.Add(b);
                        }
    
                        if (blocksOnBoard.Count > 0 && trayManager.TryPlaceBlocksFromSlot(traySlot, blocksOnBoard))
                        {
                            ReleaseTileRelationsForBlocksOnTray();
                            UnselectAll();
                        }
                        return;
                    }
                }
            }
    
            if (_tileGrid != null && _levelData != null)
            {
                if (TryGetTileAtWorldPoint(worldPoint, out Tile clickedTile))
                {
                    if (tutorialLock && !tutorial.TryHandleTileClick(clickedTile))
                        return;
    
                    Debug.Log($"[BoardManager] Tile click: ({clickedTile.Row},{clickedTile.Column}) ColorIndex={clickedTile.ColorIndex} IsEmpty={clickedTile.IsEmpty}");
    
                    if (clickedTile.IsEmpty && _selectedBlocks.Count > 0)
                    {
                        var connectedEmpty = GetConnectedEmptyTilesSameColor(clickedTile.Row, clickedTile.Column);
                        var selectedSameColor = new List<Block>();
                        int tileColor = clickedTile.ColorIndex;
                        foreach (var b in _selectedBlocks)
                        {
                            if (b != null && b.ColorIndex == tileColor)
                                selectedSameColor.Add(b);
                        }
                        int count = Mathf.Min(connectedEmpty.Count, selectedSameColor.Count);
    
                        Debug.Log($"[BoardManager] Tile empty: connectedEmptyTiles={connectedEmpty.Count} selectedSameColor={selectedSameColor.Count} -> placeCount={count}");
    
                        if (count > 0)
                        {
                            PlaceBlocksToTiles(selectedSameColor, connectedEmpty, count);
                            Debug.Log($"[BoardManager] Placed {count} block(s) to tiles.");
                        }
                    }
                }
            }
        }
    
        /// <summary>
        /// Get tile at world point by converting to grid. Returns false if out of bounds.
        /// </summary>
        private bool TryGetTileAtWorldPoint(Vector2 worldPoint, out Tile tile)
        {
            tile = null;
            if (tileRoot == null || _tileGrid == null) return false;
            int rows = _tileGrid.GetLength(0);
            int cols = _tileGrid.GetLength(1);
    
            Vector3 local = tileRoot.InverseTransformPoint(worldPoint);
            float c = local.x / cellSize + (cols - 1) * 0.5f;
            float r = (rows - 1) * 0.5f - local.y / cellSize;
            int ic = Mathf.RoundToInt(c);
            int ir = Mathf.RoundToInt(r);
    
            if (ir < 0 || ir >= rows || ic < 0 || ic >= cols)
            {
                Debug.Log($"[BoardManager] Tile hit: out of grid (r={ir}, c={ic}) grid={rows}x{cols}");
                return false;
            }
    
            tile = _tileGrid[ir, ic];
            return tile != null;
        }
    
        /// <summary>
        /// Flood fill: connected empty tiles with same color index as start (8-connected, including diagonals).
        /// </summary>
        private List<Tile> GetConnectedEmptyTilesSameColor(int startR, int startC)
        {
            var result = new List<Tile>();
            if (_tileGrid == null) return result;
    
            int rows = _tileGrid.GetLength(0);
            int cols = _tileGrid.GetLength(1);
            int targetColor = _tileGrid[startR, startC].ColorIndex;
    
            var visited = new bool[rows, cols];
            var queue = new Queue<(int r, int c)>();
            queue.Enqueue((startR, startC));
    
            // 8 directions: 4 sides + 4 diagonals
            int[] dr = { -1, -1, -1, 0, 0, 1, 1, 1 };
            int[] dc = { -1, 0, 1, -1, 1, -1, 0, 1 };
    
            while (queue.Count > 0)
            {
                var (r, c) = queue.Dequeue();
                if (r < 0 || r >= rows || c < 0 || c >= cols || visited[r, c]) continue;
    
                var tile = _tileGrid[r, c];
                if (tile == null || !tile.IsEmpty || tile.ColorIndex != targetColor) continue;
    
                visited[r, c] = true;
                result.Add(tile);
    
                for (int i = 0; i < 8; i++)
                    queue.Enqueue((r + dr[i], c + dc[i]));
            }
    
            return result;
        }
    
        /// <summary>
        /// If Tray is not under BoardZoom but BlockRoot is — setting <c>localScale = Vector3.one</c> right after SetParent makes
        /// <c>lossyScale</c> jump (often shrinks a lot). Preserve <c>lossyScale</c> before reparent and adjust <c>localScale</c> for the new parent.
        /// </summary>
        private static void ReparentBlockToBlockRootPreservingWorld(Block block, Transform blockRootParent, Vector3 worldPosition)
        {
            if (block == null || blockRootParent == null) return;
            var t = block.transform;
            Vector3 lossy = t.lossyScale;
            t.SetParent(blockRootParent, true);
            Transform par = t.parent;
            Vector3 pl = par != null ? par.lossyScale : Vector3.one;
            t.localScale = new Vector3(
                lossy.x / Mathf.Max(1e-6f, pl.x),
                lossy.y / Mathf.Max(1e-6f, pl.y),
                lossy.z / Mathf.Max(1e-6f, pl.z));
            t.position = worldPosition;
            block.SetRootScale(1f);
        }
    
        /// <summary>
        /// Move blocks to tiles with DOLocalMove and stagger delay. Re-parent to blockRoot, tween to target, set block-tile relationship.
        /// </summary>
        private void PlaceBlocksToTiles(List<Block> blocks, List<Tile> tiles, int count)
        {
            var parent = blockRoot != null ? blockRoot : transform;
            int rows = _levelData.Rows;
            int cols = _levelData.Columns;
    
            bool anyFromTray = false;
    
            for (int i = 0; i < count; i++)
            {
                var block = blocks[i];
                var tile = tiles[i];
                if (block == null || tile == null) continue;
    
                bool fromTray = trayManager != null && trayManager.RemoveBlockFromTray(block);
                if (fromTray) anyFromTray = true;
    
                int oldR = block.Row;
                int oldC = block.Column;
                if (oldR >= 0 && oldR < rows && oldC >= 0 && oldC < cols && _blockGrid[oldR, oldC] == block)
                    _blockGrid[oldR, oldC] = null;
    
                // Release old tile relation (block is leaving that tile)
                if (_tileGrid != null && oldR >= 0 && oldR < rows && oldC >= 0 && oldC < cols)
                {
                    var oldTile = _tileGrid[oldR, oldC];
                    if (oldTile != null && oldTile.CurrentBlock == block)
                        oldTile.SetCurrentBlock(null);
                }
    
                int newR = tile.Row;
                int newC = tile.Column;
    
                float x = (newC - (cols - 1) * 0.5f) * cellSize;
                float y = (-newR + (rows - 1) * 0.5f) * cellSize;
                Vector3 targetLocalPos = new Vector3(x, y, 0f);
    
                var blockTransform = block.transform;
                Vector3 startWorldPos = blockTransform.position;
    
                var innerRoot = blockTransform.Find("Root");
                if (innerRoot != null)
                    innerRoot.DOKill();
    
                blockTransform.DOKill();
    
                ReparentBlockToBlockRootPreservingWorld(block, parent, startWorldPos);
    
                float delay = i * moveToTileStaggerDelay;
                block.SetSortingToSelectedOrder();
                Tile targetTile = tile;
                GameAudio.PlayMoveGem();
                blockTransform
                    .DOLocalMove(targetLocalPos, moveToTileDuration)
                    .SetDelay(delay)
                    .SetEase(moveToTileEase)
                    .OnComplete(() =>
                    {
                        blockTransform.localScale = Vector3.one;
                        block.SetSortingToDefaultOrder();
                        block.SetIconSortingLayer(BoardSortingLayerName);
                        block.SetCollapse(targetTile);
                        if (!block.IsCollapsed)
                            GameAudio.PlayGemStop();
                    });
    
                blockTransform.DOScale(Vector3.one, moveToTileDuration).SetDelay(delay).SetEase(moveToTileEase);
    
                block.SetGridData(newR, newC, block.ColorIndex);
                tile.SetCurrentBlock(block);
    
                _blockGrid[newR, newC] = block;
            }
    
            // Unselect and sort tray only after all move tweens finish; re-enable selection when move ends
            if (count > 0)
            {
                _isMoveToTilesInProgress = true;
                float totalMoveTime = (count - 1) * moveToTileStaggerDelay + moveToTileDuration;
                bool sortTrayAfterMove = anyFromTray && trayManager != null;
                DOVirtual.DelayedCall(totalMoveTime, () =>
                {
                    _isMoveToTilesInProgress = false;
                    UnselectAll();
                    if (sortTrayAfterMove)
                        trayManager.SortTrayBlocksByColor();
                    if (gameManager != null &&
                        gameManager.CurrentState == GameManager.State.PLAYING &&
                        AreAllBlocksOnBoardCollapsed())
                        gameManager.SetLevelComplete();
                });
            }
        }
    
        /// <summary>
        /// Called when a Block is clicked. Uses magic selection (flood fill) for connected same-color blocks.
        /// Collapsed blocks cannot be selected.
        /// </summary>
        protected virtual void ProcessBlockClicked(Block block)
        {
            
            // If block is on tray, use tray-based selection (contiguous same-color blocks)
            if (trayManager != null && trayManager.IsBlockOnTray(block))
            {
                ProcessTrayBlockClicked(block);
                return;
            }
    
            if (block.IsCollapsed) return;
    
            GameAudio.PlayClickGem();
            var group = GetConnectedBlocksOfSameColor(block);
    
            if (_selectedBlocks.Contains(block))
            {
                UnselectAll();
            }
            else
            {
                UnselectAll();
                SelectGroup(group);
            }
        }
    
        /// <summary>
        /// Selection logic when clicking a block that is on the tray.
        /// Selects contiguous same-color blocks around the clicked one based on tray slot order.
        /// </summary>
        private void ProcessTrayBlockClicked(Block block)
        {
            GameAudio.PlayClickGem();
            var group = trayManager.GetContiguousBlocksSameColor(block);
            if (group == null || group.Count == 0) return;
    
            if (_selectedBlocks.Contains(block))
            {
                UnselectAll();
                return;
            }
    
            UnselectAll();
            foreach (var b in group)
            {
                b.SelectBlock();
                _selectedBlocks.Add(b);
            }
        }
    
        /// <summary>
        /// Magic selection: flood fill to find all connected blocks with same color index (8-connected, including diagonals).
        /// </summary>
        private List<Block> GetConnectedBlocksOfSameColor(Block start)
        {
            var result = new List<Block>();
            if (_blockGrid == null) return result;
    
            int rows = _blockGrid.GetLength(0);
            int cols = _blockGrid.GetLength(1);
            int targetColor = start.ColorIndex;
    
            var visited = new bool[rows, cols];
            var queue = new Queue<(int r, int c)>();
            queue.Enqueue((start.Row, start.Column));
    
            // 8 directions: 4 sides + 4 diagonals
            int[] dr = { -1, -1, -1, 0, 0, 1, 1, 1 };
            int[] dc = { -1, 0, 1, -1, 1, -1, 0, 1 };
    
            while (queue.Count > 0)
            {
                var (r, c) = queue.Dequeue();
                if (r < 0 || r >= rows || c < 0 || c >= cols || visited[r, c]) continue;
    
                var b = _blockGrid[r, c];
                if (b == null || b.IsCollapsed || b.ColorIndex != targetColor) continue;
    
                visited[r, c] = true;
                result.Add(b);
    
                for (int i = 0; i < 8; i++)
                    queue.Enqueue((r + dr[i], c + dc[i]));
            }
    
            return result;
        }
    
        private void SelectGroup(List<Block> group)
        {
            _selectedBlocks.Clear();
            foreach (var b in group)
            {
                b.SelectBlock();
                _selectedBlocks.Add(b);
            }
        }
    
        private void UnselectAll()
        {
            foreach (var b in _selectedBlocks)
                b.UnSelectBlock();
            _selectedBlocks.Clear();
        }
    
        /// <summary>
        /// Release tile-block relationship and clear block from grid for any block that is now on the tray.
        /// Call after TryPlaceBlocks succeeds.
        /// </summary>
        private void ReleaseTileRelationsForBlocksOnTray()
        {
            if (trayManager == null || _tileGrid == null || _blockGrid == null) return;
    
            int rows = _blockGrid.GetLength(0);
            int cols = _blockGrid.GetLength(1);
    
            foreach (var tile in _tileGrid)
            {
                if (tile == null) continue;
                var block = tile.CurrentBlock;
                if (block == null) continue;
                if (!trayManager.IsBlockOnTray(block)) continue;
    
                tile.SetCurrentBlock(null);
    
                int r = block.Row;
                int c = block.Column;
                if (r >= 0 && r < rows && c >= 0 && c < cols && _blockGrid[r, c] == block)
                    _blockGrid[r, c] = null;
            }
        }
    
        private BlockConfig GetBlockConfig(int index)
        {
            if (_blockConfigs == null || index < 0 || index >= _blockConfigs.Length)
                return null;
            return _blockConfigs[index];
        }
    
        /// <summary>
        /// Load level and spawn Tile objects from Complete Level matrix.
        /// </summary>
        public void GenerateTiles()
        {
            int idx = 1;
            if (gameManager != null)
                idx = Mathf.Max(1, gameManager.CurrentLevelIndex);
            else if (GameManager.Instance != null)
                idx = Mathf.Max(1, GameManager.Instance.CurrentLevelIndex);
    
            _levelData = LevelData.LoadFromResources(idx);
            if (_levelData == null)
            {
                Debug.LogError($"[BoardManager] Failed to load level {idx}");
                return;
            }
    
            ClearTiles();
    
            var prefab = tilePrefab != null ? tilePrefab : Resources.Load<GameObject>(TilePrefabPath);
            if (prefab == null)
            {
                Debug.LogError("[BoardManager] Tile prefab not found.");
                return;
            }
            var emptyPrefab = emptyTilePrefab != null ? emptyTilePrefab : Resources.Load<GameObject>(EmptyTilePrefabPath);
            if (emptyPrefab == null)
            {
                Debug.LogWarning("[BoardManager] EmptyTile prefab not found. Cells with value 0 will have no visual placeholder.");
            }
    
            int rows = _levelData.Rows;
            int cols = _levelData.Columns;
            _tileGrid = new Tile[rows, cols];
    
            FitTileRootToCollider(rows, cols);
            var parent = tileRoot != null ? tileRoot : transform;
    
            for (int r = 0; r < rows; r++)
            {
                for (int c = 0; c < cols; c++)
                {
                    int blockIndex = _levelData.GetCompleteBlockIndex(r, c);
    
                    // Local position, grid centered (pivot at center)
                    float x = (c - (cols - 1) * 0.5f) * cellSize;
                    float y = (-r + (rows - 1) * 0.5f) * cellSize;
                    Vector3 localPos = new Vector3(x, y, 0f);
    
                    if (blockIndex == 0)
                    {
                        if (emptyPrefab != null)
                        {
                            var emptyInstance = Instantiate(emptyPrefab, parent);
                            emptyInstance.name = $"EmptyTile_{r}_{c}";
                            emptyInstance.transform.localPosition = localPos;
                        }
    
                        _tileGrid[r, c] = null;
                        continue;
                    }
    
                    var config = GetBlockConfig(blockIndex);
    
                    var instance = Instantiate(prefab, parent);
                    instance.name = $"Tile_{r}_{c}";
                    instance.transform.localPosition = localPos;
    
                    var tile = instance.GetComponent<Tile>();
                    if (tile != null)
                    {
                        tile.SetGridData(r, c, blockIndex);
                        tile.Setup(config);
                        _tiles.Add(tile);
                        _tileGrid[r, c] = tile;
                    }
                }
            }
    
            FitToPortraitScreen(rows, cols);
    
            Debug.Log($"[BoardManager] Created {_tiles.Count} tiles for Level {idx} ({rows}x{cols})");
        }
    
        /// <summary>
        /// Spawn Block objects from Shuffle Level matrix, using same coordinate algorithm as tiles.
        /// </summary>
        private void GenerateBlocks()
        {
            if (_levelData == null) return;
    
            ClearBlocks();
    
            var prefab = blockPrefab != null ? blockPrefab : Resources.Load<GameObject>(BlockPrefabPath);
            if (prefab == null)
            {
                Debug.LogError("[BoardManager] Block prefab not found.");
                return;
            }
    
            var emptyPrefab = emptyBlockPrefab != null ? emptyBlockPrefab : Resources.Load<GameObject>(EmptyBlockPrefabPath);
            if (emptyPrefab == null)
            {
                Debug.LogWarning("[BoardManager] EmptyBlock prefab not found. Cells with value 0 will have no visual placeholder for blocks.");
            }
    
            var parent = blockRoot != null ? blockRoot : transform;
    
            int rows = _levelData.Rows;
            int cols = _levelData.Columns;
            _blockGrid = new Block[rows, cols];
    
            for (int r = 0; r < rows; r++)
            {
                for (int c = 0; c < cols; c++)
                {
                    int blockIndex = _levelData.GetShuffleBlockIndex(r, c);
    
                    // Same coordinate algorithm as Tile: grid centered, aligned with Shuffle Level
                    float x = (c - (cols - 1) * 0.5f) * cellSize;
                    float y = (-r + (rows - 1) * 0.5f) * cellSize;
                    Vector3 localPos = new Vector3(x, y, 0f);
    
                    if (blockIndex == 0)
                    {
                        if (emptyPrefab != null)
                        {
                            var emptyInstance = Instantiate(emptyPrefab, parent);
                            emptyInstance.name = $"EmptyBlock_{r}_{c}";
                            emptyInstance.transform.localPosition = localPos;
                        }
                        _blockGrid[r, c] = null;
                        continue;
                    }
    
                    var config = GetBlockConfig(blockIndex);
    
                    var instance = Instantiate(prefab, parent);
                    instance.name = $"Block_{r}_{c}";
                    instance.transform.localPosition = localPos;
    
                    int blockLayer = LayerMask.NameToLayer(blockLayerName);
                    if (blockLayer >= 0)
                        SetLayerRecursively(instance.transform, blockLayer);
    
                    var block = instance.GetComponent<Block>();
                    if (block != null)
                    {
                        block.SetGridData(r, c, blockIndex);
                        block.Setup(config);
                        var tile = _tileGrid != null ? _tileGrid[r, c] : null;
                        // While generating the board: already-collapsed blocks only set visuals, no SFX/particles.
                        block.SetCollapse(tile, playCollapseFeedback: false);
                        if (tile != null) tile.SetCurrentBlock(block);
                        EnsureBlockCollider(instance);
                        _blocks.Add(block);
                        _blockGrid[r, c] = block;
                    }
                }
            }
    
            Debug.Log($"[BoardManager] Created {_blocks.Count} blocks from Shuffle Level ({rows}x{cols})");
        }
    
        private void ClearTiles()
        {
            _tileGrid = null;
            foreach (var tile in _tiles)
            {
                if (tile != null && tile.gameObject != null)
                    Destroy(tile.gameObject);
            }
            _tiles.Clear();
        }
    
        /// <summary>
        /// Ensure Block has Collider2D for raycast detection. Adds BoxCollider2D if missing.
        /// </summary>
        private void EnsureBlockCollider(GameObject blockObj)
        {
            if (blockObj.GetComponent<Collider2D>() != null) return;
    
            var spriteRenderer = blockObj.GetComponentInChildren<SpriteRenderer>();
            var collider = blockObj.AddComponent<BoxCollider2D>();
            if (spriteRenderer != null && spriteRenderer.sprite != null)
            {
                var scale = blockObj.transform.lossyScale;
                collider.size = new Vector2(
                    spriteRenderer.bounds.size.x / Mathf.Max(0.001f, scale.x),
                    spriteRenderer.bounds.size.y / Mathf.Max(0.001f, scale.y));
                collider.offset = blockObj.transform.InverseTransformPoint(spriteRenderer.bounds.center);
            }
        }
    
        private void ClearBlocks()
        {
            UnselectAll();
            if (_tileGrid != null)
            {
                foreach (var tile in _tileGrid)
                    if (tile != null) tile.SetCurrentBlock(null);
            }
            _blockGrid = null;
            foreach (var block in _blocks)
            {
                if (block != null && block.gameObject != null)
                    Destroy(block.gameObject);
            }
            _blocks.Clear();
        }
    
        /// <summary>
        /// Called by GameManager when preparing to load a new level:
        /// - Clear all current tiles/blocks (including blocks on the tray, since they are still tracked in _blocks).
        /// </summary>
        public void CleanBoardForNewLevel()
        {
            ClearBlocks();
            ClearTiles();
        }
    
        /// <summary>
        /// Compute max scale so board fits inside boardBoundsCollider (on a separate GameObject, not scaled with tileRoot).
        /// Call before FitToPortraitScreen.
        /// </summary>
        private void FitTileRootToCollider(int rows, int cols)
        {
            _scaleFromCollider = float.MaxValue;
            if (boardBoundsCollider == null) return;
    
            float gridWidth = cols * cellSize;
            float gridHeight = rows * cellSize;
            if (gridWidth <= 0 || gridHeight <= 0) return;
    
            var worldSize = boardBoundsCollider.bounds.size;
            float scaleX = worldSize.x / gridWidth;
            float scaleY = worldSize.y / gridHeight;
            _scaleFromCollider = Mathf.Min(scaleX, scaleY, 1f);
        }
    
        /// <summary>
        /// Scale and center TileRoot + BlockRoot to fit portrait screen and board bounds collider (if assigned).
        /// </summary>
        private void FitToPortraitScreen(int rows, int cols)
        {
            var cam = mainCamera != null ? mainCamera : Camera.main;
            if (cam == null || !cam.orthographic) return;
    
            float orthoHeight = cam.orthographicSize * 2f;
            float aspect = (float)Screen.width / Screen.height;
            float orthoWidth = orthoHeight * aspect;
    
            float gridWidth = cols * cellSize;
            float gridHeight = rows * cellSize;
            float scaleX = orthoWidth / gridWidth * portraitPadding;
            float scaleY = orthoHeight / gridHeight * portraitPadding;
            float scale = Mathf.Min(scaleX, scaleY);
    
            if (_scaleFromCollider < float.MaxValue)
                scale = Mathf.Min(scale, _scaleFromCollider);
    
            if (TryApplyFitScaleToBoardZoomRoot(scale))
            {
                BoardZoomController.NotifyBoardRefit(this);
                return;
            }
    
            var tileParent = tileRoot != null ? tileRoot : transform;
            var blockParent = blockRoot != null ? blockRoot : transform;
    
            tileParent.localScale = Vector3.one * scale;
            tileParent.localPosition = Vector3.zero;
    
            blockParent.localScale = Vector3.one * scale;
            blockParent.localPosition = Vector3.zero;
    
            BoardZoomController.NotifyBoardRefit(this);
        }
    
        private Transform ResolveBoardZoomRootTransform()
        {
            if (boardRootForZoom != null)
            {
                if (boardRootForZoom == transform) return null;
                if (tileRoot != null && !tileRoot.IsChildOf(boardRootForZoom)) return null;
                if (blockRoot != null && !blockRoot.IsChildOf(boardRootForZoom)) return null;
                return boardRootForZoom;
            }
    
            var z = transform.Find("BoardRoot");
            if (z == null) z = transform.Find("Root");
            if (z == null || z == transform) return null;
            if (tileRoot != null && !tileRoot.IsChildOf(z)) return null;
            if (blockRoot != null && !blockRoot.IsChildOf(z)) return null;
            return z;
        }
    
        /// <summary>
        /// If there is a valid BoardZoomRoot (parent of both tile + block), scale only that root; TileRoot/BlockRoot keep their localScale (usually 1).
        /// </summary>
        private bool TryApplyFitScaleToBoardZoomRoot(float scale)
        {
            Transform z = ResolveBoardZoomRootTransform();
            if (z == null) return false;
    
            z.localScale = Vector3.one * scale;
            // Keep the localPosition set in the scene (do not move Root to (0,0,0)).
            return true;
        }
    }
    
}
