import Foundation

/// Injectable HTTP transport so the client is testable without a live server
/// (the assert harness supplies a recording/mock transport).
public protocol HTTPTransport: Sendable {
  func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse)
}

public struct URLSessionTransport: HTTPTransport {
  let session: URLSession
  public init(session: URLSession = .shared) { self.session = session }
  public func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
    let (data, response) = try await session.data(for: request)
    guard let http = response as? HTTPURLResponse else {
      throw CCSBarClientError.nonHTTPResponse
    }
    return (data, http)
  }
}

public enum CCSBarClientError: Error, Equatable {
  case nonHTTPResponse
  case httpStatus(Int)
  case badURL
  case decoding
}

/// Thin client over the CCS local web-server. The app NEVER talks to a
/// provider directly; every call goes to localhost and CCS performs any
/// provider fetch server-side.
public struct CCSBarClient {
  let baseURL: URL
  let transport: HTTPTransport

  public init(baseURL: URL, transport: HTTPTransport = URLSessionTransport()) {
    self.baseURL = baseURL
    self.transport = transport
  }

  /// GET /api/bar/summary[?refresh=true]. Cached by default; `refresh: true`
  /// asks CCS to pull live from providers server-side.
  public func summary(refresh: Bool = false) async throws -> [BarSummaryRow] {
    guard
      var comps = URLComponents(
        url: baseURL.appendingPathComponent("api/bar/summary"),
        resolvingAgainstBaseURL: false
      )
    else { throw CCSBarClientError.badURL }
    if refresh { comps.queryItems = [URLQueryItem(name: "refresh", value: "true")] }
    guard let url = comps.url else { throw CCSBarClientError.badURL }

    let (data, http) = try await transport.send(URLRequest(url: url))
    guard http.statusCode == 200 else { throw CCSBarClientError.httpStatus(http.statusCode) }
    do {
      return try JSONDecoder().decode([BarSummaryRow].self, from: data)
    } catch {
      throw CCSBarClientError.decoding
    }
  }

  /// GET /api/bar/analytics. Server-side rollup of the usage snapshot
  /// (today / 7d / 30d / all-time spend, sparkline, top models).
  public func analytics() async throws -> BarAnalytics {
    let url = baseURL.appendingPathComponent("api/bar/analytics")
    let (data, http) = try await transport.send(URLRequest(url: url))
    guard http.statusCode == 200 else { throw CCSBarClientError.httpStatus(http.statusCode) }
    do {
      return try JSONDecoder().decode(BarAnalytics.self, from: data)
    } catch {
      throw CCSBarClientError.decoding
    }
  }

  // MARK: Account control (reuses existing CCS endpoints)

  public func pause(provider: String, accountId: String) async throws {
    try await post("api/accounts/bulk-pause", body: ["provider": provider, "accountIds": [accountId]])
  }

  public func resume(provider: String, accountId: String) async throws {
    try await post("api/accounts/bulk-resume", body: ["provider": provider, "accountIds": [accountId]])
  }

  public func setDefault(name: String) async throws {
    try await post("api/accounts/default", body: ["name": name])
  }

  public func solo(provider: String, accountId: String) async throws {
    try await post("api/accounts/solo", body: ["provider": provider, "accountId": accountId])
  }

  /// Lock a provider's account selection to a tier, or pass `nil` to clear.
  public func tierLock(provider: String, tier: String?) async throws {
    try await post("api/accounts/tier-lock", body: ["provider": provider, "tier": tier ?? NSNull()])
  }

  @discardableResult
  func post(_ path: String, body: [String: Any]) async throws -> Data {
    var request = URLRequest(url: baseURL.appendingPathComponent(path))
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = try JSONSerialization.data(withJSONObject: body)
    let (data, http) = try await transport.send(request)
    guard (200..<300).contains(http.statusCode) else {
      throw CCSBarClientError.httpStatus(http.statusCode)
    }
    return data
  }
}
