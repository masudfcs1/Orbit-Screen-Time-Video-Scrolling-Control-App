package expo.modules.orbitdevice

import android.content.Context
import org.json.JSONArray
import java.time.Instant
import java.time.ZoneId

internal object RestrictionEngine {
  private const val PREFS = "orbit_device_restrictions"
  private var usageCacheAt = 0L
  private var usageCacheDay = ""
  private var usageCache = emptyMap<String, Long>()

  private fun preferences(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun consented(context: Context) = preferences(context).getBoolean("blockingConsent", false)

  fun grantConsent(context: Context) {
    check(preferences(context).edit().putBoolean("blockingConsent", true).commit()) {
      "Could not persist your app-blocking consent."
    }
  }

  @Synchronized fun save(context: Context, rules: List<Map<String, Any?>>) {
    // Defense in depth: never permit a rule to lock settings, the launcher, or Orbit.
    for (rule in rules) {
      val ids = rule["appIds"] as? List<*> ?: error("A restriction needs selected apps.")
      require(ids.isNotEmpty() && ids.all { it in MonitoredApps.packages.keys }) { "Unsupported app in restriction." }
      require(rule["kind"] in listOf("until", "daily", "schedule")) { "Unsupported restriction kind." }
    }
    check(preferences(context).edit().putString("rules", JSONArray(rules).toString()).commit()) {
      "Could not persist your restrictions."
    }
    invalidate()
  }

  @Synchronized fun invalidate() { usageCacheAt = 0L }

  /** Notification actions affect only the focus rule whose ID is the countdown ID. */
  @Synchronized fun updateCountdownRule(context: Context, id: String, action: String, endsAt: Long = 0) {
    val prefs = preferences(context)
    val existing = JSONArray(prefs.getString("rules", "[]"))
    val next = JSONArray()
    var changed = false
    for (index in 0 until existing.length()) {
      val rule = existing.getJSONObject(index)
      if (rule.optString("id") == id && rule.optString("kind") == "until") {
        changed = true
        when (action) {
          "remove" -> continue
          "pause" -> rule.put("enabled", false)
          "resume" -> { rule.put("enabled", true); rule.put("until", endsAt) }
        }
      }
      next.put(rule)
    }
    if (changed) {
      check(prefs.edit().putString("rules", next.toString()).commit()) { "Could not update the focus restriction." }
      invalidate()
    }
  }

  @Synchronized fun isBlocked(context: Context, packageName: String, now: Long = System.currentTimeMillis()): Boolean {
    if (!consented(context)) return false
    val appId = MonitoredApps.idForPackage(packageName) ?: return false
    val rules = try { JSONArray(preferences(context).getString("rules", "[]")) } catch (_: Exception) { return false }
    val local = Instant.ofEpochMilli(now).atZone(ZoneId.systemDefault())
    val minute = local.hour * 60 + local.minute
    val day = local.dayOfWeek.value % 7
    for (index in 0 until rules.length()) {
      val rule = rules.getJSONObject(index)
      if (!rule.optBoolean("enabled", false)) continue
      val apps = rule.optJSONArray("appIds") ?: continue
      if ((0 until apps.length()).none { apps.optString(it) == appId }) continue
      when (rule.optString("kind")) {
        "until" -> if (now < rule.optLong("until", 0)) return true
        "schedule" -> {
          val days = rule.optJSONArray("days") ?: continue
          val allowedDays = (0 until days.length()).map { days.optInt(it, -1) }
          val start = rule.optInt("startMinute", -1)
          val end = rule.optInt("endMinute", -1)
          if (start !in 0..1439 || end !in 0..1439 || start == end) continue
          val applies = if (start < end) {
            day in allowedDays && minute >= start && minute < end
          } else {
            (day in allowedDays && minute >= start) || ((day + 6) % 7 in allowedDays && minute < end)
          }
          if (applies) return true
        }
        "daily" -> {
          if (!UsageReader.hasAccess(context)) continue
          val dayKey = local.toLocalDate().toString() + local.zone.id
          if (now - usageCacheAt !in 0..4_999 || dayKey != usageCacheDay) {
            val midnight = local.toLocalDate().atStartOfDay(local.zone).toInstant().toEpochMilli()
            usageCache = try {
              UsageReader.read(context, midnight, now).groupBy { it.appId }.mapValues { (_, sessions) ->
                sessions.sumOf { it.endedAt - maxOf(it.startedAt, midnight) }
              }
            } catch (_: Exception) { emptyMap() }
            usageCacheAt = now
            usageCacheDay = dayKey
          }
          val allowance = rule.optDouble("dailyMinutes", 0.0)
          if (allowance > 0 && (usageCache[appId] ?: 0L) >= allowance * 60_000) return true
        }
      }
    }
    return false
  }
}
