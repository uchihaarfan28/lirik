import Foundation
import WidgetKit

/// Snapshot lagu/lirik di App Group — dibaca widget Home Screen / CarPlay.
public struct NowPlayingSnapshot: Codable, Equatable, Sendable {
    public var title: String
    public var artist: String
    public var line: String
    public var nextLine: String
    public var isPlaying: Bool
    public var hasLyrics: Bool
    public var trackId: String
    public var durationMs: Int
    public var playbackStartSec: Int
    public var updatedAt: TimeInterval

    public static let empty = NowPlayingSnapshot(
        title: "",
        artist: "",
        line: "Putar lagu di Spotify",
        nextLine: "",
        isPlaying: false,
        hasLyrics: false,
        trackId: "",
        durationMs: 0,
        playbackStartSec: 0,
        updatedAt: 0
    )

    public init(
        title: String,
        artist: String,
        line: String,
        nextLine: String,
        isPlaying: Bool,
        hasLyrics: Bool,
        trackId: String,
        durationMs: Int,
        playbackStartSec: Int,
        updatedAt: TimeInterval
    ) {
        self.title = title
        self.artist = artist
        self.line = line
        self.nextLine = nextLine
        self.isPlaying = isPlaying
        self.hasLyrics = hasLyrics
        self.trackId = trackId
        self.durationMs = durationMs
        self.playbackStartSec = playbackStartSec
        self.updatedAt = updatedAt
    }

    public static func from(state: LyricsActivityAttributes.ContentState, now: TimeInterval = Date().timeIntervalSince1970) -> NowPlayingSnapshot {
        NowPlayingSnapshot(
            title: state.title,
            artist: state.artist,
            line: state.line,
            nextLine: state.nextLine,
            isPlaying: state.isPlaying,
            hasLyrics: state.hasLyrics,
            trackId: state.trackId,
            durationMs: state.durationMs,
            playbackStartSec: state.playbackStartSec,
            updatedAt: now
        )
    }

    private static let storageKey = "nowPlaying.snapshot"

    public static func load(from defaults: UserDefaults? = AppGroup.defaults) -> NowPlayingSnapshot {
        guard let data = defaults?.data(forKey: storageKey),
              let snap = try? JSONDecoder().decode(NowPlayingSnapshot.self, from: data)
        else { return .empty }
        return snap
    }

    public func save(to defaults: UserDefaults? = AppGroup.defaults, reloadWidget: Bool = true) {
        guard let defaults, let data = try? JSONEncoder().encode(self) else { return }
        let previous = Self.load(from: defaults)
        defaults.set(data, forKey: Self.storageKey)
        guard reloadWidget else { return }
        let changed =
            previous.line != line
            || previous.trackId != trackId
            || previous.isPlaying != isPlaying
            || previous.title != title
        if changed {
            WidgetCenter.shared.reloadTimelines(ofKind: LyricsHomeWidgetKind.id)
        }
    }
}

/// Kind string bersama app + widget (hindari typo).
public enum LyricsHomeWidgetKind {
    public static let id = "LyricsHomeWidget"
}

/// Deep link ke layar penuh lirik.
public enum AppDeepLink {
    public static let scheme = "lirikisland"
    public static let lyricsHost = "lyrics"
    public static var lyricsURL: URL { URL(string: "\(scheme)://\(lyricsHost)")! }

    public static func isLyrics(_ url: URL) -> Bool {
        url.scheme == scheme && (url.host == lyricsHost || url.path == "/\(lyricsHost)")
    }
}
