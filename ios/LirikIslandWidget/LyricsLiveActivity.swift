import ActivityKit
import SwiftUI
import WidgetKit

/// Satu konfigurasi Live Activity → tampil di:
///  • Dynamic Island (compact / minimal / expanded)
///  • Lock Screen & StandBy (family .medium)
///  • CarPlay Dashboard & Apple Watch Smart Stack (family .small, iOS 26+)
struct LyricsLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: LyricsActivityAttributes.self) { context in
            LyricsActivityView(state: context.state, isStale: context.isStale)
                .activityBackgroundTint(Color.black.opacity(0.82))
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Image(systemName: "music.note")
                        .font(.title3)
                        .foregroundStyle(Palette.accent)
                        .padding(.leading, 6)
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
                        if !context.state.nextLine.isEmpty {
                            Text(context.state.nextLine)
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.bottom, 6)
                }
            } compactLeading: {
                Image(systemName: context.state.isPlaying ? "music.note" : "pause.fill")
                    .foregroundStyle(Palette.accent)
            } compactTrailing: {
                // Ruang compact sempit (kamera di tengah) → potongan baris; detail penuh di expanded/Lock Screen.
                Text(context.state.line)
                    .font(.caption2.weight(.semibold))
                    .lineLimit(1)
                    .frame(maxWidth: 80, alignment: .leading)
            } minimal: {
                Image(systemName: "music.note")
                    .foregroundStyle(Palette.accent)
            }
            .keylineTint(Palette.accent)
        }
        // .small dipakai CarPlay (iOS 26). Tanpa ini CarPlay memakai tampilan compact Dynamic Island.
        .supplementalActivityFamilies([.small])
    }
}

private func trackCaption(_ s: LyricsActivityAttributes.ContentState) -> String {
    if s.title.isEmpty { return LyricsActivityAttributes.appDisplayName }
    return s.artist.isEmpty ? s.title : "\(s.title) · \(s.artist)"
}

enum Palette {
    static let accent = Color(red: 0.12, green: 0.84, blue: 0.38) // hijau ala Spotify
    static let primary = Color.white
    static let secondary = Color.white.opacity(0.6)
}

/// Lock Screen (.medium) dan CarPlay / Apple Watch (.small).
struct LyricsActivityView: View {
    @Environment(\.activityFamily) private var family
    let state: LyricsActivityAttributes.ContentState
    let isStale: Bool

    var body: some View {
        Group {
            if family == .small {
                smallLayout
            } else {
                mediumLayout
            }
        }
        .opacity(isStale ? 0.55 : 1)
    }

    /// CarPlay: satu blok besar yang mudah dilirik — judul kecil, baris lirik tebal.
    private var smallLayout: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack(spacing: 4) {
                Image(systemName: "music.note").foregroundStyle(Palette.accent)
                Text(state.title.isEmpty ? LyricsActivityAttributes.appDisplayName : state.title)
                    .lineLimit(1)
            }
            .font(.caption2)
            .foregroundStyle(Palette.secondary)

            LyricLine(text: state.line, font: .headline, alignment: .leading)
                .foregroundStyle(Palette.primary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
    }

    /// Lock Screen: judul, baris aktif besar, baris berikutnya redup.
    private var mediumLayout: some View {
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
                if !state.nextLine.isEmpty {
                    Text(state.nextLine)
                        .font(.subheadline)
                        .foregroundStyle(Palette.secondary)
                        .lineLimit(1)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(14)
    }
}

/// Baris lirik dengan animasi geser halus saat berganti.
struct LyricLine: View {
    let text: String
    let font: Font
    let alignment: TextAlignment

    var body: some View {
        Text(text)
            .font(font.weight(.bold))
            .lineLimit(2)
            .minimumScaleFactor(0.7)
            .multilineTextAlignment(alignment)
            .id(text)
            .transition(.push(from: .bottom))
    }
}

struct PlayStateIcon: View {
    let isPlaying: Bool
    var body: some View {
        Image(systemName: isPlaying ? "waveform" : "pause.fill")
            .foregroundStyle(Palette.accent)
    }
}

// MARK: - Preview di Xcode

extension LyricsActivityAttributes {
    fileprivate static let preview = LyricsActivityAttributes(appName: appDisplayName)
}

extension LyricsActivityAttributes.ContentState {
    fileprivate static let previewLine1 = Self(
        title: "Lagu Demo", artist: "Lirik Island",
        line: "Lampu kota berbaris di kaca depan", nextLine: "Jalan tol sepi, radio pelan",
        isPlaying: true, hasLyrics: true
    )
    fileprivate static let previewLine2 = Self(
        title: "Lagu Demo", artist: "Lirik Island",
        line: "Jalan tol sepi, radio pelan", nextLine: "Lirik ini muncul tepat waktunya",
        isPlaying: true, hasLyrics: true
    )
}

#Preview("Lock Screen", as: .content, using: LyricsActivityAttributes.preview) {
    LyricsLiveActivity()
} contentStates: {
    LyricsActivityAttributes.ContentState.previewLine1
    LyricsActivityAttributes.ContentState.previewLine2
}

#Preview("Island expanded", as: .dynamicIsland(.expanded), using: LyricsActivityAttributes.preview) {
    LyricsLiveActivity()
} contentStates: {
    LyricsActivityAttributes.ContentState.previewLine1
}

#Preview("Island compact", as: .dynamicIsland(.compact), using: LyricsActivityAttributes.preview) {
    LyricsLiveActivity()
} contentStates: {
    LyricsActivityAttributes.ContentState.previewLine1
}
