using UnityEngine;
using UnityEngine.UI;

namespace GemSortingPuzzle
{
    /// <summary>
    /// Setting popup: toggle Sound + Vibration (the real vibration effect will be added later),
    /// with Close and Replay.
    /// </summary>
    public class SettingView : BasePopup
    {
        private const string MusicFrameName = "MusicFrame";
        private const string VibrationFrameName = "VibrationFrame";
        private const string OnName = "On";
        private const string OffName = "Off";
        private const string FrameName = "Frame";
    
        private const string CloseName = "Close";
        private const string ReplayName = "Replay";
    
        [Header("Prefs Keys")]
        [SerializeField] private string soundOnKey = "setting_sound_on";
        [SerializeField] private string vibrationOnKey = "setting_vibration_on";
    
        [SerializeField] private string savedMusicVolumeKey = "setting_music_volume";
        [SerializeField] private string savedSfxVolumeKey = "setting_sfx_volume";
    
        [Header("Defaults")]
        [SerializeField] private bool defaultSoundOn = true;
        [SerializeField] private bool defaultVibrationOn = true;
    
        private bool _soundOn;
        private bool _vibrationOn;
        private float _savedMusicVolume = 1f;
        private float _savedSfxVolume = 1f;
    
        private Transform _musicFrame;
        private Transform _musicToggleHit;
        private GameObject _musicOnObj;
        private GameObject _musicOffObj;
    
        private Transform _vibrationFrame;
        private Transform _vibrationToggleHit;
        private GameObject _vibrationOnObj;
        private GameObject _vibrationOffObj;
    
        private Button _closeButton;
        private Button _replayButton;
        private Button _soundButton;
        private Button _vibrationButton;
    
        protected override void Awake()
        {
            base.Awake();
    
            CacheNodesAndBindButtons();
    
            // Load prefs and apply immediately so the state is correct when the popup is shown.
            _soundOn = PlayerPrefs.GetInt(soundOnKey, defaultSoundOn ? 1 : 0) == 1;
            _vibrationOn = PlayerPrefs.GetInt(vibrationOnKey, defaultVibrationOn ? 1 : 0) == 1;
    
            var am = AudioManager.Instance;
            if (am != null)
            {
                _savedMusicVolume = PlayerPrefs.GetFloat(savedMusicVolumeKey, am.MusicVolume);
                _savedSfxVolume = PlayerPrefs.GetFloat(savedSfxVolumeKey, am.SfxVolume);
            }
            else
            {
                _savedMusicVolume = PlayerPrefs.GetFloat(savedMusicVolumeKey, 1f);
                _savedSfxVolume = PlayerPrefs.GetFloat(savedSfxVolumeKey, 1f);
            }
    
            ApplySound(_soundOn);
            ApplyVibration(_vibrationOn);
            ApplyVisuals();
        }
    
        private void CacheNodesAndBindButtons()
        {
            _musicFrame = FindDeepChild(transform, MusicFrameName);
            _vibrationFrame = FindDeepChild(transform, VibrationFrameName);
    
            // Music: On/Off icons + hit area ("Frame")
            if (_musicFrame != null)
            {
                _musicOnObj = FindDeepChildGameObject(_musicFrame, OnName);
                _musicOffObj = FindDeepChildGameObject(_musicFrame, OffName);
                _musicToggleHit = FindDeepChild(_musicFrame, FrameName);
            }
    
            // Vibration: On/Off icons + hit area ("Frame")
            if (_vibrationFrame != null)
            {
                _vibrationOnObj = FindDeepChildGameObject(_vibrationFrame, OnName);
                _vibrationOffObj = FindDeepChildGameObject(_vibrationFrame, OffName);
                _vibrationToggleHit = FindDeepChild(_vibrationFrame, FrameName);
            }
    
            // Close / Replay buttons
            var closeGO = FindDeepChildGameObject(transform, CloseName);
            var replayGO = FindDeepChildGameObject(transform, ReplayName);
    
            if (closeGO != null)
            {
                _closeButton = EnsureButton(closeGO);
                if (_closeButton != null)
                {
                    _closeButton.onClick.RemoveAllListeners();
                    _closeButton.onClick.AddListener(OnCloseClicked);
                }
            }
    
            if (replayGO != null)
            {
                _replayButton = EnsureButton(replayGO);
                if (_replayButton != null)
                {
                    _replayButton.onClick.RemoveAllListeners();
                    _replayButton.onClick.AddListener(OnReplayClicked);
                }
            }
    
            // Sound toggle hit
            if (_musicToggleHit != null)
            {
                _soundButton = EnsureButton(_musicToggleHit.gameObject);
                if (_soundButton != null)
                {
                    _soundButton.onClick.RemoveAllListeners();
                    _soundButton.onClick.AddListener(() => OnSoundToggleRequested(!_soundOn));
                }
            }
    
            // Vibration toggle hit
            if (_vibrationToggleHit != null)
            {
                _vibrationButton = EnsureButton(_vibrationToggleHit.gameObject);
                if (_vibrationButton != null)
                {
                    _vibrationButton.onClick.RemoveAllListeners();
                    _vibrationButton.onClick.AddListener(() => OnVibrationToggleRequested(!_vibrationOn));
                }
            }
        }
    
        public override void Show()
        {
            // Pause board interactions while setting popup is visible.
            var gm = GameManager.Instance;
            if (gm != null)
                gm.SetPause();
    
            // Ensure the state is always in sync when shown again (prefs might be changed elsewhere).
            _soundOn = PlayerPrefs.GetInt(soundOnKey, defaultSoundOn ? 1 : 0) == 1;
            _vibrationOn = PlayerPrefs.GetInt(vibrationOnKey, defaultVibrationOn ? 1 : 0) == 1;
    
            var am = AudioManager.Instance;
            if (am != null)
            {
                _savedMusicVolume = PlayerPrefs.GetFloat(savedMusicVolumeKey, am.MusicVolume);
                _savedSfxVolume = PlayerPrefs.GetFloat(savedSfxVolumeKey, am.SfxVolume);
            }
    
            ApplySound(_soundOn);
            ApplyVibration(_vibrationOn);
            ApplyVisuals();
    
            base.Show();
        }
    
        protected override void OnHidden()
        {
            // Resume gameplay when the setting popup fully hides.
            var gm = GameManager.Instance;
            if (gm != null && gm.CurrentState == GameManager.State.PAUSE)
                gm.SetPlaying();
        }
    
        private void ApplyVisuals()
        {
            if (_musicOnObj != null) _musicOnObj.SetActive(_soundOn);
            if (_musicOffObj != null) _musicOffObj.SetActive(!_soundOn);
    
            if (_vibrationOnObj != null) _vibrationOnObj.SetActive(_vibrationOn);
            if (_vibrationOffObj != null) _vibrationOffObj.SetActive(!_vibrationOn);
        }
    
        private void ApplySound(bool on)
        {
            var am = AudioManager.Instance;
            if (am == null) return;
    
            if (on)
            {
                am.MusicVolume = _savedMusicVolume;
                am.SfxVolume = _savedSfxVolume;
            }
            else
            {
                // Cache the current volume so turning it back on restores the same value.
                _savedMusicVolume = am.MusicVolume;
                _savedSfxVolume = am.SfxVolume;
                PlayerPrefs.SetFloat(savedMusicVolumeKey, _savedMusicVolume);
                PlayerPrefs.SetFloat(savedSfxVolumeKey, _savedSfxVolume);
    
                am.MusicVolume = 0f;
                am.SfxVolume = 0f;
                PlayerPrefs.SetInt(soundOnKey, 0);
                PlayerPrefs.Save();
            }
        }
    
        private void ApplyVibration(bool on)
        {
            _vibrationOn = on;
            PlayerPrefs.SetInt(vibrationOnKey, on ? 1 : 0);
            PlayerPrefs.Save();
    
            // TODO: the real vibration effect will be added later (requires game-side manager/logic).
            // Currently it only stores state + (depending on the platform) can do test vibration.
    #if UNITY_ANDROID || UNITY_IOS
            if (on)
                Handheld.Vibrate();
    #endif
        }
    
        private void OnSoundToggleRequested(bool newState)
        {
            GameAudio.PlayUiButtonClick();
            _soundOn = newState;
            PlayerPrefs.SetInt(soundOnKey, _soundOn ? 1 : 0);
            PlayerPrefs.Save();
    
            // If turning off: cache volume then set to 0. If turning on: restore cached volume.
            ApplySound(_soundOn);
            ApplyVisuals();
        }
    
        private void OnVibrationToggleRequested(bool newState)
        {
            GameAudio.PlayUiButtonClick();
            ApplyVibration(newState);
            ApplyVisuals();
        }
    
        private void OnCloseClicked()
        {
            GameAudio.PlayUiButtonClick();
            Hide();
    
            var ui = GameManager.Instance != null ? GameManager.Instance.UIManager : null;
            if (ui != null)
                ui.Show(UIManager.ViewId.Game);
        }
    
        private void OnReplayClicked()
        {
            GameAudio.PlayUiButtonClick();
            var gm = GameManager.Instance;
            if (gm == null) return;
    
            int idx = gm.CurrentLevelIndex;
            gm.CleanBoardAndTray();
            gm.OnLevelLoaded(idx);
    
            if (gm.BoardManager != null)
                gm.BoardManager.InitForCurrentLevel();
    
            gm.SetPlaying();
    
            Hide();
    
            var ui = gm.UIManager;
            if (ui != null)
                ui.Show(UIManager.ViewId.Game);
        }
    
        private static Button EnsureButton(GameObject go)
        {
            if (go == null) return null;
    
            var btn = go.GetComponent<Button>();
            if (btn == null)
                btn = go.AddComponent<Button>();
    
            if (btn.targetGraphic == null)
                btn.targetGraphic = go.GetComponent<Graphic>();
    
            return btn;
        }
    
        private static Transform FindDeepChild(Transform parent, string name)
        {
            if (parent == null) return null;
            if (string.IsNullOrEmpty(name)) return null;
    
            // Iterative stack would be slightly faster; recursion is fine for UI tree size.
            foreach (Transform child in parent)
            {
                if (child != null && child.name == name)
                    return child;
    
                var found = FindDeepChild(child, name);
                if (found != null)
                    return found;
            }
    
            return null;
        }
    
        private static GameObject FindDeepChildGameObject(Transform parent, string name)
        {
            var t = FindDeepChild(parent, name);
            return t != null ? t.gameObject : null;
        }
    }
    
    
}
