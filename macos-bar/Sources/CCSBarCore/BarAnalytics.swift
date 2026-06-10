import Foundation

/// Usage analytics for the menu bar, mirroring `GET /api/bar/analytics`.
///
/// Rolled up server-side from the persisted CLIProxy usage snapshot. All cost
/// values are USD.

/// Spend and request count for one usage surface (tool/origin), e.g. "Claude Code"
/// or "Codex". The server sends these ordered descending by cost for the same window
/// as topModels, so the array can be rendered as-is.
public struct BarAnalyticsSurface: Codable, Sendable, Equatable, Identifiable {
  public let source: String
  public let surface: String
  public let cost: Double
  public let requests: Int
  /// Stable identity for SwiftUI lists: surface name is unique within a window.
  public var id: String { surface }
  public init(source: String, surface: String, cost: Double, requests: Int) {
    self.source = source
    self.surface = surface
    self.cost = cost
    self.requests = requests
  }
}

public struct BarAnalytics: Codable, Sendable, Equatable {
  public struct Window: Codable, Sendable, Equatable {
    public let cost: Double
    public let requests: Int
    public init(cost: Double, requests: Int) {
      self.cost = cost
      self.requests = requests
    }
  }

  public struct Day: Codable, Sendable, Equatable, Identifiable {
    public let date: String
    public let cost: Double
    public let requests: Int
    public var id: String { date }
    public init(date: String, cost: Double, requests: Int) {
      self.date = date
      self.cost = cost
      self.requests = requests
    }
  }

  public struct Model: Codable, Sendable, Equatable, Identifiable {
    public let model: String
    public let cost: Double
    public let requests: Int
    public var id: String { model }
    public init(model: String, cost: Double, requests: Int) {
      self.model = model
      self.cost = cost
      self.requests = requests
    }
  }

  public let today: Window
  public let last7d: Window
  public let last30d: Window
  /// Honest calendar month-to-date (1st of the current local month → now), NOT a
  /// rolling 30 days. A fresh month resets this toward ~0 even when `last30d`
  /// stays populated, so a monthly-cap alert measures the real billing month.
  public let monthToDate: Window
  public let allTime: Window
  /// Oldest → newest, exactly 30 zero-filled entries, for the sparkline.
  public let byDay: [Day]
  public let topModels: [Model]
  /// "30d" when recent data exists, else "all".
  public let topModelsWindow: String
  /// ISO timestamp of the most recent non-failed usage record, null if none.
  public let lastActivityAt: String?
  /// Whole local-days since `lastActivityAt`, null if no usable records.
  public let daysSinceLastActivity: Int?
  /// True when the trailing 30 days carry any spend or requests. The UI pivots
  /// its empty/stale presentation on this without re-deriving it.
  public let hasRecentData: Bool
  public let generatedAt: String
  /// Spend/requests per usage surface (e.g. "Claude Code", "Codex"), ordered
  /// descending by cost for the same window as topModels. Empty when the backend
  /// has no surface breakdown; the UI omits the section in that case.
  public let bySurface: [BarAnalyticsSurface]

  public init(
    today: Window,
    last7d: Window,
    last30d: Window,
    monthToDate: Window = Window(cost: 0, requests: 0),
    allTime: Window,
    byDay: [Day],
    topModels: [Model],
    topModelsWindow: String,
    lastActivityAt: String? = nil,
    daysSinceLastActivity: Int? = nil,
    hasRecentData: Bool = false,
    generatedAt: String,
    bySurface: [BarAnalyticsSurface] = []
  ) {
    self.today = today
    self.last7d = last7d
    self.last30d = last30d
    self.monthToDate = monthToDate
    self.allTime = allTime
    self.byDay = byDay
    self.topModels = topModels
    self.topModelsWindow = topModelsWindow
    self.lastActivityAt = lastActivityAt
    self.daysSinceLastActivity = daysSinceLastActivity
    self.hasRecentData = hasRecentData
    self.generatedAt = generatedAt
    self.bySurface = bySurface
  }

  // Custom decoder: `bySurface` is a new field absent from older snapshots.
  // Defaulting to [] when the key is missing keeps the app backward-compatible
  // with any cached or older-backend analytics payload.
  public init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    today = try c.decode(Window.self, forKey: .today)
    last7d = try c.decode(Window.self, forKey: .last7d)
    last30d = try c.decode(Window.self, forKey: .last30d)
    // `monthToDate` is a newer field; older cached payloads omit it. Default to a
    // zero window so a stale cache decodes cleanly instead of throwing.
    monthToDate =
      (try c.decodeIfPresent(Window.self, forKey: .monthToDate)) ?? Window(cost: 0, requests: 0)
    allTime = try c.decode(Window.self, forKey: .allTime)
    byDay = try c.decode([Day].self, forKey: .byDay)
    topModels = try c.decode([Model].self, forKey: .topModels)
    topModelsWindow = try c.decode(String.self, forKey: .topModelsWindow)
    lastActivityAt = try c.decodeIfPresent(String.self, forKey: .lastActivityAt)
    daysSinceLastActivity = try c.decodeIfPresent(Int.self, forKey: .daysSinceLastActivity)
    hasRecentData = try c.decode(Bool.self, forKey: .hasRecentData)
    generatedAt = try c.decode(String.self, forKey: .generatedAt)
    bySurface = (try c.decodeIfPresent([BarAnalyticsSurface].self, forKey: .bySurface)) ?? []
  }
}
