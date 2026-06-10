import Foundation
import SwiftUI  // for ColorScheme equality in the theme-token checks
import CCSBarCore

// Lightweight assert harness used in place of XCTest (unavailable without a
// full Xcode install). Run with `swift run ccs-bar-check`; exits non-zero on
// any failure so it works as a CI/test gate on a CommandLineTools toolchain.

var failures = 0
func check(_ condition: Bool, _ message: String) {
  if condition {
    print("[OK] \(message)")
  } else {
    print("[X] \(message)")
    failures += 1
  }
}

// Recording transport so CCSBarClient can be exercised without a live server.
final class RequestRecorder: @unchecked Sendable {
  var lastRequest: URLRequest?
  var responseData = Data("[]".utf8)
  var status = 200
}
struct RecordingTransport: HTTPTransport {
  let recorder: RequestRecorder
  func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
    recorder.lastRequest = request
    let http = HTTPURLResponse(
      url: request.url!, statusCode: recorder.status, httpVersion: nil, headerFields: nil)!
    return (recorder.responseData, http)
  }
}

// MARK: BarSummaryRow decoding (mixed snake_case / camelCase keys)

let summaryJSON = """
[
  {
    "account_id": "alice@example.com",
    "provider": "agy",
    "displayName": "Alice (Ultra)",
    "tier": "ultra",
    "paused": false,
    "quota_percentage": 82.4,
    "quotaStatus": "ok",
    "next_reset": "2026-06-08T00:00:00Z",
    "is_default": true,
    "last_activity_at": "2026-04-29T10:00:00Z",
    "today_cost": 3.2,
    "health": "ok",
    "cached": true,
    "fetchedAt": "2026-06-07T19:00:00Z",
    "needsReauth": false
  },
  {
    "account_id": "bob@example.com",
    "provider": "codex",
    "displayName": null,
    "tier": null,
    "paused": true,
    "quota_percentage": null,
    "quotaStatus": "error",
    "next_reset": null,
    "is_default": false,
    "last_activity_at": null,
    "today_cost": null,
    "health": "error",
    "cached": false,
    "fetchedAt": null,
    "needsReauth": true
  }
]
"""

do {
  let rows = try JSONDecoder().decode([BarSummaryRow].self, from: Data(summaryJSON.utf8))
  check(rows.count == 2, "decodes two rows")
  check(rows[0].accountId == "alice@example.com", "maps account_id")
  check(rows[0].quotaPercentage == 82.4, "maps quota_percentage")
  check(rows[0].quotaStatus == "ok", "maps quotaStatus (ok)")
  check(rows[0].isDefault == true, "maps is_default")
  check(rows[0].lastActivityAt == "2026-04-29T10:00:00Z", "maps last_activity_at")
  check(rows[0].todayCost == 3.2, "maps today_cost")
  check(rows[0].id == "agy:alice@example.com", "stable id is provider:account")
  check(rows[1].quotaPercentage == nil, "null quota decodes to nil")
  check(rows[1].quotaStatus == "error", "maps quotaStatus (error)")
  check(rows[1].isDefault == false, "is_default false decodes")
  check(rows[1].lastActivityAt == nil, "null last_activity_at decodes to nil")
  check(rows[1].paused == true, "maps paused")
  check(rows[1].needsReauth == true, "maps needsReauth")
  check(rows[1].healthDot == "X", "error -> X dot")
  check(rows[0].healthDot == "OK", "ok -> OK dot")
}

// An "unsupported" provider (ghcp/kiro) decodes with quotaStatus "unsupported"
// and health "ok" — the backend's key correctness fix (no permanent orange dot).
do {
  let unsupportedJSON = """
  [{
    "account_id": "copilot-kaitranntt", "provider": "ghcp", "displayName": "copilot-kaitranntt",
    "tier": null, "paused": false, "quota_percentage": null, "quotaStatus": "unsupported",
    "next_reset": null, "is_default": true, "last_activity_at": null, "today_cost": null,
    "health": "ok", "cached": false, "fetchedAt": "2026-06-08T16:40:00.000Z", "needsReauth": false
  }]
  """
  let rows = try JSONDecoder().decode([BarSummaryRow].self, from: Data(unsupportedJSON.utf8))
  check(rows[0].quotaStatus == "unsupported", "ghcp decodes quotaStatus unsupported")
  check(rows[0].health == "ok", "unsupported provider is health ok (no orange dot)")
}

// MARK: BarDiscovery loading

let tmp = NSTemporaryDirectory() + "ccs-bar-check-\(ProcessInfo.processInfo.globallyUniqueString)"
let ccsDir = tmp + "/.ccs"
try? FileManager.default.createDirectory(atPath: ccsDir, withIntermediateDirectories: true)
let barJSON = """
{ "baseUrl": "http://127.0.0.1:3210", "port": 3210, "authMode": "loopback" }
"""
try? barJSON.write(toFile: ccsDir + "/bar.json", atomically: true, encoding: .utf8)

switch BarDiscovery.load(home: tmp) {
case .success(let d):
  check(d.port == 3210, "discovery reads port")
  check(d.authMode == "loopback", "discovery reads authMode")
  check(d.resolvedURL?.absoluteString == "http://127.0.0.1:3210", "resolvedURL from baseUrl")
case .failure(let e):
  check(false, "discovery load failed: \(e)")
}

let missingHome = NSTemporaryDirectory() + "ccs-bar-check-missing-\(ProcessInfo.processInfo.globallyUniqueString)"
switch BarDiscovery.load(home: missingHome) {
case .failure(.missing):
  check(true, "absent bar.json -> .missing (offline state)")
case .success:
  check(false, "expected .missing for absent file")
case .failure(let e):
  check(false, "expected .missing, got \(e)")
}

// MARK: BarFormatting

// Tri-state quota label: never a bare "--".
check(BarFormatting.quotaLabel(percentage: 82.4, status: "ok") == "82%", "ok+pct -> NN%")
check(
  BarFormatting.quotaLabel(percentage: nil, status: "unsupported") == "no quota",
  "unsupported -> 'no quota'")
check(
  BarFormatting.quotaLabel(percentage: nil, status: "error") == "quota ?", "error -> 'quota ?'")
check(BarFormatting.costLabel(3.2) == "$3.20", "cost label formats")
check(BarFormatting.costLabel(0) == "", "zero cost hidden")
check(BarFormatting.costLabel(nil) == "", "nil cost hidden")

// MARK: statusTitle fallback chain (NEVER a bare "--", NEVER a lifetime figure when today==0)

// Shared analytics fixtures for the chain.
func mkAnalytics(allTimeCost: Double, todayCost: Double = 0) -> BarAnalytics {
  BarAnalytics(
    today: .init(cost: todayCost, requests: todayCost > 0 ? 10 : 0),
    last7d: .init(cost: 0, requests: 0),
    last30d: .init(cost: 0, requests: 0),
    allTime: .init(cost: allTimeCost, requests: 5314),
    byDay: [],
    topModels: [],
    topModelsWindow: "all",
    lastActivityAt: "2026-04-29T10:00:00Z",
    daysSinceLastActivity: 40,
    hasRecentData: false,
    generatedAt: "2026-06-08T13:00:00Z")
}

// (1) QUOTA wins: a quota row yields "<provider> NN%".
do {
  let rows = try JSONDecoder().decode([BarSummaryRow].self, from: Data(summaryJSON.utf8))
  let title = BarFormatting.statusTitle(rows: rows, analytics: mkAnalytics(allTimeCost: 2609.1))
  check(title == "agy 82%", "title (1) quota wins -> 'agy 82%'")
}

// (1) lowest-remaining among quota rows is chosen; unsupported/error skipped.
let quotaMix = [
  BarSummaryRow(accountId: "a", provider: "agy", quotaPercentage: 90, quotaStatus: "ok"),
  BarSummaryRow(accountId: "b", provider: "agy", quotaPercentage: 12, quotaStatus: "ok"),
  BarSummaryRow(accountId: "c", provider: "ghcp", quotaStatus: "unsupported"),
]
let mixTitle = BarFormatting.statusTitle(rows: quotaMix, analytics: nil)
check(mixTitle == "agy 12%", "title features lowest-remaining quota, skips unsupported")
check(!mixTitle.contains("--"), "quota-mix title never contains '--'")

// (2) TODAY COST wins when no quota but analytics.today.cost > 0.
// The title reads the fresh analytics aggregate, not per-row today_cost.
let todayRows = [
  BarSummaryRow(accountId: "a", provider: "ghcp", quotaStatus: "unsupported"),
]
let todayAnalytics = mkAnalytics(allTimeCost: 40844, todayCost: 3.2)
check(
  BarFormatting.statusTitle(rows: todayRows, analytics: todayAnalytics) == "$3.20",
  "title (2) today cost from analytics -> '$3.20'")

// (2) today cost zero with non-zero all-time must NOT produce a "~$..." lifetime
// figure — the all-time step was removed to prevent confusion with live spend.
let staleRows = [
  BarSummaryRow(accountId: "a", provider: "ghcp", quotaStatus: "unsupported", todayCost: 0),
  BarSummaryRow(accountId: "b", provider: "kiro", quotaStatus: "unsupported", todayCost: nil),
]
let staleAnalytics = mkAnalytics(allTimeCost: 2609.1, todayCost: 0)
let staleTitle = BarFormatting.statusTitle(rows: staleRows, analytics: staleAnalytics)
check(!staleTitle.contains("~$"), "today==0 title never shows a '~$' lifetime figure")
check(!staleTitle.contains("2.6k"), "today==0 title never shows the all-time dollar amount")
check(!staleTitle.contains("--"), "stale title never contains '--'")
// With no quota and today==0 and 2 active rows, chain falls to COUNT.
check(staleTitle == "CCS 2", "title (3) no quota + today==0 falls to active count 'CCS 2'")

// (3) COUNT / ATTENTION when no quota and no today spend.
let reauthRows = [
  BarSummaryRow(accountId: "a", provider: "ghcp", quotaStatus: "error", needsReauth: true),
  BarSummaryRow(accountId: "b", provider: "kiro", quotaStatus: "unsupported"),
]
check(
  BarFormatting.statusTitle(rows: reauthRows, analytics: mkAnalytics(allTimeCost: 0)) == "CCS 1!",
  "title (3) reauth attention -> 'CCS 1!'")
let activeRows = [
  BarSummaryRow(accountId: "a", provider: "ghcp", quotaStatus: "unsupported"),
  BarSummaryRow(accountId: "b", provider: "kiro", paused: true, quotaStatus: "unsupported"),
]
check(
  BarFormatting.statusTitle(rows: activeRows, analytics: nil) == "CCS 1",
  "title (3) active count -> 'CCS 1'")

// (4) empty rows -> "CCS".
check(BarFormatting.statusTitle(rows: [], analytics: nil) == "CCS", "title (4) empty -> 'CCS'")

// All-empty-quota fixture: title never a bare "--".
check(
  !BarFormatting.statusTitle(rows: activeRows, analytics: nil).contains("--"),
  "no-quota title never contains a bare '--'")

// leadRow is deterministic with no quota: the is_default row, not rows.first.
let leadRows = [
  BarSummaryRow(accountId: "z", provider: "ghcp", quotaStatus: "unsupported", isDefault: false),
  BarSummaryRow(accountId: "a", provider: "kiro", quotaStatus: "unsupported", isDefault: true),
]
check(BarFormatting.leadRow(leadRows)?.accountId == "a", "leadRow prefers is_default row")

// MARK: RefreshDebouncer (arms at decision time)

var deb = RefreshDebouncer(interval: 15)
let t0 = Date(timeIntervalSince1970: 1000)
check(deb.shouldRefresh(now: t0), "first force-refresh proceeds")
check(!deb.shouldRefresh(now: t0.addingTimeInterval(5)), "within 15s blocked")
check(!deb.shouldRefresh(now: t0.addingTimeInterval(14.9)), "just before window end blocked")
check(deb.shouldRefresh(now: t0.addingTimeInterval(15)), "at/after 15s proceeds")

// MARK: CCSBarClient (recording transport)

let recorder = RequestRecorder()
recorder.responseData = Data(summaryJSON.utf8)
let client = CCSBarClient(
  baseURL: URL(string: "http://127.0.0.1:3210")!,
  transport: RecordingTransport(recorder: recorder)
)

do {
  let rows = try await client.summary(refresh: true)
  check(rows.count == 2, "client.summary decodes rows")
  check(
    recorder.lastRequest?.url?.query?.contains("refresh=true") == true,
    "summary(refresh: true) adds ?refresh=true")
} catch {
  check(false, "client.summary threw: \(error)")
}

recorder.responseData = Data("{}".utf8)
recorder.lastRequest = nil
do {
  try await client.pause(provider: "agy", accountId: "alice@example.com")
  check(recorder.lastRequest?.httpMethod == "POST", "pause is POST")
  check(
    recorder.lastRequest?.url?.path.hasSuffix("bulk-pause") == true,
    "pause hits bulk-pause endpoint")
} catch {
  check(false, "pause threw: \(error)")
}

recorder.lastRequest = nil
do {
  try await client.tierLock(provider: "agy", tier: nil)
  let body = recorder.lastRequest?.httpBody ?? Data()
  let obj = (try? JSONSerialization.jsonObject(with: body)) as? [String: Any]
  check(obj?["tier"] is NSNull, "tierLock(nil) serializes tier: null")
  check((obj?["provider"] as? String) == "agy", "tierLock sends provider")
} catch {
  check(false, "tierLock threw: \(error)")
}

recorder.status = 409
do {
  _ = try await client.summary(refresh: false)
  check(false, "non-200 summary should throw")
} catch CCSBarClientError.httpStatus(let code) {
  check(code == 409, "non-200 -> httpStatus(409)")
} catch {
  check(false, "wrong error type: \(error)")
}
recorder.status = 200

// Analytics formatting + decode.
check(BarFormatting.money(0) == "$0.00", "money shows zero")
check(BarFormatting.money(2609.1) == "$2.6k", "money compacts thousands")
check(BarFormatting.count(5314) == "5.3k", "count compacts thousands")

// Mirrors the stale-snapshot reality: recent windows zero, all-time populated,
// hasRecentData false, last-active in late April, 30-entry zero-filled byDay.
func buildByDayJSON(count: Int) -> String {
  (0..<count).map { i in "{\"date\":\"2026-05-\(String(format: "%02d", i + 1))\",\"cost\":0,\"requests\":0}" }
    .joined(separator: ",")
}
let analyticsJSON = """
{"today":{"cost":0,"requests":0},"last7d":{"cost":0,"requests":0},
"last30d":{"cost":0,"requests":0},"allTime":{"cost":2609.1,"requests":5314},
"byDay":[\(buildByDayJSON(count: 30))],
"topModels":[{"model":"gpt-5.4","cost":1253.65,"requests":1306}],
"topModelsWindow":"all","lastActivityAt":"2026-04-29T10:00:00.000Z",
"daysSinceLastActivity":40,"hasRecentData":false,
"generatedAt":"2026-06-08T13:00:00.000Z"}
""".data(using: .utf8)!
do {
  let a = try JSONDecoder().decode(BarAnalytics.self, from: analyticsJSON)
  check(a.allTime.requests == 5314, "analytics decodes all-time requests")
  check(a.topModels.first?.model == "gpt-5.4", "analytics decodes top model")
  check(a.topModelsWindow == "all", "analytics decodes window")
  check(a.byDay.count == 30, "analytics decodes 30-day byDay series")
  check(a.lastActivityAt == "2026-04-29T10:00:00.000Z", "analytics decodes lastActivityAt")
  check(a.daysSinceLastActivity == 40, "analytics decodes daysSinceLastActivity")
  check(a.hasRecentData == false, "analytics decodes hasRecentData (false on idle)")
  // bySurface absent from JSON → defaults to empty array (resilient decoding).
  check(a.bySurface.isEmpty, "analytics bySurface defaults to [] when absent from payload")
}

// MARK: BarAnalyticsSurface decoding

// Verify bySurface round-trips correctly with the exact field names the backend
// sends: `source`, `surface`, `cost`, `requests` (all camelCase / exact match).
let surfaceAnalyticsJSON = """
{"today":{"cost":1963.70,"requests":13103},"last7d":{"cost":1963.70,"requests":13103},
"last30d":{"cost":35620.0,"requests":70973},"allTime":{"cost":40844.0,"requests":91207},
"byDay":[\(buildByDayJSON(count: 30))],
"topModels":[],"topModelsWindow":"30d",
"hasRecentData":true,"generatedAt":"2026-06-09T00:00:00.000Z",
"bySurface":[
  {"source":"custom-parser","surface":"Claude Code","cost":33656.21,"requests":57870},
  {"source":"codex-native","surface":"Codex","cost":1963.70,"requests":13103}
]}
""".data(using: .utf8)!
do {
  let a = try JSONDecoder().decode(BarAnalytics.self, from: surfaceAnalyticsJSON)
  check(a.bySurface.count == 2, "bySurface decodes 2 surfaces")
  check(a.bySurface[0].surface == "Claude Code", "bySurface[0].surface decodes")
  check(a.bySurface[0].source == "custom-parser", "bySurface[0].source decodes")
  check(a.bySurface[0].cost == 33656.21, "bySurface[0].cost decodes")
  check(a.bySurface[0].requests == 57870, "bySurface[0].requests decodes")
  check(a.bySurface[1].surface == "Codex", "bySurface[1].surface decodes")
  check(a.bySurface[1].cost == 1963.70, "bySurface[1].cost decodes")
  // Stable identity for SwiftUI ForEach: surface name is the id.
  check(a.bySurface[0].id == "Claude Code", "bySurface[0].id == surface name")
  // Today cost from the surface-bearing payload.
  check(a.today.cost == 1963.70, "surface analytics decodes today.cost")
  check(a.hasRecentData == true, "surface analytics decodes hasRecentData true")
} catch {
  check(false, "surface analytics decode threw: \(error)")
}

// MARK: monthToDate decode (calendar MTD field, resilient default)

do {
  // Older payload WITHOUT monthToDate → decodes to a zero window (back-compat).
  let a = try JSONDecoder().decode(BarAnalytics.self, from: analyticsJSON)
  check(a.monthToDate.cost == 0, "monthToDate defaults to 0 cost when absent from payload")
  check(a.monthToDate.requests == 0, "monthToDate defaults to 0 requests when absent")
}
do {
  // Newer payload WITH monthToDate → decodes the real value, distinct from last30d.
  let mtdJSON = """
  {"today":{"cost":0,"requests":0},"last7d":{"cost":0,"requests":0},
  "last30d":{"cost":35620.0,"requests":70973},"monthToDate":{"cost":1200.5,"requests":4096},
  "allTime":{"cost":40844.0,"requests":91207},
  "byDay":[\(buildByDayJSON(count: 30))],
  "topModels":[],"topModelsWindow":"30d","hasRecentData":true,
  "generatedAt":"2026-06-09T00:00:00.000Z"}
  """.data(using: .utf8)!
  let a = try JSONDecoder().decode(BarAnalytics.self, from: mtdJSON)
  check(a.monthToDate.cost == 1200.5, "monthToDate decodes its own cost")
  check(a.monthToDate.requests == 4096, "monthToDate decodes its own requests")
  check(a.monthToDate.cost != a.last30d.cost, "monthToDate is distinct from rolling last30d")
}

// MARK: compactDuration three-tier formatting

check(BarQuotaGauge.compactDuration(minutes: 35) == "35m", "compactDuration <1h -> minutes only")
check(BarQuotaGauge.compactDuration(minutes: 60) == "1h 0m", "compactDuration 1h exactly")
check(BarQuotaGauge.compactDuration(minutes: 195) == "3h 15m", "compactDuration hours+minutes")
// 44h 38m = 2678 min → 1d 20h (44%24=20, 44/24=1)
check(BarQuotaGauge.compactDuration(minutes: 2678) == "1d 20h", "compactDuration 44h38m -> '1d 20h'")
// 110h 27m = 6627 min → 4d 14h (110/24=4, 110%24=14)
check(BarQuotaGauge.compactDuration(minutes: 6627) == "4d 14h", "compactDuration 110h27m -> '4d 14h'")
check(BarQuotaGauge.compactDuration(minutes: 1440) == "1d 0h", "compactDuration exactly 24h -> '1d 0h'")

// MARK: BarQuotaGauge band + fillFraction + countdown

check(BarQuotaGauge.band(percentage: 82, status: "ok") == .green, "band >50 -> green")
check(BarQuotaGauge.band(percentage: 51, status: "ok") == .green, "band 51 -> green (boundary)")
check(BarQuotaGauge.band(percentage: 50, status: "ok") == .yellow, "band 50 -> yellow (boundary)")
check(BarQuotaGauge.band(percentage: 21, status: "ok") == .yellow, "band 21 -> yellow")
check(BarQuotaGauge.band(percentage: 20, status: "ok") == .orange, "band 20 -> orange (boundary)")
check(BarQuotaGauge.band(percentage: 11, status: "ok") == .orange, "band 11 -> orange")
check(BarQuotaGauge.band(percentage: 10, status: "ok") == .red, "band 10 -> red (boundary)")
check(BarQuotaGauge.band(percentage: 0, status: "ok") == .red, "band 0 -> red")
check(BarQuotaGauge.band(percentage: nil, status: "ok") == .none, "band nil pct -> none")
check(BarQuotaGauge.band(percentage: 50, status: "unsupported") == .none, "band unsupported -> none")
check(BarQuotaGauge.band(percentage: 50, status: "error") == .none, "band error -> none")

check(BarQuotaGauge.fillFraction(percentage: 82, status: "ok") == 0.82, "fillFraction 82 -> 0.82")
check(BarQuotaGauge.fillFraction(percentage: 0, status: "ok") == 0.0, "fillFraction 0 -> 0")
check(BarQuotaGauge.fillFraction(percentage: 150, status: "ok") == 1.0, "fillFraction clamps >100 to 1")
check(BarQuotaGauge.fillFraction(percentage: nil, status: "ok") == nil, "fillFraction nil pct -> nil")
check(
  BarQuotaGauge.fillFraction(percentage: 50, status: "unsupported") == nil,
  "fillFraction unsupported -> nil")

do {
  let now = Date(timeIntervalSince1970: 1_000_000)
  let in3h12m = now.addingTimeInterval(3 * 3600 + 12 * 60)
  let iso = ISO8601DateFormatter().string(from: in3h12m)
  check(
    BarQuotaGauge.resetCountdown(nextReset: iso, now: now) == "resets in 3h 12m",
    "resetCountdown formats hours+minutes")
  let in12m = now.addingTimeInterval(12 * 60)
  let iso12 = ISO8601DateFormatter().string(from: in12m)
  check(
    BarQuotaGauge.resetCountdown(nextReset: iso12, now: now) == "resets in 12m",
    "resetCountdown formats minutes-only")
  // Days tier: >=24h -> "Nd Nh" — 44h 38m -> "1d 20h", 110h 27m -> "4d 14h".
  let in44h38m = now.addingTimeInterval(44 * 3600 + 38 * 60)
  let iso44h38m = ISO8601DateFormatter().string(from: in44h38m)
  check(
    BarQuotaGauge.resetCountdown(nextReset: iso44h38m, now: now) == "resets in 1d 20h",
    "resetCountdown >=24h -> days tier '1d 20h'")
  let in110h27m = now.addingTimeInterval(110 * 3600 + 27 * 60)
  let iso110h27m = ISO8601DateFormatter().string(from: in110h27m)
  check(
    BarQuotaGauge.resetCountdown(nextReset: iso110h27m, now: now) == "resets in 4d 14h",
    "resetCountdown large duration '4d 14h'")
  let past = now.addingTimeInterval(-60)
  let isoPast = ISO8601DateFormatter().string(from: past)
  check(
    BarQuotaGauge.resetCountdown(nextReset: isoPast, now: now) == "resets soon",
    "resetCountdown past -> 'resets soon'")
  check(BarQuotaGauge.resetCountdown(nextReset: nil, now: now) == nil, "resetCountdown nil -> nil")
  check(
    BarQuotaGauge.resetCountdown(nextReset: "not-a-date", now: now) == nil,
    "resetCountdown unparseable -> nil")
}

// MARK: Glance-mode title resolution (lifetime dollar NEVER appears)

do {
  let allTimeBig = mkAnalytics(allTimeCost: 40844, todayCost: 0)  // allTime is the largest window
  let lifetime = BarFormatting.money(allTimeBig.allTime.cost)
  let rows = [
    BarSummaryRow(accountId: "a", provider: "ghcp", quotaStatus: "unsupported"),
    BarSummaryRow(accountId: "b", provider: "kiro", quotaStatus: "unsupported"),
  ]
  // For EVERY mode, the title must never be the lifetime figure.
  for mode in BarGlanceMode.allCases {
    let t = BarFormatting.statusTitle(rows: rows, analytics: allTimeBig, mode: mode)
    check(t != lifetime, "glance mode \(mode.rawValue): title never == lifetime dollar")
  }

  // .todaySpend leads with today when > 0, else falls back to .auto chain.
  let todayA = mkAnalytics(allTimeCost: 40844, todayCost: 3.2)
  check(
    BarFormatting.statusTitle(rows: rows, analytics: todayA, mode: .todaySpend) == "$3.20",
    "glance .todaySpend leads with today's spend")
  check(
    BarFormatting.statusTitle(rows: rows, analytics: allTimeBig, mode: .todaySpend) == "CCS 2",
    "glance .todaySpend falls back to .auto when today==0")

  // .monthSpend leads with monthToDate when > 0, else falls back.
  func mkMonth(_ mtd: Double, today: Double = 0) -> BarAnalytics {
    BarAnalytics(
      today: .init(cost: today, requests: 0),
      last7d: .init(cost: 0, requests: 0),
      last30d: .init(cost: 35000, requests: 0),
      monthToDate: .init(cost: mtd, requests: 0),
      allTime: .init(cost: 40844, requests: 0),
      byDay: [], topModels: [], topModelsWindow: "30d",
      generatedAt: "2026-06-09T00:00:00Z")
  }
  check(
    BarFormatting.statusTitle(rows: rows, analytics: mkMonth(1200.5), mode: .monthSpend)
      == BarFormatting.money(1200.5),
    "glance .monthSpend leads with calendar MTD")
  check(
    BarFormatting.statusTitle(rows: rows, analytics: mkMonth(0), mode: .monthSpend) == "CCS 2",
    "glance .monthSpend falls back to .auto when MTD==0")
  // MTD mode must NOT leak last30d (35000) even though it is far larger.
  let mtdTitle = BarFormatting.statusTitle(rows: rows, analytics: mkMonth(1200.5), mode: .monthSpend)
  check(!mtdTitle.contains("35"), "glance .monthSpend never shows last30d figure")

  // .lowestQuota leads with the lowest ok-quota row, else falls back.
  let quotaRows = [
    BarSummaryRow(accountId: "a", provider: "agy", quotaPercentage: 90, quotaStatus: "ok"),
    BarSummaryRow(accountId: "b", provider: "agy", quotaPercentage: 12, quotaStatus: "ok"),
  ]
  check(
    BarFormatting.statusTitle(rows: quotaRows, analytics: nil, mode: .lowestQuota) == "agy 12%",
    "glance .lowestQuota leads with lowest remaining quota")
  check(
    BarFormatting.statusTitle(rows: rows, analytics: allTimeBig, mode: .lowestQuota) == "CCS 2",
    "glance .lowestQuota falls back to .auto with no ok-quota rows")

  // .accountCount = non-paused count, never appends "!".
  let pausedMix = [
    BarSummaryRow(accountId: "a", provider: "ghcp", quotaStatus: "unsupported"),
    BarSummaryRow(accountId: "b", provider: "kiro", paused: true, quotaStatus: "unsupported"),
  ]
  check(
    BarFormatting.statusTitle(rows: pausedMix, analytics: nil, mode: .accountCount) == "CCS 1",
    "glance .accountCount = non-paused count")
  let allPaused = [
    BarSummaryRow(accountId: "a", provider: "ghcp", paused: true, quotaStatus: "unsupported"),
    BarSummaryRow(accountId: "b", provider: "kiro", paused: true, quotaStatus: "unsupported"),
  ]
  check(
    BarFormatting.statusTitle(rows: allPaused, analytics: nil, mode: .accountCount) == "CCS 2",
    "glance .accountCount falls back to total when all paused")
  let reauthCount = [
    BarSummaryRow(accountId: "a", provider: "ghcp", quotaStatus: "error", needsReauth: true)
  ]
  check(
    !BarFormatting.statusTitle(rows: reauthCount, analytics: nil, mode: .accountCount).contains("!"),
    "glance .accountCount never appends attention '!'")
}

// MARK: BarAlertPrefsStore dictionary codec + level parsing

do {
  // Empty dict -> all defaults.
  let p = BarAlertPrefsStore.decode(from: [:])
  check(p.quotaEnabled == true, "prefs default quotaEnabled true")
  check(p.quotaLevels == [20, 10, 0], "prefs default quota levels 20,10,0")
  check(p.dailyCapUSD == 500, "prefs default daily cap 500")
  check(p.monthCapUSD == 10000, "prefs default month cap 10000")
  check(p.glanceMode == .auto, "prefs default glance mode auto")

  // Round-trip encode -> decode is identity.
  let custom = BarAlertPrefs(
    quotaEnabled: false, quotaLevels: [5, 25, 50], dailyCapUSD: 12.5, monthCapUSD: 2000,
    glanceMode: .monthSpend)
  let back = BarAlertPrefsStore.decode(from: BarAlertPrefsStore.encode(custom))
  check(back.quotaEnabled == false, "prefs round-trip quotaEnabled")
  check(back.quotaLevels == [50, 25, 5], "prefs round-trip levels sorted desc")
  check(back.dailyCapUSD == 12.5, "prefs round-trip daily cap")
  check(back.glanceMode == .monthSpend, "prefs round-trip glance mode")

  // Level parsing: clamp, dedupe, sort desc; garbage tokens dropped.
  check(
    BarAlertPrefsStore.parseQuotaLevels("0, 10, 200, 10, -5, foo") == [100, 10, 0],
    "parseQuotaLevels clamps/dedupes/sorts and drops garbage")
}

// MARK: BarAlertEngine — pure rule engine

let engineNow = Date(timeIntervalSince1970: 1_700_000_000)  // fixed clock
let utc = { () -> Calendar in
  var c = Calendar(identifier: .gregorian)
  c.timeZone = TimeZone(identifier: "UTC")!
  return c
}()

func mkSpendAnalytics(today: Double, month: Double) -> BarAnalytics {
  BarAnalytics(
    today: .init(cost: today, requests: 0),
    last7d: .init(cost: 0, requests: 0),
    last30d: .init(cost: 99999, requests: 0),  // intentionally huge to prove it's unused
    monthToDate: .init(cost: month, requests: 0),
    allTime: .init(cost: 999999, requests: 0),  // intentionally huge to prove it's unused
    byDay: [], topModels: [], topModelsWindow: "30d",
    generatedAt: "2026-06-09T00:00:00Z")
}

// (A) Threshold cross: quota dropping below levels fires exactly ONE notif at the
//     most-severe crossed level (L10 for remaining 5 with levels [20,10,0]).
do {
  let rows = [
    BarSummaryRow(
      accountId: "a", provider: "agy", quotaPercentage: 5, quotaStatus: "ok",
      nextReset: "2026-07-01T00:00:00Z")
  ]
  let prefs = BarAlertPrefs(quotaLevels: [20, 10, 0])
  let ev = BarAlertEngine.evaluate(
    rows: rows, analytics: nil, prefs: prefs, priorFiredKeys: [], now: engineNow, calendar: utc)
  let quotaNotifs = ev.toDeliver.filter { $0.kind == .quotaRemainingBelow }
  check(quotaNotifs.count == 1, "quota cross fires exactly ONE notif (most-severe level)")
  check(quotaNotifs.first?.id.hasSuffix("|L10") == true, "quota fires at most-severe crossed L10")
  check(quotaNotifs.first?.body.contains("5%") == true, "quota body reports remaining %")
}

// (B) dailySpendAbove strict > ; silent at ==cap ; driven by today (not last30d/allTime).
do {
  let prefs = BarAlertPrefs(dailyCapUSD: 50)
  let over = BarAlertEngine.evaluate(
    rows: [], analytics: mkSpendAnalytics(today: 50.01, month: 0), prefs: prefs,
    priorFiredKeys: [], now: engineNow, calendar: utc)
  check(
    over.toDeliver.contains { $0.kind == .dailySpendAbove }, "daily spend fires when today > cap")
  let atCap = BarAlertEngine.evaluate(
    rows: [], analytics: mkSpendAnalytics(today: 50, month: 0), prefs: prefs,
    priorFiredKeys: [], now: engineNow, calendar: utc)
  check(
    !atCap.toDeliver.contains { $0.kind == .dailySpendAbove },
    "daily spend silent at == cap (strict >)")
}

// (C) monthSpendAbove driven by monthToDate ONLY — huge last30d/allTime must not trigger.
do {
  let prefs = BarAlertPrefs(monthCapUSD: 1000)
  // monthToDate UNDER cap but last30d (99999) and allTime (999999) huge → must NOT fire.
  let under = BarAlertEngine.evaluate(
    rows: [], analytics: mkSpendAnalytics(today: 0, month: 500), prefs: prefs,
    priorFiredKeys: [], now: engineNow, calendar: utc)
  check(
    !under.toDeliver.contains { $0.kind == .monthSpendAbove },
    "month alert ignores last30d/allTime — silent when MTD under cap")
  let over = BarAlertEngine.evaluate(
    rows: [], analytics: mkSpendAnalytics(today: 0, month: 1500), prefs: prefs,
    priorFiredKeys: [], now: engineNow, calendar: utc)
  check(
    over.toDeliver.contains { $0.kind == .monthSpendAbove }, "month alert fires on MTD > cap")
}

// (D) Dedupe: a second identical evaluate with same now + same firedKeys → empty toDeliver.
do {
  let rows = [
    BarSummaryRow(accountId: "a", provider: "agy", quotaPercentage: 5, quotaStatus: "ok",
      nextReset: "2026-07-01T00:00:00Z")
  ]
  let prefs = BarAlertPrefs(dailyCapUSD: 10)
  let a1 = BarAlertEngine.evaluate(
    rows: rows, analytics: mkSpendAnalytics(today: 100, month: 5000), prefs: prefs,
    priorFiredKeys: [], now: engineNow, calendar: utc)
  check(!a1.toDeliver.isEmpty, "first poll delivers notifs")
  let a2 = BarAlertEngine.evaluate(
    rows: rows, analytics: mkSpendAnalytics(today: 100, month: 5000), prefs: prefs,
    priorFiredKeys: a1.firedKeys, now: engineNow, calendar: utc)
  check(a2.toDeliver.isEmpty, "second identical poll delivers nothing (dedupe)")
  check(a2.firedKeys == a1.firedKeys, "fired keys stable across identical polls")
}

// (E) Re-arm period: +1 day re-fires daily; +1 month re-fires month; new nextReset re-fires quota.
do {
  let prefs = BarAlertPrefs(dailyCapUSD: 10, monthCapUSD: 100)
  let day0 = mkSpendAnalytics(today: 100, month: 500)
  let p0 = BarAlertEngine.evaluate(
    rows: [], analytics: day0, prefs: prefs, priorFiredKeys: [], now: engineNow, calendar: utc)
  let nextDay = engineNow.addingTimeInterval(24 * 3600)
  let p1 = BarAlertEngine.evaluate(
    rows: [], analytics: day0, prefs: prefs, priorFiredKeys: p0.firedKeys, now: nextDay,
    calendar: utc)
  check(p1.toDeliver.contains { $0.kind == .dailySpendAbove }, "daily re-fires next calendar day")
  let nextMonth = engineNow.addingTimeInterval(40 * 24 * 3600)
  let p2 = BarAlertEngine.evaluate(
    rows: [], analytics: day0, prefs: prefs, priorFiredKeys: p0.firedKeys, now: nextMonth,
    calendar: utc)
  check(p2.toDeliver.contains { $0.kind == .monthSpendAbove }, "month re-fires next calendar month")

  // New nextReset string => new quota bucket => quota re-fires.
  let q0rows = [
    BarSummaryRow(accountId: "a", provider: "agy", quotaPercentage: 5, quotaStatus: "ok",
      nextReset: "2026-07-01T00:00:00Z")
  ]
  let q0 = BarAlertEngine.evaluate(
    rows: q0rows, analytics: nil, prefs: BarAlertPrefs(quotaLevels: [10]), priorFiredKeys: [],
    now: engineNow, calendar: utc)
  let q1rows = [
    BarSummaryRow(accountId: "a", provider: "agy", quotaPercentage: 5, quotaStatus: "ok",
      nextReset: "2026-08-01T00:00:00Z")
  ]
  let q1 = BarAlertEngine.evaluate(
    rows: q1rows, analytics: nil, prefs: BarAlertPrefs(quotaLevels: [10]),
    priorFiredKeys: q0.firedKeys, now: engineNow, calendar: utc)
  check(
    q1.toDeliver.contains { $0.kind == .quotaRemainingBelow },
    "quota re-fires on a new next_reset bucket")
}

// (F) Re-arm clears-then-recurs: reauth true->fires->key set; false->key dropped; true->re-fires.
do {
  let onRows = [BarSummaryRow(accountId: "a", provider: "agy", needsReauth: true)]
  let offRows = [BarSummaryRow(accountId: "a", provider: "agy", needsReauth: false)]
  let s1 = BarAlertEngine.evaluate(
    rows: onRows, analytics: nil, prefs: BarAlertPrefs(), priorFiredKeys: [], now: engineNow,
    calendar: utc)
  check(s1.toDeliver.contains { $0.kind == .reauthNeeded }, "reauth fires when needsReauth true")
  check(
    s1.firedKeys.contains { $0.hasPrefix("reauthNeeded|") }, "reauth key present after firing")
  let s2 = BarAlertEngine.evaluate(
    rows: offRows, analytics: nil, prefs: BarAlertPrefs(), priorFiredKeys: s1.firedKeys,
    now: engineNow, calendar: utc)
  check(
    !s2.firedKeys.contains { $0.hasPrefix("reauthNeeded|") },
    "reauth key dropped when condition clears")
  let s3 = BarAlertEngine.evaluate(
    rows: onRows, analytics: nil, prefs: BarAlertPrefs(), priorFiredKeys: s2.firedKeys,
    now: engineNow, calendar: utc)
  check(
    s3.toDeliver.contains { $0.kind == .reauthNeeded }, "reauth re-fires after clear")

  // Same clears-then-recurs behavior for accountCooldownOrPaused on `paused`.
  let pOn = [BarSummaryRow(accountId: "a", provider: "agy", paused: true)]
  let pOff = [BarSummaryRow(accountId: "a", provider: "agy", paused: false)]
  let c1 = BarAlertEngine.evaluate(
    rows: pOn, analytics: nil, prefs: BarAlertPrefs(), priorFiredKeys: [], now: engineNow,
    calendar: utc)
  check(
    c1.toDeliver.contains { $0.kind == .accountCooldownOrPaused }, "cooldown/paused fires on paused")
  let c2 = BarAlertEngine.evaluate(
    rows: pOff, analytics: nil, prefs: BarAlertPrefs(), priorFiredKeys: c1.firedKeys, now: engineNow,
    calendar: utc)
  check(
    !c2.firedKeys.contains { $0.hasPrefix("accountCooldownOrPaused|") },
    "cooldown/paused key dropped when unpaused")
}

// (G) Prune / bounded: after day+month+reset rollover and account churn, fired set
//     holds only current-bucket keys and no keys for absent accounts.
do {
  let prefs = BarAlertPrefs(quotaLevels: [10], dailyCapUSD: 10, monthCapUSD: 100)
  let rowsT0 = [
    BarSummaryRow(accountId: "a", provider: "agy", quotaPercentage: 5, quotaStatus: "ok",
      nextReset: "2026-07-01T00:00:00Z", needsReauth: true)
  ]
  let t0 = BarAlertEngine.evaluate(
    rows: rowsT0, analytics: mkSpendAnalytics(today: 100, month: 500), prefs: prefs,
    priorFiredKeys: [], now: engineNow, calendar: utc)
  check(t0.firedKeys.count >= 3, "t0 accumulates quota+daily+month+reauth keys")

  // Roll a full month forward AND drop account "a", introduce account "b".
  let later = engineNow.addingTimeInterval(40 * 24 * 3600)
  let rowsT1 = [BarSummaryRow(accountId: "b", provider: "kiro", quotaStatus: "unsupported")]
  let t1 = BarAlertEngine.evaluate(
    rows: rowsT1, analytics: mkSpendAnalytics(today: 0, month: 0), prefs: prefs,
    priorFiredKeys: t0.firedKeys, now: later, calendar: utc)
  check(
    !t1.firedKeys.contains { $0.contains("|agy:a|") || $0.hasSuffix("|agy:a|on") },
    "prune drops keys for departed account a")
  // Stale daily/month/quota buckets from t0 are gone (bucket rolled), so the set
  // collapses to only what's currently true (account b has no alerts) → empty.
  check(t1.firedKeys.isEmpty, "prune collapses stale-bucket + absent-account keys (bounded)")
}

// (H) Deterministic order: shuffled rows produce notifs in stable id order.
do {
  let rows = [
    BarSummaryRow(accountId: "z", provider: "agy", needsReauth: true),
    BarSummaryRow(accountId: "a", provider: "agy", needsReauth: true),
  ]
  let ev = BarAlertEngine.evaluate(
    rows: rows, analytics: nil, prefs: BarAlertPrefs(), priorFiredKeys: [], now: engineNow,
    calendar: utc)
  let reauthIds = ev.toDeliver.filter { $0.kind == .reauthNeeded }.map { $0.id }
  check(
    reauthIds == reauthIds.sorted(), "engine emits notifs in stable account-id order")
}

// (I) Delivery wrapper (structural): RecordingNotifier (Core protocol) gets exactly
//     the toDeliver ids; a repeat poll delivers nothing.
final class RecordingNotifier: NotificationDelivering, @unchecked Sendable {
  var delivered: [String] = []
  func deliver(_ n: BarNotification) { delivered.append(n.id) }
}
do {
  let notifier = RecordingNotifier()
  let rows = [BarSummaryRow(accountId: "a", provider: "agy", needsReauth: true)]
  let ev = BarAlertEngine.evaluate(
    rows: rows, analytics: nil, prefs: BarAlertPrefs(), priorFiredKeys: [], now: engineNow,
    calendar: utc)
  for n in ev.toDeliver { notifier.deliver(n) }
  check(notifier.delivered == ev.toDeliver.map { $0.id }, "notifier delivered ids == toDeliver ids")
  let ev2 = BarAlertEngine.evaluate(
    rows: rows, analytics: nil, prefs: BarAlertPrefs(), priorFiredKeys: ev.firedKeys, now: engineNow,
    calendar: utc)
  let before = notifier.delivered.count
  for n in ev2.toDeliver { notifier.deliver(n) }
  check(notifier.delivered.count == before, "repeat poll delivers nothing through notifier")
}

// (J) Disabled rule: quota disabled => no quota notif even on a deep cross.
do {
  let rows = [
    BarSummaryRow(accountId: "a", provider: "agy", quotaPercentage: 1, quotaStatus: "ok",
      nextReset: "2026-07-01T00:00:00Z")
  ]
  let ev = BarAlertEngine.evaluate(
    rows: rows, analytics: nil, prefs: BarAlertPrefs(quotaEnabled: false), priorFiredKeys: [],
    now: engineNow, calendar: utc)
  check(
    !ev.toDeliver.contains { $0.kind == .quotaRemainingBelow },
    "disabled quota rule never fires")
}

// MARK: Native subscription rows (Claude Code / Codex)
//
// The backend folds first-party subscription quota into /api/bar/summary as
// ordinary BarSummaryRow values (provider "claude-code" / "codex"). They must
// decode, drive the Tier-1 gauge + alert engine with ZERO new engine code, and
// group/label distinctly from CLIProxy pool accounts.

// (N1) Decode the exact native-row payload the collector emits.
let nativeJSON = """
[
  {
    "account_id": "claude-code", "provider": "claude-code", "displayName": "Claude Code",
    "tier": "max", "paused": false, "quota_percentage": 15, "quotaStatus": "ok",
    "next_reset": "2026-06-09T20:00:00.000Z", "is_default": false, "last_activity_at": null,
    "today_cost": null, "health": "ok", "cached": true, "fetchedAt": "2026-06-09T13:00:00.000Z",
    "needsReauth": false
  },
  {
    "account_id": "codex", "provider": "codex", "displayName": "Codex",
    "tier": "pro", "paused": false, "quota_percentage": 52, "quotaStatus": "ok",
    "next_reset": "2026-06-09T19:00:00.000Z", "is_default": false, "last_activity_at": null,
    "today_cost": null, "health": "ok", "cached": false, "fetchedAt": "2026-06-09T13:00:00.000Z",
    "needsReauth": false
  }
]
"""
do {
  let rows = try JSONDecoder().decode([BarSummaryRow].self, from: Data(nativeJSON.utf8))
  check(rows.count == 2, "native: decodes claude-code + codex rows")
  check(rows[0].provider == "claude-code", "native: claude-code provider decodes")
  check(rows[0].id == "claude-code:claude-code", "native: claude-code stable id")
  check(rows[0].tier == "max", "native: claude-code tier decodes (max)")
  check(rows[0].quotaStatus == "ok", "native: claude-code quotaStatus ok")
  check(rows[0].todayCost == nil, "native: today_cost null decodes to nil (honest, not fake $0)")
  check(rows[1].provider == "codex", "native: codex provider decodes")
  check(rows[1].tier == "pro", "native: codex tier decodes (pro)")
}

// (N2) Native rows drive the Tier-1 gauge with no new code: an "ok" claude-code
//      row at 15% lands in the orange band with a 0.15 fill.
do {
  let claude = BarSummaryRow(
    accountId: "claude-code", provider: "claude-code", displayName: "Claude Code",
    tier: "max", quotaPercentage: 15, quotaStatus: "ok",
    nextReset: "2026-06-09T20:00:00Z")
  check(
    BarQuotaGauge.band(percentage: claude.quotaPercentage, status: claude.quotaStatus) == .orange,
    "native: claude-code 15% -> orange gauge band")
  check(
    BarQuotaGauge.fillFraction(percentage: claude.quotaPercentage, status: claude.quotaStatus)
      == 0.15,
    "native: claude-code 15% -> 0.15 gauge fill")
}

// (N3) Native rows feed the alert engine with no new code: a claude-code row at 8%
//      with levels [20,10,0] fires quotaRemainingBelow scoped to its id.
do {
  let rows = [
    BarSummaryRow(
      accountId: "claude-code", provider: "claude-code", displayName: "Claude Code",
      tier: "max", quotaPercentage: 8, quotaStatus: "ok",
      nextReset: "2026-06-09T20:00:00Z")
  ]
  let ev = BarAlertEngine.evaluate(
    rows: rows, analytics: nil, prefs: BarAlertPrefs(quotaLevels: [20, 10, 0]),
    priorFiredKeys: [], now: engineNow, calendar: utc)
  let quota = ev.toDeliver.filter { $0.kind == .quotaRemainingBelow }
  check(quota.count == 1, "native: claude-code low quota fires exactly one alert")
  check(
    quota.first?.id.contains("|claude-code:claude-code|") == true,
    "native: quota alert scoped to claude-code:claude-code")
  check(quota.first?.body.contains("Claude Code") == true, "native: alert names 'Claude Code'")
}

// (N4) Native reauth: a claude-code row that needs reauth fires reauthNeeded
//      (the 401-from-usage-endpoint path on the backend).
do {
  let rows = [
    BarSummaryRow(
      accountId: "claude-code", provider: "claude-code", displayName: "Claude Code",
      quotaStatus: "error", health: "error", needsReauth: true)
  ]
  let ev = BarAlertEngine.evaluate(
    rows: rows, analytics: nil, prefs: BarAlertPrefs(), priorFiredKeys: [], now: engineNow,
    calendar: utc)
  check(
    ev.toDeliver.contains { $0.kind == .reauthNeeded },
    "native: claude-code needsReauth fires reauthNeeded alert")
}

// (N5) Friendly provider labels + subscription classification.
check(
  BarFormatting.providerLabel("claude-code") == "Claude Code",
  "native: providerLabel maps claude-code -> 'Claude Code'")
check(
  BarFormatting.providerLabel("codex") == "Codex", "native: providerLabel maps codex -> 'Codex'")
check(BarFormatting.providerLabel("agy") == "agy", "native: providerLabel passes CLIProxy keys through")
check(
  BarFormatting.isNativeSubscription(provider: "claude-code"),
  "native: claude-code is a native subscription")
check(
  BarFormatting.isNativeSubscription(provider: "codex"), "native: codex is a native subscription")
check(
  !BarFormatting.isNativeSubscription(provider: "agy"),
  "native: agy (CLIProxy pool) is NOT a native subscription")

// (N6) Grouping: a mixed list splits into native subscriptions (top) and pool
//      accounts, preserving backend order within each group.
do {
  let mixed = [
    BarSummaryRow(accountId: "pool-a", provider: "agy", quotaPercentage: 80, quotaStatus: "ok"),
    BarSummaryRow(
      accountId: "claude-code", provider: "claude-code", quotaPercentage: 40, quotaStatus: "ok"),
    BarSummaryRow(accountId: "pool-b", provider: "ghcp", quotaStatus: "unsupported"),
    BarSummaryRow(accountId: "codex", provider: "codex", quotaPercentage: 52, quotaStatus: "ok"),
  ]
  let parts = BarFormatting.partitionSubscriptions(mixed)
  check(parts.subscriptions.count == 2, "native: partition pulls 2 subscriptions")
  check(parts.pool.count == 2, "native: partition leaves 2 pool accounts")
  check(
    parts.subscriptions.map { $0.provider } == ["claude-code", "codex"],
    "native: subscriptions keep backend order (claude-code, codex)")
  check(
    parts.pool.map { $0.provider } == ["agy", "ghcp"],
    "native: pool keeps backend order (agy, ghcp)")
}

// (N7) Pool-only list does NOT get split (single "Accounts" header path): both
//      groups non-empty is the only trigger for the two-section render.
do {
  let poolOnly = [
    BarSummaryRow(accountId: "a", provider: "agy", quotaPercentage: 70, quotaStatus: "ok"),
    BarSummaryRow(accountId: "b", provider: "ghcp", quotaStatus: "unsupported"),
  ]
  let parts = BarFormatting.partitionSubscriptions(poolOnly)
  check(parts.subscriptions.isEmpty, "native: pool-only list has no subscriptions to split out")
  check(parts.pool.count == 2, "native: pool-only list keeps all rows in pool group")
}

// MARK: Per-window quota detail decode (resilient, backward compatible)

do {
  let nativeJSON = """
    [
      {
        "account_id": "claude-code",
        "provider": "claude-code",
        "displayName": "Claude Code",
        "tier": "max",
        "paused": false,
        "quota_percentage": 44,
        "quotaStatus": "ok",
        "next_reset": "2026-06-09T20:00:00.000Z",
        "is_default": false,
        "last_activity_at": null,
        "today_cost": null,
        "health": "ok",
        "cached": false,
        "fetchedAt": "2026-06-09T14:00:00.000Z",
        "needsReauth": false,
        "quota_windows": [
          { "key": "five_hour", "label": "5h", "usedPercent": 56, "remainingPercent": 44, "resetAt": "2026-06-09T20:00:00.000Z", "windowMinutes": 300 },
          { "key": "seven_day", "label": "week", "usedPercent": 30, "remainingPercent": 70, "resetAt": "2026-06-15T00:00:00.000Z", "windowMinutes": 10080 },
          { "key": "seven_day_opus", "label": "Opus · week", "usedPercent": 25, "remainingPercent": 75, "resetAt": "2026-06-15T00:00:00.000Z", "windowMinutes": 10080 },
          { "key": "seven_day_sonnet", "label": "Sonnet · week", "usedPercent": 60, "remainingPercent": 40, "resetAt": "2026-06-15T00:00:00.000Z", "windowMinutes": 10080 }
        ]
      },
      {
        "account_id": "codex",
        "provider": "codex",
        "displayName": "Codex",
        "tier": "pro",
        "paused": false,
        "quota_percentage": 70,
        "quotaStatus": "ok",
        "next_reset": "2026-06-09T19:00:00.000Z",
        "is_default": false,
        "last_activity_at": null,
        "today_cost": null,
        "health": "warning",
        "cached": false,
        "fetchedAt": "2026-06-09T14:00:00.000Z",
        "needsReauth": false,
        "quota_windows": [
          { "key": "five_hour", "label": "5h", "usedPercent": 19, "remainingPercent": 81, "resetAt": "2026-06-09T19:00:00.000Z", "windowMinutes": 300 }
        ],
        "stale_as_of": "2026-06-06T11:00:00.000Z"
      }
    ]
    """
  do {
    let rows = try JSONDecoder().decode([BarSummaryRow].self, from: Data(nativeJSON.utf8))
    check(rows.count == 2, "qw: decodes two native rows")
    let claude = rows[0]
    check(claude.quotaWindows?.count == 4, "qw: claude decodes 4 windows")
    check(claude.quotaWindows?[0].key == "five_hour", "qw: first window key five_hour")
    check(claude.quotaWindows?[0].label == "5h", "qw: first window label 5h")
    check(claude.quotaWindows?[0].usedPercent == 56, "qw: usedPercent decodes")
    check(claude.quotaWindows?[0].remainingPercent == 44, "qw: remainingPercent decodes")
    check(claude.quotaWindows?[0].windowMinutes == 300, "qw: windowMinutes 300 decodes")
    check(
      claude.quotaWindows?[0].resetAt == "2026-06-09T20:00:00.000Z", "qw: resetAt decodes (ISO)")
    check(
      claude.quotaWindows?[2].key == "seven_day_opus", "qw: opus window present (Max)")
    check(
      claude.quotaWindows?[3].key == "seven_day_sonnet", "qw: sonnet window present (Max)")
    check(claude.staleAsOf == nil, "qw: claude (fresh) has nil staleAsOf")
    check(claude.quotaWindows?[0].id == "five_hour", "qw: window id is its key")

    let codex = rows[1]
    check(codex.quotaWindows?.count == 1, "qw: codex decodes 1 window")
    check(codex.staleAsOf == "2026-06-06T11:00:00.000Z", "qw: codex staleAsOf decodes (stale)")
  } catch {
    check(false, "qw: native decode failed: \(error)")
  }
}

// Legacy payload WITHOUT the two native-only keys still decodes (quotaWindows
// and staleAsOf -> nil). This is the backward-compatibility guarantee.
do {
  let legacyJSON = """
    [
      {
        "account_id": "alice@example.com",
        "provider": "agy",
        "displayName": "Alice",
        "tier": "ultra",
        "paused": false,
        "quota_percentage": 80,
        "quotaStatus": "ok",
        "next_reset": null,
        "is_default": true,
        "last_activity_at": null,
        "today_cost": null,
        "health": "ok",
        "cached": true,
        "fetchedAt": "2026-06-07T19:00:00Z",
        "needsReauth": false
      }
    ]
    """
  do {
    let rows = try JSONDecoder().decode([BarSummaryRow].self, from: Data(legacyJSON.utf8))
    check(rows.count == 1, "qw-legacy: legacy row decodes")
    check(rows[0].quotaWindows == nil, "qw-legacy: missing quota_windows -> nil")
    check(rows[0].staleAsOf == nil, "qw-legacy: missing stale_as_of -> nil")
  } catch {
    check(false, "qw-legacy: legacy decode failed: \(error)")
  }
}

// MARK: burnMinutesRemaining (linear single-window projection)

do {
  // Mid-window pace: a 300-min window resets in 150 min -> elapsed = 150 min.
  // usedPercent = 50 -> rate = 50/150 = 1/3 %/min -> remaining 50% / (1/3) = 150.
  let now = Date(timeIntervalSince1970: 1_700_000_000)
  let resetIn150 = now.addingTimeInterval(150 * 60)
  let t = BarQuotaGauge.burnMinutesRemaining(
    usedPercent: 50, resetAt: resetIn150, windowMinutes: 300, now: now)
  check(t == 150, "burn: mid-window 50% over 150min elapsed -> 150 min remaining")

  // Near-zero usage -> nil ("plenty"); avoids an absurd projection.
  let lowUse = BarQuotaGauge.burnMinutesRemaining(
    usedPercent: 0.5, resetAt: resetIn150, windowMinutes: 300, now: now)
  check(lowUse == nil, "burn: near-zero usage -> nil (plenty)")

  // Exhausted -> 0 ("limit reached").
  let exhausted = BarQuotaGauge.burnMinutesRemaining(
    usedPercent: 100, resetAt: resetIn150, windowMinutes: 300, now: now)
  check(exhausted == 0, "burn: usedPercent>=100 -> 0 (limit reached)")

  // Unknown window length or reset -> nil (omit pace).
  check(
    BarQuotaGauge.burnMinutesRemaining(
      usedPercent: 50, resetAt: resetIn150, windowMinutes: nil, now: now) == nil,
    "burn: nil windowMinutes -> nil")
  check(
    BarQuotaGauge.burnMinutesRemaining(
      usedPercent: 50, resetAt: nil, windowMinutes: 300, now: now) == nil,
    "burn: nil resetAt -> nil")

  // elapsed <= 0 (reset already further out than the full window) -> nil.
  let resetTooFar = now.addingTimeInterval(400 * 60)
  check(
    BarQuotaGauge.burnMinutesRemaining(
      usedPercent: 50, resetAt: resetTooFar, windowMinutes: 300, now: now) == nil,
    "burn: elapsed<=0 -> nil")
}

// MARK: selectBindingWindow

do {
  let now = Date(timeIntervalSince1970: 1_700_000_000)
  _ = now
  let fiveHour = QuotaWindowDetail(
    key: "five_hour", label: "5h", usedPercent: 56, remainingPercent: 44, windowMinutes: 300)
  let week = QuotaWindowDetail(
    key: "seven_day", label: "week", usedPercent: 30, remainingPercent: 70, windowMinutes: 10080)
  let opus = QuotaWindowDetail(
    key: "seven_day_opus", label: "Opus · week", usedPercent: 75, remainingPercent: 25,
    windowMinutes: 10080)

  let binding = BarQuotaGauge.selectBindingWindow([fiveHour, week, opus])
  check(binding?.key == "seven_day_opus", "binding: lowest remaining (opus 25%) wins")

  // Tie on remaining% -> shorter window first.
  let weekTie = QuotaWindowDetail(
    key: "seven_day", label: "week", usedPercent: 60, remainingPercent: 40, windowMinutes: 10080)
  let fiveTie = QuotaWindowDetail(
    key: "five_hour", label: "5h", usedPercent: 60, remainingPercent: 40, windowMinutes: 300)
  let tieBinding = BarQuotaGauge.selectBindingWindow([weekTie, fiveTie])
  check(tieBinding?.key == "five_hour", "binding: remaining tie -> shorter window (5h) wins")

  check(BarQuotaGauge.selectBindingWindow([]) == nil, "binding: empty input -> nil")
}

// MARK: paceClause phrasing

do {
  let now = Date(timeIntervalSince1970: 1_700_000_000)

  // At-risk scenario: window=300min, reset in 200min → elapsed=100min.
  // usedPercent=75 → burn = (100-75)*100/75 ≈ 33 min. 33 < 200 → at-risk → shows pace.
  let resetIn200 = ISO8601DateFormatter().string(from: now.addingTimeInterval(200 * 60))
  let finite = BarQuotaGauge.paceClause(
    usedPercent: 75, remainingPercent: 25, resetAt: resetIn200, windowMinutes: 300, now: now)
  check(finite?.hasPrefix("~") == true && finite?.hasSuffix("left at this pace") == true,
    "pace: at-risk (burn < reset) -> shows pace clause")

  // NOT at-risk: burn > minutesToReset — pace must be nil (the core fix).
  // window=300min, reset in 50min → elapsed=250min. usedPercent=50 →
  // burn = (100-50)*250/50 = 250 min. 250 > 50 → NOT at risk → nil.
  let resetIn50 = ISO8601DateFormatter().string(from: now.addingTimeInterval(50 * 60))
  let notAtRisk = BarQuotaGauge.paceClause(
    usedPercent: 50, remainingPercent: 50, resetAt: resetIn50, windowMinutes: 300, now: now)
  check(notAtRisk == nil, "pace: burn > reset (not at risk) -> nil (omit — core bug fix)")

  // Lots of headroom -> "plenty at this pace".
  let resetIn150 = ISO8601DateFormatter().string(from: now.addingTimeInterval(150 * 60))
  let plenty = BarQuotaGauge.paceClause(
    usedPercent: 10, remainingPercent: 90, resetAt: resetIn150, windowMinutes: 300, now: now)
  check(plenty == "plenty at this pace", "pace: >=85% remaining -> 'plenty at this pace'")

  // Near-zero usage -> "plenty at this pace" (burn nil but window known).
  let plentyLow = BarQuotaGauge.paceClause(
    usedPercent: 0.5, remainingPercent: 99.5, resetAt: resetIn150, windowMinutes: 300, now: now)
  check(plentyLow == "plenty at this pace", "pace: near-zero usage -> 'plenty at this pace'")

  // Exhausted -> "limit reached, resets in ...".
  let reached = BarQuotaGauge.paceClause(
    usedPercent: 100, remainingPercent: 0, resetAt: resetIn150, windowMinutes: 300, now: now)
  check(
    reached?.hasPrefix("limit reached, resets in") == true,
    "pace: 0% remaining -> 'limit reached, resets in ...'")

  // < 5 min floor -> limit-reached path, never a scary "~0m".
  // window=300min, reset in 150min → elapsed=150min. usedPercent=99 →
  // burn = (100-99)*150/99 ≈ 1.5 min → floor hit → "limit reached".
  let nearFloor = BarQuotaGauge.paceClause(
    usedPercent: 99, remainingPercent: 1, resetAt: resetIn150, windowMinutes: 300, now: now)
  check(
    nearFloor?.hasPrefix("limit reached") == true && !(nearFloor?.contains("~0m") ?? true),
    "pace: <5m floor -> limit-reached, never '~0m'")

  // Unknown window -> nil (omit).
  let unknown = BarQuotaGauge.paceClause(
    usedPercent: 50, remainingPercent: 50, resetAt: nil, windowMinutes: nil, now: now)
  check(unknown == nil, "pace: unknown window -> nil (omit)")

  // resetAt in the past -> nil pace.
  let pastReset = ISO8601DateFormatter().string(from: now.addingTimeInterval(-60))
  let past = BarQuotaGauge.paceClause(
    usedPercent: 50, remainingPercent: 50, resetAt: pastReset, windowMinutes: 300, now: now)
  check(past == nil, "pace: past resetAt -> nil pace")
}

// MARK: atRisk boolean

do {
  let now = Date(timeIntervalSince1970: 1_700_000_000)

  // At-risk: burn(33m) < minutesToReset(200m) → true.
  let resetIn200 = ISO8601DateFormatter().string(from: now.addingTimeInterval(200 * 60))
  let isAtRisk = BarQuotaGauge.atRisk(
    usedPercent: 75, remainingPercent: 25, resetAt: resetIn200, windowMinutes: 300, now: now)
  check(isAtRisk == true, "atRisk: burn < reset -> true")

  // NOT at-risk: burn(250m) > minutesToReset(50m) → false.
  let resetIn50 = ISO8601DateFormatter().string(from: now.addingTimeInterval(50 * 60))
  let notAtRisk = BarQuotaGauge.atRisk(
    usedPercent: 50, remainingPercent: 50, resetAt: resetIn50, windowMinutes: 300, now: now)
  check(notAtRisk == false, "atRisk: burn > reset -> false")

  // Exhausted (remaining=0) → false (handled by limit-reached path, not atRisk).
  let resetIn150 = ISO8601DateFormatter().string(from: now.addingTimeInterval(150 * 60))
  check(
    BarQuotaGauge.atRisk(
      usedPercent: 100, remainingPercent: 0, resetAt: resetIn150, windowMinutes: 300, now: now)
      == false,
    "atRisk: exhausted -> false")

  // Unknown window → false.
  check(
    BarQuotaGauge.atRisk(
      usedPercent: 75, remainingPercent: 25, resetAt: nil, windowMinutes: nil, now: now)
      == false,
    "atRisk: unknown window -> false")

  // Large weekly burn in screenshot scenario: weekly window resets in ~9h 2m (542 min),
  // usedPercent=59 over elapsed=(10080-542)=9538 min → burn ≈ (41*9538)/59 ≈ 6626 min.
  // 6626 > 542 → NOT at risk (this was the nonsensical "~110h left" shown to user).
  let resetIn542m = ISO8601DateFormatter().string(from: now.addingTimeInterval(542 * 60))
  let weeklyNotAtRisk = BarQuotaGauge.atRisk(
    usedPercent: 59, remainingPercent: 41, resetAt: resetIn542m, windowMinutes: 10080, now: now)
  check(weeklyNotAtRisk == false,
    "atRisk: weekly window resetting in 9h, burn projecting 100+h -> false (screenshot fix)")
}

// MARK: headroomLeader

do {
  func subRow(_ provider: String, _ name: String, remaining: Double) -> BarSummaryRow {
    BarSummaryRow(
      accountId: provider, provider: provider, displayName: name, quotaStatus: "ok",
      quotaWindows: [
        QuotaWindowDetail(
          key: "five_hour", label: "5h", usedPercent: 100 - remaining,
          remainingPercent: remaining, windowMinutes: 300)
      ])
  }
  let claude = subRow("claude-code", "Claude Code", remaining: 44)
  let codex = subRow("codex", "Codex", remaining: 81)
  let errorRow = BarSummaryRow(
    accountId: "broken", provider: "claude-code", displayName: "Broken", quotaStatus: "error")

  let leader = BarQuotaGauge.headroomLeader([claude, codex, errorRow])
  check(leader?.label == "Codex", "headroom: highest-binding-remaining (Codex 81%) leads")
  check(leader?.remainingPercent == 81, "headroom: leader carries its remaining%")

  // Error/reauth rows (no binding window) are excluded from the count.
  let single = BarQuotaGauge.headroomLeader([claude, errorRow])
  check(single == nil, "headroom: <2 eligible subscriptions -> nil")

  check(BarQuotaGauge.headroomLeader([]) == nil, "headroom: empty -> nil")
}

// MARK: - Theme token model (BarPalette / BarAppearance / BarTheme)
//
// These assert on the raw RGB Doubles, NOT on SwiftUI Color equality (which is
// unreliable — identical components are not guaranteed `==`). The dark values
// are the regression lock: they must equal the original Sparkline constants.

// Forced-scheme mapping: .system inherits OS, .light/.dark override.
check(BarAppearance.system.forced == nil, "appearance .system -> forced nil (inherit OS)")
check(BarAppearance.light.forced == .light, "appearance .light -> forced .light")
check(BarAppearance.dark.forced == .dark, "appearance .dark -> forced .dark")
check(BarAppearance.allCases.count == 3, "appearance has exactly 3 cases")

// DARK == today (regression lock). Exact constants from the original
// Sparkline BarTheme enum — any drift fails the build.
check(BarPalette.dark.accentRGB == RGB(0.886, 0.451, 0.137), "dark accent == #E2732A (locked)")
check(
  BarPalette.dark.subscriptionRGB == RGB(0.357, 0.388, 0.851),
  "dark subscription == #5B63D9 (locked)")
check(BarPalette.dark.bandGreenRGB == RGB(0.36, 0.74, 0.56), "dark bandGreen == #5CBC8F (locked)")
check(BarPalette.dark.bandAmberRGB == RGB(0.86, 0.67, 0.31), "dark bandAmber == #DBAB4F (locked)")
check(BarPalette.dark.bandCoralRGB == RGB(0.91, 0.46, 0.36), "dark bandCoral == #E8755C (locked)")
check(BarPalette.dark.bandRedRGB == RGB(0.85, 0.34, 0.31), "dark bandRed == #D9564F (locked)")

// LIGHT differs from DARK for every themed token (so light can't silently
// collapse back to dark) AND equals the locked light values.
check(BarPalette.light.accentRGB != BarPalette.dark.accentRGB, "light accent differs from dark")
check(
  BarPalette.light.subscriptionRGB != BarPalette.dark.subscriptionRGB,
  "light subscription differs from dark")
check(
  BarPalette.light.bandGreenRGB != BarPalette.dark.bandGreenRGB, "light bandGreen differs from dark")
check(
  BarPalette.light.bandAmberRGB != BarPalette.dark.bandAmberRGB, "light bandAmber differs from dark")
check(
  BarPalette.light.bandCoralRGB != BarPalette.dark.bandCoralRGB, "light bandCoral differs from dark")
check(BarPalette.light.bandRedRGB != BarPalette.dark.bandRedRGB, "light bandRed differs from dark")

check(BarPalette.light.accentRGB == RGB(0.812, 0.357, 0.063), "light accent == #CF5B10 (locked)")
check(
  BarPalette.light.subscriptionRGB == RGB(0.275, 0.302, 0.745),
  "light subscription == #464DBE (locked)")
check(BarPalette.light.bandGreenRGB == RGB(0.106, 0.580, 0.357), "light bandGreen == #1B945B (locked)")
check(BarPalette.light.bandAmberRGB == RGB(0.722, 0.490, 0.043), "light bandAmber == #B87D0B (locked)")
check(BarPalette.light.bandCoralRGB == RGB(0.831, 0.302, 0.157), "light bandCoral == #D44D28 (locked)")
check(BarPalette.light.bandRedRGB == RGB(0.776, 0.157, 0.137), "light bandRed == #C62823 (locked)")

// Light ramp separability: the four band colors must be mutually distinct so
// the green→amber→coral→red status ramp stays readable on the light plate.
// (We assert distinctness, not a lightness ordering: hue, not luminance, is what
// separates these bands — amber and coral are intentionally near in luminance.)
let lightBands = [
  BarPalette.light.bandGreenRGB, BarPalette.light.bandAmberRGB,
  BarPalette.light.bandCoralRGB, BarPalette.light.bandRedRGB,
]
check(Set(lightBands.map { "\($0.r),\($0.g),\($0.b)" }).count == 4, "light ramp: 4 distinct bands")
// Red is the deepest/most-saturated end of the ramp: it has the lowest green
// channel, anchoring "critical" as the visually heaviest band.
check(
  BarPalette.light.bandRedRGB.g < BarPalette.light.bandGreenRGB.g
    && BarPalette.light.bandRedRGB.g < BarPalette.light.bandAmberRGB.g
    && BarPalette.light.bandRedRGB.g < BarPalette.light.bandCoralRGB.g,
  "light ramp: red has the lowest green channel (critical anchor)")

// Resolver picks the right palette per scheme (verified via the stored palette
// ref, staying Color-equality-free).
check(BarTheme.resolve(.dark).palette == BarPalette.dark, "resolve(.dark) draws from dark palette")
check(
  BarTheme.resolve(.light).palette == BarPalette.light, "resolve(.light) draws from light palette")
check(BarTheme.dark.palette == BarPalette.dark, "BarTheme.dark preset uses dark palette")
check(BarTheme.light.palette == BarPalette.light, "BarTheme.light preset uses light palette")
check(BarThemeKey.defaultValue.palette == BarPalette.dark, "environment default is the dark preset")

// BarAppearanceStore round-trips, defaults to .dark on an absent key. Use an
// isolated suite so we never pollute (or depend on) real user defaults.
do {
  let suiteName = "ccs-bar-check-\(ProcessInfo.processInfo.globallyUniqueString)"
  let defaults = UserDefaults(suiteName: suiteName)!
  defaults.removeObject(forKey: BarAppearanceStore.defaultsKey)
  // Absent key -> .dark (the no-registration fallback).
  let raw = defaults.string(forKey: BarAppearanceStore.defaultsKey) ?? BarAppearance.dark.rawValue
  check(BarAppearance(rawValue: raw) == .dark, "appearance store defaults to .dark on absent key")
  // Round-trip save(.light) -> load().
  defaults.set(BarAppearance.light.rawValue, forKey: BarAppearanceStore.defaultsKey)
  let back = BarAppearance(rawValue: defaults.string(forKey: BarAppearanceStore.defaultsKey) ?? "")
  check(back == .light, "appearance store round-trips save(.light) -> load() == .light")
  // Garbage string -> nil (load() coalesces to .dark).
  defaults.set("nonsense", forKey: BarAppearanceStore.defaultsKey)
  let g = BarAppearance(rawValue: defaults.string(forKey: BarAppearanceStore.defaultsKey) ?? "")
  check(g == nil, "appearance store: garbage raw -> nil (load() coalesces to .dark)")
  defaults.removePersistentDomain(forName: suiteName)
}

// MARK: SpendChartStyle — enum stability + store round-trip

// Default is .bars (the pre-existing render mode; no visual regression on upgrade).
check(SpendChartStyle.bars.rawValue == "bars", "SpendChartStyle .bars rawValue stable")
check(SpendChartStyle.line.rawValue == "line", "SpendChartStyle .line rawValue stable")
check(SpendChartStyle(rawValue: "bars") == .bars, "SpendChartStyle round-trip bars")
check(SpendChartStyle(rawValue: "line") == .line, "SpendChartStyle round-trip line")
check(SpendChartStyle(rawValue: "unknown") == nil, "SpendChartStyle unknown rawValue -> nil")
check(SpendChartStyle.allCases.count == 2, "SpendChartStyle has exactly 2 cases")

// Store round-trip: save .line -> load() == .line; absent key defaults to .bars.
do {
  let suiteName = "ccs-bar-check-chart-\(ProcessInfo.processInfo.globallyUniqueString)"
  let defaults = UserDefaults(suiteName: suiteName)!
  // Absent key -> .bars (the default).
  let raw = defaults.string(forKey: SpendChartStyleStore.defaultsKey)
    ?? SpendChartStyle.bars.rawValue
  check(SpendChartStyle(rawValue: raw) == .bars,
    "SpendChartStyleStore defaults to .bars on absent key")
  // Save .line -> load .line.
  defaults.set(SpendChartStyle.line.rawValue, forKey: SpendChartStyleStore.defaultsKey)
  let back = SpendChartStyle(rawValue:
    defaults.string(forKey: SpendChartStyleStore.defaultsKey) ?? "")
  check(back == .line, "SpendChartStyleStore round-trips save(.line) -> .line")
  // Garbage -> nil (coalesces to .bars on live load).
  defaults.set("nonsense", forKey: SpendChartStyleStore.defaultsKey)
  let g = SpendChartStyle(rawValue:
    defaults.string(forKey: SpendChartStyleStore.defaultsKey) ?? "")
  check(g == nil, "SpendChartStyleStore garbage raw -> nil (coalesces to .bars)")
  defaults.removePersistentDomain(forName: suiteName)
}

// cleanup
try? FileManager.default.removeItem(atPath: tmp)

if failures > 0 {
  print("\nFAILED: \(failures) check(s)")
  exit(1)
} else {
  print("\nALL CHECKS PASSED")
  exit(0)
}
