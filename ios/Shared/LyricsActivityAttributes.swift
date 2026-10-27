import ActivityKit
import Foundation

/// Dipakai bersama oleh app dan widget extension.
/// Nama struct HARUS sama dengan "attributes-type" yang dikirim server: "LyricsActivityAttributes".
public struct LyricsActivityAttributes: ActivityAttributes {
    /// Bagian yang berubah — dikirim server lewat push setiap baris lirik berganti.
    public struct ContentState: Codable, Hashable, Sendable {
        public var title: String
        public var artist: String
        public var line: String
        public var nextLine: String
        public var isPlaying: Bool
        public var hasLyrics: Bool
        public var trackId: String
        public var durationMs: Int
        public var playbackStartSec: Int

        public init(
            title: String,
            artist: String,
            line: String,
            nextLine: String,
            isPlaying: Bool,
            hasLyrics: Bool,
            trackId: String = "",
            durationMs: Int = 0,
            playbackStartSec: Int = 0
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
        }
    }

    /// Bagian statis — diisi sekali saat Live Activity dibuat.
    public var appName: String

    public init(appName: String) {
        self.appName = appName
    }
}

// Decoder toleran: kalau server lupa satu key, update tetap diterima (bukan dibuang diam-diam).
extension LyricsActivityAttributes.ContentState {
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        title = try c.decodeIfPresent(String.self, forKey: .title) ?? ""
        artist = try c.decodeIfPresent(String.self, forKey: .artist) ?? ""
        line = try c.decodeIfPresent(String.self, forKey: .line) ?? ""
        nextLine = try c.decodeIfPresent(String.self, forKey: .nextLine) ?? ""
        isPlaying = try c.decodeIfPresent(Bool.self, forKey: .isPlaying) ?? false
        hasLyrics = try c.decodeIfPresent(Bool.self, forKey: .hasLyrics) ?? false
        trackId = try c.decodeIfPresent(String.self, forKey: .trackId) ?? ""
        durationMs = try c.decodeIfPresent(Int.self, forKey: .durationMs) ?? 0
        playbackStartSec = try c.decodeIfPresent(Int.self, forKey: .playbackStartSec) ?? 0
    }

    public static let waiting = Self(
        title: "", artist: "", line: "Putar lagu di Spotify", nextLine: "",
        isPlaying: false, hasLyrics: false,
        trackId: "", durationMs: 0, playbackStartSec: 0
    )
}

extension LyricsActivityAttributes {
    public static let appDisplayName = "Lirik Island"
}
