import ActivityKit
import LyricsShared
import SwiftUI
import WidgetKit

/// Satu konfigurasi Live Activity → Island / Lock Screen / CarPlay.
/// Shared views TIDAK memakai @Environment(\.activityFamily) — widget yang memilih layout.
struct LyricsLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: LyricsActivityAttributes.self) { context in
            LockScreenRouter(state: context.state, isStale: context.isStale)
                .activityBackgroundTint(Color.black.opacity(0.82))
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            let prefs = DisplayPreferences.load()
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    if !context.state.trackId.isEmpty {
                        ArtworkThumb(trackId: context.state.trackId, size: 36, cornerRadius: 8)
                            .padding(.leading, 4)
                    } else {
                        Image(systemName: "music.note")
                            .font(.title3)
                            .foregroundStyle(Palette.accent)
                            .padding(.leading, 6)
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    PlayStateIcon(isPlaying: context.state.isPlaying)
                        .padding(.trailing, 6)
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(trackCaption(context.state))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(spacing: 4) {
                        LyricLine(text: context.state.line, font: .headline, alignment: .center)
                        if prefs.showNextLine, !context.state.nextLine.isEmpty {
                            Text(context.state.nextLine)
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                        if prefs.showProgress {
                            TrackProgress(
                                isPlaying: context.state.isPlaying,
                                playbackStartSec: context.state.playbackStartSec,
                                durationMs: context.state.durationMs
                            )
                            .padding(.horizontal, 8)
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.bottom, 6)
                }
            } compactLeading: {
                if !context.state.isPlaying {
                    Image(systemName: "pause.fill")
                        .foregroundStyle(Palette.accent)
                } else if prefs.islandCompact == .icon, !context.state.trackId.isEmpty {
                    ArtworkThumb(trackId: context.state.trackId, size: 20, cornerRadius: 4)
                } else {
                    Image(systemName: "music.note")
                        .foregroundStyle(Palette.accent)
                }
            } compactTrailing: {
                if !context.state.isPlaying {
                    EmptyView()
                } else if prefs.islandCompact == .lyric {
                    Text(context.state.line)
                        .font(.caption2.weight(.semibold))
                        .lineLimit(1)
                        .frame(maxWidth: 80, alignment: .leading)
                } else {
                    EmptyView()
                }
            } minimal: {
                Image(systemName: context.state.isPlaying ? "music.note" : "pause.fill")
                    .foregroundStyle(Palette.accent)
            }
            .keylineTint(Palette.accent)
        }
        .supplementalActivityFamilies([.small])
    }
}

/// Pilih layout Lock Screen / CarPlay berdasarkan activityFamily di target widget saja.
private struct LockScreenRouter: View {
    @Environment(\.activityFamily) private var family
    let state: LyricsActivityAttributes.ContentState
    let isStale: Bool

    var body: some View {
        let prefs = DisplayPreferences.load()
        Group {
            if family == .small {
                CarPlaySmallView(state: state, isStale: isStale)
            } else {
                switch prefs.lockScreenStyle {
                case .classic:
                    LockScreenClassicView(state: state, prefs: prefs, isStale: isStale)
                case .cover:
                    LockScreenCoverView(state: state, prefs: prefs, isStale: isStale)
                case .minimal:
                    LockScreenMinimalView(state: state, isStale: isStale)
                }
            }
        }
    }
}
