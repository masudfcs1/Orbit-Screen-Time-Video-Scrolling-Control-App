package expo.modules.orbitdevice

import android.Manifest
import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build

internal object OrbitCountdown {
  private const val CHANNEL = "orbit_countdown"
  private const val ID = 73510
  private fun preferences(context: Context) = context.getSharedPreferences("orbit_countdown", Context.MODE_PRIVATE)
  private fun actions(context: Context) = context.getSharedPreferences("orbit_countdown_actions", Context.MODE_PRIVATE)
  private fun manager(context: Context) = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

  fun allowed(context: Context): Boolean = manager(context).areNotificationsEnabled() &&
    (Build.VERSION.SDK_INT < 33 || context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) &&
    manager(context).getNotificationChannel(CHANNEL)?.importance != NotificationManager.IMPORTANCE_NONE

  fun start(context: Context, id: String, title: String, endsAt: Long) {
    check(allowed(context)) { "Enable Orbit notifications in Android settings before starting a native countdown." }
    val remaining = endsAt - System.currentTimeMillis()
    require(remaining in 1..28_800_000) { "The countdown must end within the next 8 hours." }
    check(preferences(context).edit().putString("id", id).putString("title", title)
      .putLong("endsAt", endsAt).putLong("remainingMs", remaining).putString("status", "running").commit()) {
      "Could not save the countdown."
    }
    RestrictionEngine.updateCountdownRule(context, id, "resume", endsAt)
    if (actions(context).getString("id", null) == id) actions(context).edit().clear().commit()
    display(context)
  }

  fun state(context: Context): Map<String, Any>? {
    val prefs = preferences(context)
    val id = prefs.getString("id", null) ?: return null
    val paused = prefs.getString("status", "running") == "paused"
    val endsAt = prefs.getLong("endsAt", 0)
    val remaining = if (paused) prefs.getLong("remainingMs", 0) else endsAt - System.currentTimeMillis()
    if (remaining <= 0) { finish(context, "expired"); return null }
    return mapOf("id" to id, "title" to prefs.getString("title", "Focus time").orEmpty(),
      "endsAt" to endsAt, "remainingMs" to remaining, "status" to if (paused) "paused" else "running")
  }

  fun lastAction(context: Context): Map<String, Any>? {
    val prefs = actions(context)
    val id = prefs.getString("id", null) ?: return null
    return mapOf("id" to id, "action" to prefs.getString("action", "stopped").orEmpty(), "at" to prefs.getLong("at", 0))
  }

  fun acknowledgeAction(context: Context, at: Long) {
    val prefs = actions(context)
    if (prefs.getLong("at", -1) == at) prefs.edit().clear().commit()
  }

  private fun action(context: Context, action: String): PendingIntent = PendingIntent.getBroadcast(
    context, action.hashCode(), Intent(context, OrbitCountdownReceiver::class.java).setAction(action),
    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
  )

  fun display(context: Context) {
    val state = state(context) ?: return
    if (!allowed(context)) return
    val notifications = manager(context)
    notifications.createNotificationChannel(NotificationChannel(CHANNEL, "Focus countdown", NotificationManager.IMPORTANCE_LOW).apply {
      description = "Your active countdown with pause, resume, and stop controls."
      setShowBadge(false)
    })
    val paused = state["status"] == "paused"
    val remaining = state["remainingMs"] as Long
    val builder = Notification.Builder(context, CHANNEL)
      .setSmallIcon(R.drawable.orbit_notification)
      .setContentTitle(state["title"] as String)
      .setContentText(if (paused) "Paused · ${remaining / 60_000} min remaining" else "A little space for what matters")
      .setCategory(Notification.CATEGORY_STOPWATCH)
      .setOnlyAlertOnce(true).setOngoing(true).setColor(0xFFB6E3A8.toInt())
      .addAction(Notification.Action.Builder(null, if (paused) "Resume" else "Pause", action(context, if (paused) "resume" else "pause")).build())
      .addAction(Notification.Action.Builder(null, "Stop", action(context, "stop")).build())
    context.packageManager.getLaunchIntentForPackage(context.packageName)?.let { launch ->
      builder.setContentIntent(PendingIntent.getActivity(context, ID, launch, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
    }
    val alarms = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    alarms.cancel(action(context, "expire"))
    if (!paused) {
      val endsAt = state["endsAt"] as Long
      builder.setWhen(endsAt).setShowWhen(true).setUsesChronometer(true).setChronometerCountDown(true)
      builder.setTimeoutAfter(remaining)
      // Inexact cleanup is sufficient: the system owns the live chronometer and
      // notification timeout. No exact alarm or foreground service is justified.
      alarms.set(AlarmManager.RTC_WAKEUP, endsAt, action(context, "expire"))
    }
    try { notifications.notify(ID, builder.build()) } catch (_: SecurityException) {
      throw IllegalStateException("Notification permission was revoked. Re-enable notifications in Android Settings.")
    }
  }

  fun handle(context: Context, actionName: String?) {
    val state = state(context) ?: return
    when (actionName) {
      "stop" -> finish(context, "stopped")
      "expire" -> if (state["status"] == "running") display(context) // state() already finishes genuinely expired timers.
      "pause" -> {
        RestrictionEngine.updateCountdownRule(context, state["id"] as String, "pause")
        preferences(context).edit().putLong("remainingMs", state["remainingMs"] as Long).putString("status", "paused").commit()
        display(context)
      }
      "resume" -> {
        val endsAt = System.currentTimeMillis() + (state["remainingMs"] as Long)
        RestrictionEngine.updateCountdownRule(context, state["id"] as String, "resume", endsAt)
        preferences(context).edit().putLong("endsAt", endsAt).putString("status", "running").commit()
        display(context)
      }
    }
  }

  private fun finish(context: Context, action: String) {
    val id = preferences(context).getString("id", null)
    if (id != null) {
      RestrictionEngine.updateCountdownRule(context, id, "remove")
      check(actions(context).edit().putString("id", id).putString("action", action).putLong("at", System.currentTimeMillis()).commit()) {
        "Could not save the countdown action."
      }
    }
    stop(context)
  }

  /** Programmatic visual cleanup never cancels restrictions or erases the action journal. */
  fun stop(context: Context) {
    preferences(context).edit().clear().commit()
    manager(context).cancel(ID)
    (context.getSystemService(Context.ALARM_SERVICE) as AlarmManager).cancel(action(context, "expire"))
  }
}

class OrbitCountdownReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    try { OrbitCountdown.handle(context, intent.action) } catch (_: Exception) { /* Permission changes must not crash the host app. */ }
  }
}

class OrbitRestoreReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action !in setOf(Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED, Intent.ACTION_TIME_CHANGED, Intent.ACTION_TIMEZONE_CHANGED)) return
    RestrictionEngine.invalidate()
    try { OrbitCountdown.display(context) } catch (_: Exception) { /* User can recover permissions in Orbit. */ }
    // Android restores an enabled accessibility service itself; never secretly
    // re-enable it. Stored rules are read by the service on its next callback.
  }
}
