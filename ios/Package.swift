// swift-tools-version: 6.0
import PackageDescription
let package = Package(name: "CocoaLocal", platforms: [.iOS(.v17)],
    products: [.library(name: "CocoaLocal", targets: ["CocoaLocal"])],
    targets: [.target(name: "CocoaLocal", resources: [.copy("Connection.json")])],
    swiftLanguageModes: [.v5])

