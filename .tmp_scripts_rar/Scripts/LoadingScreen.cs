using UnityEngine;
using UnityEngine.UI;
using UnityEngine.SceneManagement;

namespace GemSortingPuzzle
{
    /// <summary>
    /// Simple loading screen controller that animates a filled Image from 0 to 1
    /// over a fixed duration and then switches to the target gameplay scene.
    /// </summary>
    public class LoadingScreen : MonoBehaviour
    {
        [Header("UI")]
        [Tooltip("Image used as the progress bar. Image type should be 'Filled'.")]
        [SerializeField] private Image progressBar;

        [Header("Loading Settings")]
        [Tooltip("Name of the scene to load after the loading bar reaches 100%.")]
        [SerializeField] private string sceneToLoad = "GameScene";

        [Tooltip("How long the loading animation should take, in seconds.")]
        [SerializeField] private float loadingDuration = 2f;

        private void Start()
        {
            if (progressBar != null)
                progressBar.fillAmount = 0f;

            StartCoroutine(LoadSceneRoutine());
        }

        /// <summary>
        /// Animates the progress bar over <see cref="loadingDuration"/> seconds
        /// and then loads the specified scene.
        /// </summary>
        private System.Collections.IEnumerator LoadSceneRoutine()
        {
            float elapsed = 0f;

            while (elapsed < loadingDuration)
            {
                elapsed += Time.unscaledDeltaTime;
                float t = Mathf.Clamp01(elapsed / loadingDuration);

                if (progressBar != null)
                    progressBar.fillAmount = t;

                yield return null;
            }

            if (!string.IsNullOrEmpty(sceneToLoad))
            {
                // Use regular LoadScene here because the loading is purely time-based.
                SceneManager.LoadScene(sceneToLoad);
            }
        }
    }
}
