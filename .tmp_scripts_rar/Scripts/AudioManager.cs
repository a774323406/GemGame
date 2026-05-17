using UnityEngine;

namespace GemSortingPuzzle
{
    /// <summary>
    /// Singleton that manages background music (BGM) and sound effects (SFX).
    /// Attach it to a GameObject in the scene (usually the root); you can assign AudioSources in advance or let the script create them.
    /// </summary>
    public class AudioManager : MonoBehaviour
    {
        public static AudioManager Instance { get; private set; }
    
        [Header("Sources (optional — auto-created if left empty)")]
        [SerializeField] private AudioSource musicSource;
        [SerializeField] private AudioSource sfxSource;
    
        [Header("Volumes")]
        [Range(0f, 1f)] [SerializeField] private float musicVolume = 1f;
        [Range(0f, 1f)] [SerializeField] private float sfxVolume = 1f;
    
        [Header("Music")]
        [SerializeField] private AudioClip defaultMusicClip;
        [SerializeField] private bool playDefaultMusicOnStart = true;
    
        public float MusicVolume
        {
            get => musicVolume;
            set
            {
                musicVolume = Mathf.Clamp01(value);
                if (musicSource != null)
                    musicSource.volume = musicVolume;
            }
        }
    
        public float SfxVolume
        {
            get => sfxVolume;
            set => sfxVolume = Mathf.Clamp01(value);
        }
    
        private void Awake()
        {
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject);
                return;
            }
    
            Instance = this;
            DontDestroyOnLoad(gameObject);
    
            EnsureSources();
            if (musicSource != null)
                musicSource.volume = musicVolume;
        }
    
        private void Start()
        {
            if (playDefaultMusicOnStart && defaultMusicClip != null)
                PlayMusic(defaultMusicClip, true);
        }
    
        private void EnsureSources()
        {
            if (musicSource == null)
            {
                var go = new GameObject("MusicSource");
                go.transform.SetParent(transform, false);
                musicSource = go.AddComponent<AudioSource>();
                musicSource.loop = true;
                musicSource.playOnAwake = false;
            }
    
            if (sfxSource == null)
            {
                var go = new GameObject("SfxSource");
                go.transform.SetParent(transform, false);
                sfxSource = go.AddComponent<AudioSource>();
                sfxSource.loop = false;
                sfxSource.playOnAwake = false;
            }
        }
    
        /// <summary>Plays background music. If the same clip is already playing, it will not restart.</summary>
        public void PlayMusic(AudioClip clip, bool loop = true)
        {
            if (clip == null || musicSource == null) return;
    
            if (musicSource.isPlaying && musicSource.clip == clip)
                return;
    
            musicSource.clip = clip;
            musicSource.loop = loop;
            musicSource.volume = musicVolume;
            musicSource.Play();
        }
    
        public void StopMusic()
        {
            if (musicSource == null) return;
            musicSource.Stop();
            musicSource.clip = null;
        }
    
        public void PauseMusic()
        {
            if (musicSource != null && musicSource.isPlaying)
                musicSource.Pause();
        }
    
        public void ResumeMusic()
        {
            if (musicSource != null && musicSource.clip != null)
                musicSource.UnPause();
        }
    
        /// <summary>Plays a SFX shot (can overlap multiple sounds).</summary>
        public void PlaySfx(AudioClip clip, float volumeScale = 1f)
        {
            if (clip == null || sfxSource == null) return;
            float v = Mathf.Clamp01(sfxVolume * volumeScale);
            sfxSource.PlayOneShot(clip, v);
        }
    
        /// <summary>Plays a SFX at a world position (for 3D/spatial audio if needed).</summary>
        public void PlaySfxAt(AudioClip clip, Vector3 position, float volumeScale = 1f)
        {
            if (clip == null) return;
            float v = Mathf.Clamp01(sfxVolume * volumeScale);
            AudioSource.PlayClipAtPoint(clip, position, v);
        }
    }
    
}
