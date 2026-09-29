package games.bazimazi.bball

import android.graphics.Color
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  /** Latest system-bar and cutout insets, in CSS pixels, as JSON. */
  @Volatile private var safeArea = "{\"t\":0,\"r\":0,\"b\":0,\"l\":0}"

  override fun onCreate(savedInstanceState: Bundle?) {
    // The game is dark whatever the system theme is, so the bar icons must
    // always be light - `auto` would paint them dark on a light-theme phone.
    enableEdgeToEdge(
      statusBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
      navigationBarStyle = SystemBarStyle.dark(Color.TRANSPARENT)
    )
    super.onCreate(savedInstanceState)
  }

  /**
   * The page draws edge to edge, but the WebView only reports display cutouts
   * through `env(safe-area-inset-*)` - not the status bar or the navigation
   * bar - so a footer button ends up under the gesture handle. Hand the page
   * the real insets instead: readable on load through `bBallInsets.get()`, and
   * pushed as a `bball:insets` event whenever they change (rotation, switching
   * between gesture and three-button navigation).
   */
  override fun onWebViewCreate(webView: WebView) {
    webView.addJavascriptInterface(InsetsBridge(), "bBallInsets")
    ViewCompat.setOnApplyWindowInsetsListener(webView) { view, insets ->
      val bars = insets.getInsets(
        WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
      )
      val density = resources.displayMetrics.density
      val next = "{\"t\":${bars.top / density},\"r\":${bars.right / density}," +
        "\"b\":${bars.bottom / density},\"l\":${bars.left / density}}"
      if (next != safeArea) {
        safeArea = next
        view.post {
          (view as WebView).evaluateJavascript(
            "window.dispatchEvent(new CustomEvent('bball:insets', { detail: $next }))",
            null
          )
        }
      }
      ViewCompat.onApplyWindowInsets(view, insets)
    }
  }

  private inner class InsetsBridge {
    @JavascriptInterface
    fun get(): String = safeArea
  }
}
