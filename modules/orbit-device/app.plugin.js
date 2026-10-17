const { withEntitlementsPlist, withGradleProperties, withInfoPlist, withPodfileProperties } = require('expo/config-plugins');

/**
 * The plugin configures the host only. Extension targets and their signing must
 * be added to the generated Xcode project using ios/Extensions/README.md.
 * Runtime capability checks require the corresponding extension to be embedded.
 */
module.exports = function withOrbitDevice(config, options = {}) {
  const { enableScreenTime = false, enableLiveActivities = false, appGroup } = options;
  if (enableScreenTime && (!appGroup || !appGroup.startsWith('group.'))) {
    throw new Error('Orbit Screen Time requires a registered appGroup beginning with group.');
  }
  config = withGradleProperties(config, mod => {
    const minimum = mod.modResults.find(item => item.type === 'property' && item.key === 'android.minSdkVersion');
    if (minimum) {
      if (Number.parseInt(minimum.value, 10) < 26) minimum.value = '26';
    } else {
      mod.modResults.push({ type: 'property', key: 'android.minSdkVersion', value: '26' });
    }
    return mod;
  });
  config = withInfoPlist(config, mod => {
    mod.modResults.OrbitScreenTimeEnabled = enableScreenTime;
    if (appGroup) mod.modResults.OrbitAppGroup = appGroup;
    if (enableLiveActivities) mod.modResults.NSSupportsLiveActivities = true;
    return mod;
  });
  if (enableScreenTime) {
    config = withEntitlementsPlist(config, mod => {
      mod.modResults['com.apple.developer.family-controls'] = true;
      const groups = mod.modResults['com.apple.security.application-groups'] || [];
      mod.modResults['com.apple.security.application-groups'] = [...new Set([...groups, appGroup])];
      return mod;
    });
  }
  return withPodfileProperties(config, mod => {
    const existing = Number.parseFloat(mod.modResults['ios.deploymentTarget'] || '0');
    // Expo SDK 57's own pods require iOS 16.4. Preserve a higher app minimum.
    if (existing < 16.4) mod.modResults['ios.deploymentTarget'] = '16.4';
    return mod;
  });
};
