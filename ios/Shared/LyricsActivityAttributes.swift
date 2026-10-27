import ActivityKit
import Foundation

/// Dipakai bersama oleh app dan widget extension (centang kedua target di File Inspector).
/// Nama struct HARUS sama dengan "attributes-type" yang dikirim server: "LyricsActivityAttributes".
struct LyricsActivityAttributes: ActivityAttributes {
    /// Bagian yang berubah — dikirim server lewat push setiap baris lirik berganti.
    /// Nama properti harus sama dengan key JSON "content-state" dari server.
    public struct ContentState: Codable, Hashable {
        var title: String
        var artist: String
        var line: String
        var nextLine: String
        var isPlaying: Bool
        var hasLyrics: Bool
    }

    /// Bagian statis — diisi sekali saat Live Activity dibuat.
    var appName: String
}

// Decoder toleran: kalau server lupa satu key, update tetap diterima (bukan dibuang diam-diam).
extension LyricsActivityAttributes.ContentState {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        title = try c.decodeIfPresent(String.self, forKey: .title) ?? ""
        artist = try c.decodeIfPresent(String.self, forKey: .artist) ?? ""
        line = try c.decodeIfPresent(String.self, forKey: .line) ?? ""
        nextLine = try c.decodeIfPresent(String.self, forKey: .nextLine) ?? ""
        isPlaying = try c.decodeIfPresent(Bool.self, forKey: .isPlaying) ?? false
        hasLyrics = try c.decodeIfPresent(Bool.self, forKey: .hasLyrics) ?? false
    }

    static let waiting = Self(
        title: "", artist: "", line: "Putar lagu di Spotify", nextLine: "",
        isPlaying: false, hasLyrics: false
    )
}

extension LyricsActivityAttributes {
    static let appDisplayName = "Lirik Island"
}
