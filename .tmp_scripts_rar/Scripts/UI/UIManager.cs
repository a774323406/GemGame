using System;
using System.Collections.Generic;
using UnityEngine;

namespace GemSortingPuzzle
{
    /// <summary>
    /// Manages all UI Views (Panels/Popups) with Show/Hide based on ViewId.
    /// Requirement: all Views must inherit from BasePanel (BasePopup also inherits from BasePanel).
    /// </summary>
    public class UIManager : MonoBehaviour
    {
        public enum ViewId
        {
            Game,
            GameWin,
            CoinView,
            Setting,
            Shop
        }
    
        [Serializable]
        public class ViewEntry
        {
            public ViewId id;
            public BasePanel view;
        }
    
        [Header("Registered Views")]
        [SerializeField] private ViewEntry[] views;
    
        [Header("Shared UI References")]
        [SerializeField] private CoinView coinView;
        public CoinView CoinView => coinView;
    
        /// <summary>View registered for ViewId.Game (usually GameView).</summary>
        public GameView GameView => GetView<GameView>(ViewId.Game);
    
        [Header("Behavior")]
        [Tooltip("When showing a new View, automatically hide the other Views.")]
        [SerializeField] private bool hideOthersWhenShowing = true;
    
        [Tooltip("The default View will be shown on Awake (if it is registered).")]
        [SerializeField] private ViewId defaultView = ViewId.Game;
        [SerializeField] private bool showDefaultOnAwake = true;
    
        private readonly Dictionary<ViewId, BasePanel> _map = new Dictionary<ViewId, BasePanel>();
    
        private void Awake()
        {
            _map.Clear();
    
            if (views == null) return;
            foreach (var entry in views)
            {
                if (entry == null) continue;
                if (entry.view == null) continue;
                if (_map.ContainsKey(entry.id)) continue;
                _map[entry.id] = entry.view;
            }
    
            if (showDefaultOnAwake)
                Show(defaultView);
        }
    
        public void Show(ViewId id)
        {
            if (hideOthersWhenShowing)
            {
                foreach (var kv in _map)
                {
                    if (kv.Key == id) continue;
                    kv.Value?.Hide();
                }
            }
    
            if (_map.TryGetValue(id, out var view) && view != null)
            {
                view.Show();
                return;
            }
    
            // Fallback: if the View is not registered in the Inspector,
            // still find the existing scene object by name and add the component at runtime.
            if (id == ViewId.Setting)
            {
                var settingView = FindObjectOfType<SettingView>(true);
                if (settingView == null)
                {
                    var go = GameObject.Find("SettingView");
                    if (go != null)
                        settingView = go.GetComponent<SettingView>() ?? go.AddComponent<SettingView>();
                }
    
                settingView?.Show();
            }
            else if (id == ViewId.Shop)
            {
                var shopView = FindObjectOfType<ShopView>(true);
                if (shopView == null)
                {
                    var go = GameObject.Find("ShopView");
                    if (go != null)
                        shopView = go.GetComponent<ShopView>() ?? go.AddComponent<ShopView>();
                }
    
                shopView?.Show();
            }
        }
    
        public void Hide(ViewId id)
        {
            if (_map.TryGetValue(id, out var view) && view != null)
            {
                view.Hide();
                return;
            }
    
            if (id == ViewId.Setting)
            {
                var settingView = FindObjectOfType<SettingView>(true);
                settingView?.Hide();
            }
            else if (id == ViewId.Shop)
            {
                var shopView = FindObjectOfType<ShopView>(true);
                shopView?.Hide();
            }
        }
    
        public T GetView<T>(ViewId id) where T : BasePanel
        {
            if (_map.TryGetValue(id, out var view) && view is T typed)
                return typed;
            return null;
        }
    }
    
    
}
