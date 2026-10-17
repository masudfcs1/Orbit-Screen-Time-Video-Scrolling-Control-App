import ActivityKit
import Foundation

public struct OrbitActivityAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    public var endsAt: Date
    public var title: String
  }
  public let sessionID: String
  public let startedAt: Date
}
