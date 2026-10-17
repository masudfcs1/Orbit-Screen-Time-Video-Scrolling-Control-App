package expo.modules.orbitdevice

import android.Manifest
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import expo.modules.interfaces.permissions.PermissionsStatus
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class OrbitDeviceModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw IllegalStateException("Orbit's native context is unavailable.")

  private fun openNotificationSettings() {
    context.startActivity(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
      .putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
  }

  override fun definition() = ModuleDefinition {
    Name("OrbitDevice")

    AsyncFunction("getCapabilities") {
      mapOf(
        "platform" to "android", "nativeModuleAvailable" to true,
        "usageTracking" to true, "usageAccessGranted" to UsageReader.hasAccess(context),
        "notificationsGranted" to OrbitCountdown.allowed(context), "countdownNotifications" to true,
        "blocking" to true,
        "blockingAccessGranted" to (RestrictionEngine.consented(context) && OrbitBlockingService.isEnabled(context)),
        "screenTimeAuthorized" to false, "liveActivity" to false, "exactVideoCounts" to false,
        "limitations" to listOf(
          "Usage Access reports foreground sessions, never the number of videos watched. Android keeps detailed events for only a few days; open Orbit regularly to preserve them locally.",
          "App limits require your explicit consent and Android Accessibility access. Orbit checks app package names only and returns restricted apps to Home; a brief app frame can appear before the redirect.",
          "Daily allowances need Usage Access; enforcement may lag by up to 5 seconds. OEM battery rules, force-stop, permission revocation, uninstall, split-screen, and system overrides can interrupt enforcement.",
          "Only YouTube, Instagram, TikTok, and Facebook Android packages are queried. Work profiles, cloned apps, browsers, and alternate app packages are not included.",
          "Native countdowns are wall-clock timers and do not follow another app's foreground state. Pause and stop them from the notification."
        )
      )
    }

    AsyncFunction("requestUsageAccess") {
      try {
        context.startActivity(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS, Uri.parse("package:${context.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      } catch (_: ActivityNotFoundException) {
        context.startActivity(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      }
    }

    AsyncFunction("readUsageSessions") { since: Double, until: Double ->
      UsageReader.read(context, since.toLong(), until.toLong()).map { it.toMap() }
    }

    AsyncFunction("discoverMonitoredApps") {
      MonitoredApps.packages.mapNotNull { (id, packageName) ->
        try {
          @Suppress("DEPRECATION")
          val info = context.packageManager.getApplicationInfo(packageName, 0)
          mapOf("id" to id, "name" to context.packageManager.getApplicationLabel(info).toString(), "platform" to "android", "installed" to true)
        } catch (_: PackageManager.NameNotFoundException) { null }
      }
    }

    AsyncFunction("requestNotificationPermission") { promise: Promise ->
      if (Build.VERSION.SDK_INT < 33) {
        val allowed = OrbitCountdown.allowed(context)
        if (!allowed) openNotificationSettings()
        promise.resolve(allowed)
      } else if (context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) {
        val allowed = OrbitCountdown.allowed(context)
        if (!allowed) openNotificationSettings()
        promise.resolve(allowed)
      } else {
        val permissions = appContext.permissions
        if (permissions == null) promise.reject("PERMISSIONS_UNAVAILABLE", "The native permission manager is unavailable.", null)
        else permissions.askForPermissions({ result ->
          promise.resolve(result[Manifest.permission.POST_NOTIFICATIONS]?.status == PermissionsStatus.GRANTED && OrbitCountdown.allowed(context))
        }, Manifest.permission.POST_NOTIFICATIONS)
      }
    }

    AsyncFunction("startNativeCountdown") { options: Map<String, Any?> ->
      OrbitCountdown.start(context, options["id"] as String, options["title"] as String, (options["endsAt"] as Number).toLong())
    }
    AsyncFunction("stopNativeCountdown") { OrbitCountdown.stop(context) }
    AsyncFunction("getNativeCountdownState") { OrbitCountdown.state(context) }
    AsyncFunction("getNativeCountdownAction") { OrbitCountdown.lastAction(context) }
    AsyncFunction("acknowledgeNativeCountdownAction") { at: Double -> OrbitCountdown.acknowledgeAction(context, at.toLong()) }

    AsyncFunction("requestBlockingAccess") { consent: Boolean ->
      check(consent) { "Read and accept the app-blocking disclosure before opening Accessibility settings." }
      RestrictionEngine.grantConsent(context)
      context.startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    AsyncFunction("syncRestrictions") { payload: Map<String, Any?> ->
      @Suppress("UNCHECKED_CAST")
      val rules = payload["rules"] as? List<Map<String, Any?>> ?: error("Restrictions are missing.")
      if (rules.any { it["enabled"] == true }) {
        check(RestrictionEngine.consented(context) && OrbitBlockingService.isEnabled(context)) {
          "Enable app blocking in Orbit and Android Accessibility settings before applying restrictions."
        }
        if (rules.any { it["enabled"] == true && it["kind"] == "daily" }) {
          check(UsageReader.hasAccess(context)) { "Daily usage allowances also require Android Usage Access." }
        }
      }
      RestrictionEngine.save(context, rules)
    }

    AsyncFunction<Unit>("requestScreenTimeAuthorization") { throw IllegalStateException("Apple Screen Time authorization is available only on iOS.") }
    AsyncFunction<Unit>("presentScreenTimePicker") { throw IllegalStateException("Apple's private app picker is available only on iOS.") }
  }
}
