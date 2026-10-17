import ActivityKit
import SwiftUI
import WidgetKit

struct OrbitLiveActivity: Widget {
  private let accent = Color(red: 0.72, green: 0.87, blue: 0.64)

  var body: some WidgetConfiguration {
    ActivityConfiguration(for: OrbitActivityAttributes.self) { context in
      HStack(spacing: 14) {
        Image(systemName: "circle.dotted.circle").font(.system(size: 30, weight: .light)).foregroundStyle(accent)
        VStack(alignment: .leading, spacing: 5) {
          Text("ORBIT / YOUR TIME").font(.system(size: 9, weight: .semibold, design: .monospaced)).tracking(2).foregroundStyle(accent)
          Text(context.state.title).font(.system(size: 16, weight: .medium)).lineLimit(1)
        }
        Spacer(minLength: 12)
        Text(timerInterval: context.attributes.startedAt...max(context.attributes.startedAt, context.state.endsAt), countsDown: true)
          .monospacedDigit().font(.system(size: 27, weight: .light)).multilineTextAlignment(.trailing)
      }
      .padding(20)
      .activityBackgroundTint(Color(red: 0.10, green: 0.13, blue: 0.12))
      .activitySystemActionForegroundColor(.white)
      .foregroundStyle(.white)
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          Image(systemName: "circle.dotted.circle").font(.title2).foregroundStyle(accent)
        }
        DynamicIslandExpandedRegion(.trailing) {
          Text(timerInterval: context.attributes.startedAt...max(context.attributes.startedAt, context.state.endsAt), countsDown: true)
            .monospacedDigit().font(.title2).foregroundStyle(accent)
        }
        DynamicIslandExpandedRegion(.bottom) {
          VStack(alignment: .leading, spacing: 8) {
            Text(context.state.title).font(.headline)
            Text("A little space for what matters.").font(.caption).foregroundStyle(.secondary)
          }.frame(maxWidth: .infinity, alignment: .leading).padding(.top, 8)
        }
      } compactLeading: {
        Image(systemName: "circle.dotted.circle").foregroundStyle(accent)
      } compactTrailing: {
        Text(timerInterval: context.attributes.startedAt...max(context.attributes.startedAt, context.state.endsAt), countsDown: true)
          .monospacedDigit().frame(width: 48).foregroundStyle(accent)
      } minimal: {
        Image(systemName: "circle.dotted.circle").foregroundStyle(accent)
      }
      .keylineTint(accent)
      .widgetURL(URL(string: "orbit://focus"))
    }
  }
}

@main
struct OrbitLiveActivityBundle: WidgetBundle {
  var body: some Widget { OrbitLiveActivity() }
}
