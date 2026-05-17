using UnityEngine;

namespace GemSortingPuzzle
{
    public enum BlockColor
    {
        None,
        Blue,
        Brown,
        Cyan,
        DarkBlue,
        Green,
        LightGreen,
        LightPink,
        LightYellow,
        Orange,
        Pink,
        Purple,
        PurpleRed,
        Red,
        White,
        Yellow,
        DarkBrown,
        DarkGreen,
        Black,
        LightOrange
    }
    
    [CreateAssetMenu(fileName = "BlockConfig", menuName = "DiamondSort/Block Config")]
    public class BlockConfig : ScriptableObject
    {
        public BlockColor color;
        public Sprite tileSprite;
        public Sprite blockSprite;
        public Sprite collapseBlockSprite;
        public Color blockColor;
        public Color selectionColor;
    }
    
}
