Pod::Spec.new do |s|
  s.name = 'OrbitDevice'
  s.version = '1.0.0'
  s.summary = 'Private on-device usage, restrictions, and countdown integration for Orbit.'
  s.description = 'Expo native module for Android UsageStats and Apple Screen Time and ActivityKit.'
  s.license = { :type => 'MIT' }
  s.author = 'Orbit'
  s.homepage = 'https://example.invalid/orbit'
  s.platforms = { :ios => '16.4' }
  s.source = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = 'OrbitDeviceModule.swift', 'Shared/*.swift'
  s.swift_version = '5.9'
  s.frameworks = 'FamilyControls', 'DeviceActivity', 'ManagedSettings', 'ActivityKit', 'SwiftUI', 'UserNotifications'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
end
