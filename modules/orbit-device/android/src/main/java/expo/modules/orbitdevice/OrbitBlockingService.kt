package expo.modules.orbitdevice

import android.accessibilityservice.AccessibilityService
import android.content.ComponentName
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.accessibility.AccessibilityEvent
import android.widget.Toast
import java.util.concurrent.Executors

/** Reads only package names. No node tree, text, keystrokes, or scrolling data. */
class OrbitBlockingService : AccessibilityService() {
  private val handler = Handler(Looper.getMainLooper())
  private val evaluator = Executors.newSingleThreadExecutor()
  private var foregroundPackage: String? = null
  private var lastRedirect = 0L
  private var checkPending = false
  @Volatile private var destroyed = false
  private val checkActiveRule = object : Runnable {
    override fun run() {
      foregroundPackage?.let { enforce(it) }
      if (foregroundPackage != null) handler.postDelayed(this, 1_000)
    }
  }

  override fun onServiceConnected() {
    RestrictionEngine.invalidate()
  }

  override fun onAccessibilityEvent(event: AccessibilityEvent?) {
    if (event?.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return
    val packageName = event.packageName?.toString() ?: return
    handler.removeCallbacks(checkActiveRule)
    foregroundPackage = if (MonitoredApps.idForPackage(packageName) != null) packageName else null
    foregroundPackage?.let {
      enforce(it)
      handler.postDelayed(checkActiveRule, 1_000)
    }
  }

  private fun enforce(packageName: String) {
    val now = System.currentTimeMillis()
    if (checkPending || destroyed || now - lastRedirect in 0..1_499) return
    checkPending = true
    // UsageStats is a Binder query. Keep it off the accessibility event thread.
    evaluator.execute {
      val blocked = try { RestrictionEngine.isBlocked(this, packageName, now) } catch (_: Exception) { false }
      handler.post {
        checkPending = false
        if (!destroyed && blocked && foregroundPackage == packageName && performGlobalAction(GLOBAL_ACTION_HOME)) {
          lastRedirect = System.currentTimeMillis()
          Toast.makeText(this, "This app is paused by your Orbit limit. Change it in Orbit anytime.", Toast.LENGTH_LONG).show()
        }
      }
    }
  }

  override fun onInterrupt() { clear() }
  override fun onDestroy() {
    destroyed = true
    clear()
    evaluator.shutdownNow()
    super.onDestroy()
  }
  private fun clear() {
    foregroundPackage = null
    checkPending = false
    handler.removeCallbacksAndMessages(null)
  }

  companion object {
    fun isEnabled(context: Context): Boolean {
      val component = ComponentName(context, OrbitBlockingService::class.java)
      val enabled = Settings.Secure.getString(context.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES).orEmpty()
      return enabled.split(':').mapNotNull { ComponentName.unflattenFromString(it) }.any { it == component }
    }
  }
}
