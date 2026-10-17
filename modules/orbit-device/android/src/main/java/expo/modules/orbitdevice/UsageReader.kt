package expo.modules.orbitdevice

import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.os.Build
import android.os.Process
import android.os.UserManager

internal object MonitoredApps {
  val packages = linkedMapOf(
    "youtube" to "com.google.android.youtube",
    "instagram" to "com.instagram.android",
    "tiktok" to "com.zhiliaoapp.musically",
    "facebook" to "com.facebook.katana"
  )
  fun idForPackage(packageName: String) = packages.entries.firstOrNull { it.value == packageName }?.key
}

internal data class UsageSession(
  val appId: String,
  val startedAt: Long,
  val endedAt: Long,
  val isOngoing: Boolean
) {
  fun toMap(): Map<String, Any> = mapOf(
    "id" to "android:$appId:$startedAt",
    "appId" to appId,
    "startedAt" to startedAt,
    "endedAt" to endedAt,
    "source" to "android-usage-events",
    "isOngoing" to isOngoing
  )
}

internal object UsageReader {
  fun hasAccess(context: Context): Boolean {
    val manager = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
    val mode = if (Build.VERSION.SDK_INT >= 29) {
      manager.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName)
    } else {
      @Suppress("DEPRECATION")
      manager.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName)
    }
    return mode == AppOpsManager.MODE_ALLOWED
  }

  fun read(context: Context, since: Long, until: Long): List<UsageSession> {
    check(hasAccess(context)) { "Usage Access is off. Enable Orbit in Android Usage Access settings." }
    check((context.getSystemService(Context.USER_SERVICE) as UserManager).isUserUnlocked) {
      "Unlock the device before reading usage history."
    }
    require(since >= 0 && until > since) { "Invalid usage time range." }
    val stop = minOf(until, System.currentTimeMillis())
    if (since >= stop) return emptyList()
    val manager = context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
    // A lookback recovers sessions that cross the requested boundary. It cannot
    // recover OS-pruned history, which is explicitly disclosed in capabilities.
    val events = manager.queryEvents(maxOf(0, since - 86_400_000L), stop)
      ?: throw IllegalStateException("Android usage events are temporarily unavailable. Unlock the device and retry.")
    val sessions = mutableListOf<UsageSession>()
    var activePackage: String? = null
    var activeClass: String? = null
    var activeStart = 0L

    fun close(at: Long, ongoing: Boolean = false) {
      val id = activePackage?.let { MonitoredApps.idForPackage(it) }
      if (id != null && at > activeStart && at > since) {
        // Keep the actual start as a stable deduplication key. Consumers clip
        // intervals to their reporting range; a repeated query updates this row.
        sessions.add(UsageSession(id, activeStart, minOf(at, stop), ongoing))
      }
      activePackage = null
      activeClass = null
    }

    val event = UsageEvents.Event()
    while (events.hasNextEvent()) {
      events.getNextEvent(event)
      when (event.eventType) {
        UsageEvents.Event.ACTIVITY_RESUMED -> {
          if (activePackage != event.packageName) {
            close(event.timeStamp)
            activePackage = event.packageName
            activeStart = event.timeStamp
          }
          // Multi-resume and in-app Activity transitions can report the old
          // Activity's pause after the new Activity has already resumed.
          activeClass = event.className
        }
        UsageEvents.Event.ACTIVITY_PAUSED -> {
          if (activePackage == event.packageName && (event.className == null || activeClass == null || activeClass == event.className)) close(event.timeStamp)
        }
        UsageEvents.Event.SCREEN_NON_INTERACTIVE,
        UsageEvents.Event.KEYGUARD_SHOWN,
        UsageEvents.Event.DEVICE_SHUTDOWN,
        UsageEvents.Event.DEVICE_STARTUP -> close(event.timeStamp)
      }
    }
    close(stop, ongoing = true)
    return sessions
  }
}
