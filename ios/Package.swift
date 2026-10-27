// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "LirikIsland",
    platforms: [.iOS("18.0")],
    products: [
        .library(name: "LirikIsland", targets: ["LirikIsland"]),
        .library(name: "LirikIslandWidget", targets: ["LirikIslandWidget"]),
    ],
    targets: [
        .target(
            name: "LyricsShared",
            path: "Shared"
        ),
        .target(
            name: "LirikIsland",
            dependencies: ["LyricsShared"],
            path: "LirikIsland"
        ),
        .target(
            name: "LirikIslandWidget",
            dependencies: ["LyricsShared"],
            path: "LirikIslandWidget",
            // Workaround xtool#379 / #320: tanpa -u _main, appex kehilangan __text
            // dan zsign gagal ("Can't find free space of LoadCommands").
            linkerSettings: [
                .unsafeFlags([
                    "-Xlinker", "-u", "-Xlinker", "_main",
                    "-Xlinker", "-headerpad", "-Xlinker", "0x10000",
                ]),
            ]
        ),
    ]
)
