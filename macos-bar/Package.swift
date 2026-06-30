// swift-tools-version:5.9
import PackageDescription

// CCS Bar - native macOS menu bar client for CCS.
//
// Build/test note: full Xcode (and therefore XCTest) is not required. The
// testable logic lives in the pure-Foundation `CCSBarCore` target and is
// exercised by the `ccs-bar-check` executable (an assert harness) so it runs
// on a CommandLineTools-only toolchain. The SwiftUI app target is added once
// the core is verified.
let package = Package(
  name: "CCSBar",
  platforms: [.macOS(.v14)],
  products: [
    .executable(name: "CCSBar", targets: ["CCSBarApp"]),
    .executable(name: "ccs-bar-check", targets: ["CCSBarCheck"]),
  ],
  targets: [
    .target(name: "CCSBarCore"),
    .executableTarget(name: "CCSBarApp", dependencies: ["CCSBarCore"]),
    .executableTarget(name: "CCSBarCheck", dependencies: ["CCSBarCore"]),
  ]
)
