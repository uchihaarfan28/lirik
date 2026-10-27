import SwiftUI

#if canImport(UIKit)
import UIKit
#endif

public enum Palette {
    public static let accent = Color(red: 0.133, green: 0.773, blue: 0.369) // #22C55E
    public static let primary = Color.white
    public static let secondary = Color.white.opacity(0.6)
}

public func trackCaption(_ s: LyricsActivityAttributes.ContentState) -> String {
    if s.title.isEmpty { return LyricsActivityAttributes.appDisplayName }
    return s.artist.isEmpty ? s.title : "\(s.title) · \(s.artist)"
}

public struct LyricLine: View {
    let text: String
    let font: Font
    let alignment: TextAlignment

    public init(text: String, font: Font, alignment: TextAlignment) {
        self.text = text
        self.font = font
        self.alignment = alignment
    }

    public var body: some View {
        Text(text)
            .font(font.weight(.bold))
            .lineLimit(2)
            .minimumScaleFactor(0.7)
            .multilineTextAlignment(alignment)
            .id(text)
            .transition(.push(from: .bottom))
    }
}

public struct ArtworkThumb: View {
    let trackId: String
    var size: CGFloat = 44
    var cornerRadius: CGFloat = 10

    public init(trackId: String, size: CGFloat = 44, cornerRadius: CGFloat = 10) {
        self.trackId = trackId
        self.size = size
        self.cornerRadius = cornerRadius
    }

    public var body: some View {
        Group {
#if canImport(UIKit)
            if let img = ArtworkStore.loadImage(for: trackId) {
                Image(uiImage: img)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
            } else {
                placeholder
            }
#else
            placeholder
#endif
        }
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
    }

    private var placeholder: some View {
        ZStack {
            RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                .fill(Palette.accent.opacity(0.18))
            Image(systemName: "music.note")
                .foregroundStyle(Palette.accent)
        }
    }
}

public struct TrackProgress: View {
    let isPlaying: Bool
    let playbackStartSec: Int
    let durationMs: Int

    public init(isPlaying: Bool, playbackStartSec: Int, durationMs: Int) {
        self.isPlaying = isPlaying
        self.playbackStartSec = playbackStartSec
        self.durationMs = durationMs
    }

    public var body: some View {
        Group {
            if durationMs > 0, playbackStartSec > 0 {
                if isPlaying {
                    let start = Date(timeIntervalSince1970: TimeInterval(playbackStartSec))
                    let end = start.addingTimeInterval(TimeInterval(durationMs) / 1000.0)
                    ProgressView(timerInterval: start ... end, countsDown: false)
                        .tint(Palette.accent)
                } else {
                    ProgressView(value: staticProgress)
                        .tint(Palette.accent)
                }
            }
        }
    }

    private var staticProgress: Double {
        let start = TimeInterval(playbackStartSec)
        let dur = TimeInterval(durationMs) / 1000.0
        guard dur > 0 else { return 0 }
        let elapsed = Date().timeIntervalSince1970 - start
        return min(1, max(0, elapsed / dur))
    }
}

public struct PlayStateIcon: View {
    let isPlaying: Bool

    public init(isPlaying: Bool) {
        self.isPlaying = isPlaying
    }

    public var body: some View {
        Image(systemName: isPlaying ? "waveform" : "pause.fill")
            .foregroundStyle(Palette.accent)
    }
}

// MARK: - Lock Screen styles (tanpa activityFamily)

public struct LockScreenClassicView: View {
    let state: LyricsActivityAttributes.ContentState
    let prefs: DisplayPreferences
    let isStale: Bool

    public init(state: LyricsActivityAttributes.ContentState, prefs: DisplayPreferences, isStale: Bool) {
        self.state = state
        self.prefs = prefs
        self.isStale = isStale
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .center, spacing: 12) {
                ZStack {
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .fill(Palette.accent.opacity(0.18))
                    Image(systemName: state.isPlaying ? "music.note" : "pause.fill")
                        .font(.title3)
                        .foregroundStyle(Palette.accent)
                }
                .frame(width: 44, height: 44)

                VStack(alignment: .leading, spacing: 3) {
                    Text(trackCaption(state))
                        .font(.caption)
                        .foregroundStyle(Palette.secondary)
                        .lineLimit(1)
                    LyricLine(text: state.line, font: .title3, alignment: .leading)
                        .foregroundStyle(Palette.primary)
                    if prefs.showNextLine, !state.nextLine.isEmpty {
                        Text(state.nextLine)
                            .font(.subheadline)
                            .foregroundStyle(Palette.secondary)
                            .lineLimit(1)
                    }
                    if !state.isPlaying {
                        Text("Dijeda")
                            .font(.caption2)
                            .foregroundStyle(Palette.secondary)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            if prefs.showProgress {
                TrackProgress(
                    isPlaying: state.isPlaying,
                    playbackStartSec: state.playbackStartSec,
                    durationMs: state.durationMs
                )
            }
        }
        .padding(14)
        .opacity(pauseOpacity)
    }

    private var pauseOpacity: Double {
        if isStale { return 0.55 }
        return state.isPlaying ? 1 : 0.55
    }
}

public struct LockScreenCoverView: View {
    let state: LyricsActivityAttributes.ContentState
    let prefs: DisplayPreferences
    let isStale: Bool

    public init(state: LyricsActivityAttributes.ContentState, prefs: DisplayPreferences, isStale: Bool) {
        self.state = state
        self.prefs = prefs
        self.isStale = isStale
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .center, spacing: 12) {
                ArtworkThumb(trackId: state.trackId, size: 52, cornerRadius: 10)
                VStack(alignment: .leading, spacing: 3) {
                    Text(trackCaption(state))
                        .font(.caption)
                        .foregroundStyle(Palette.secondary)
                        .lineLimit(1)
                    LyricLine(text: state.line, font: .title3, alignment: .leading)
                        .foregroundStyle(Palette.primary)
                    if prefs.showNextLine, !state.nextLine.isEmpty {
                        Text(state.nextLine)
                            .font(.subheadline)
                            .foregroundStyle(Palette.secondary)
                            .lineLimit(1)
                    }
                    if !state.isPlaying {
                        Text("Dijeda")
                            .font(.caption2)
                            .foregroundStyle(Palette.secondary)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            if prefs.showProgress {
                TrackProgress(
                    isPlaying: state.isPlaying,
                    playbackStartSec: state.playbackStartSec,
                    durationMs: state.durationMs
                )
            }
        }
        .padding(14)
        .opacity(state.isPlaying && !isStale ? 1 : 0.55)
    }
}

public struct LockScreenMinimalView: View {
    let state: LyricsActivityAttributes.ContentState
    let isStale: Bool

    public init(state: LyricsActivityAttributes.ContentState, isStale: Bool) {
        self.state = state
        self.isStale = isStale
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            LyricLine(text: state.line, font: .title2, alignment: .leading)
                .foregroundStyle(Palette.primary)
            if !state.isPlaying {
                Text("Dijeda")
                    .font(.caption2)
                    .foregroundStyle(Palette.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .opacity(state.isPlaying && !isStale ? 1 : 0.55)
    }
}

public struct CarPlaySmallView: View {
    let state: LyricsActivityAttributes.ContentState
    let isStale: Bool

    public init(state: LyricsActivityAttributes.ContentState, isStale: Bool) {
        self.state = state
        self.isStale = isStale
    }

    public var body: some View {
        HStack(alignment: .center, spacing: 8) {
            if !state.trackId.isEmpty {
                ArtworkThumb(trackId: state.trackId, size: 36, cornerRadius: 6)
            }
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 4) {
                    Image(systemName: state.isPlaying ? "music.note" : "pause.fill")
                        .foregroundStyle(Palette.accent)
                    Text(state.title.isEmpty ? LyricsActivityAttributes.appDisplayName : state.title)
                        .lineLimit(1)
                }
                .font(.caption2)
                .foregroundStyle(Palette.secondary)

                LyricLine(text: state.line, font: .headline, alignment: .leading)
                    .foregroundStyle(Palette.primary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .opacity(isStale ? 0.55 : 1)
    }
}
