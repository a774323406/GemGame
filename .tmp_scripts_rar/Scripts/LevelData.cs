using UnityEngine;
using System.Collections.Generic;

namespace GemSortingPuzzle
{
    /// <summary>
    /// Level data loaded from Complete Level file.
    /// </summary>
    public class LevelData
    {
        public int Rows { get; private set; }
        public int Columns { get; private set; }
        public int[,] CompleteMatrix { get; private set; }
        public int[,] ShuffleMatrix { get; private set; }
    
        public LevelData(int rows, int columns, int[,] completeMatrix, int[,] shuffleMatrix = null)
        {
            Rows = rows;
            Columns = columns;
            CompleteMatrix = completeMatrix;
            ShuffleMatrix = shuffleMatrix ?? completeMatrix;
        }
    
        /// <summary>
        /// Get block index at (row, col) from Complete matrix. Returns 0 (empty) if out of bounds.
        /// </summary>
        public int GetCompleteBlockIndex(int row, int col)
        {
            return GetBlockIndexFromMatrix(CompleteMatrix, row, col);
        }
    
        /// <summary>
        /// Get block index at (row, col) from Shuffle matrix. Returns 0 (empty) if out of bounds.
        /// </summary>
        public int GetShuffleBlockIndex(int row, int col)
        {
            return GetBlockIndexFromMatrix(ShuffleMatrix, row, col);
        }
    
        private static int GetBlockIndexFromMatrix(int[,] matrix, int row, int col)
        {
            if (matrix == null || row < 0 || row >= matrix.GetLength(0) || col < 0 || col >= matrix.GetLength(1))
                return 0;
            return Mathf.Clamp(matrix[row, col], 0, 21);
        }
    
        /// <summary>
        /// Load level from Resources. Returns null on failure.
        /// Complete Level = section before "---", Shuffle Level = section after "---" (fallback to Complete if absent).
        /// </summary>
        public static LevelData LoadFromResources(int levelIndex)
        {
            var path = $"Levels/Level{levelIndex}_Complete";
            var textAsset = Resources.Load<TextAsset>(path);
            if (textAsset == null || string.IsNullOrEmpty(textAsset.text))
            {
                Debug.LogWarning($"[LevelData] Level not found: {path}");
                return null;
            }
    
            var lines = textAsset.text.Split('\n');
            const string separator = "---";
            int separatorIndex = -1;
    
            for (int i = 0; i < lines.Length; i++)
            {
                if (lines[i].Trim() == separator)
                {
                    separatorIndex = i;
                    break;
                }
            }
    
            var completeMatrix = ParseMatrix(lines, 0, separatorIndex >= 0 ? separatorIndex : lines.Length);
            if (completeMatrix == null)
            {
                Debug.LogWarning("[LevelData] Level has no Complete data.");
                return null;
            }
    
            int rows = completeMatrix.GetLength(0);
            int cols = completeMatrix.GetLength(1);
            int[,] shuffleMatrix = null;
    
            if (separatorIndex >= 0 && separatorIndex + 1 < lines.Length)
            {
                shuffleMatrix = ParseMatrix(lines, separatorIndex + 1, lines.Length);
                if (shuffleMatrix != null && (shuffleMatrix.GetLength(0) != rows || shuffleMatrix.GetLength(1) != cols))
                    shuffleMatrix = null;
            }
    
            return new LevelData(rows, cols, completeMatrix, shuffleMatrix);
        }
    
        private static int[,] ParseMatrix(string[] lines, int start, int end)
        {
            var rowData = new List<int[]>();
            int maxCols = 0;
    
            for (int i = start; i < end; i++)
            {
                var line = lines[i].Trim();
                if (string.IsNullOrEmpty(line)) continue;
    
                var parts = line.Split(new[] { ' ', '\t' }, System.StringSplitOptions.RemoveEmptyEntries);
                var row = new int[parts.Length];
                for (int j = 0; j < parts.Length; j++)
                {
                    int val;
                    row[j] = int.TryParse(parts[j], out val) ? Mathf.Clamp(val, 0, 21) : 0;
                }
                rowData.Add(row);
                maxCols = Mathf.Max(maxCols, row.Length);
            }
    
            if (rowData.Count == 0) return null;
    
            int rows = rowData.Count;
            int cols = maxCols;
            var matrix = new int[rows, cols];
    
            for (int r = 0; r < rows; r++)
            {
                var row = rowData[r];
                for (int c = 0; c < cols; c++)
                    matrix[r, c] = c < row.Length ? row[c] : 0;
            }
    
            return matrix;
        }
    }
    
}
