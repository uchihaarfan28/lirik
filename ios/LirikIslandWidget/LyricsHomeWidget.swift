import LyricsShared
import SwiftUI
import WidgetKit

struct LyricsHomeEntry: TimelineEntry {
    let date: Date
    let snapshot: NowPlayingSnapshot
    let prefs: DisplayPreferences
}

struct LyricsHomeProvider: TimelineProvider {
    func placeholder(in context: Context) -> LyricsHomeEntry {
        LyricsHomeEntry(
            date: .now,
            snapshot: NowPlayingSnapshot(
                title: "Lagu Demo",
                artist: "Pulau Kecil",
                line: "Lampu kota berbaris di kaca depan",
                nextLine: "Jalan tol sepi, radio pelan",
                isPlaying: true,
                hasLyrics: true,
                trackId: "",
                durationMs: 180_000,
                playbackStartSec: 0,
                updatedAt: Date().timeIntervalSince1970
            ),
            prefs: .default
        )
    }

    func getSnapshot(in context: Context, completion: @escaping (LyricsHomeEntry) -> Void) {
        completion(currentEntry())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<LyricsHomeEntry>) -> Void) {
        let entry = currentEntry()
        // Widget tidak real-time; Live Activity yang berganti tiap baris.
        // Reload dipicu app lewat WidgetCenter saat snapshot berubah.
        let next = Calendar.current.date(byAdding: .minute, value: 15, to: .now) ?? .now.addingTimeInterval(900)
        completion(Timeline(entries: [entry], policy: .after(next)))
    }

    private func currentEntry() -> LyricsHomeEntry {
        LyricsHomeEntry(date: .now, snapshot: .load(), prefs: .load())
    }
}

struct LyricsHomeWidget: Widget {
    let kind = LyricsHomeWidgetKind.id

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: LyricsHomeProvider()) { entry in
            LyricsHomeWidgetView(entry: entry)
                .containerBackground(for: .widget) {
                    Color.black
                }
                .widgetURL(AppDeepLink.lyricsURL)
        }
        .configurationDisplayName("Lirik")
        .description("Baris lirik + cover. Ketuk untuk layar penuh.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

struct LyricsHomeWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: LyricsHomeEntry

    var body: some View {
        let snap = entry.snapshot
        let prefs = entry.prefs
        Group {
            switch family {
            case .systemSmall:
                smallView(snap: snap, prefs: prefs)
            case .systemLarge:
                largeView(snap: snap, prefs: prefs)
            default:
                mediumView(snap: snap, prefs: prefs)
            }
        }
        .foregroundStyle(.white)
    }

    @ViewBuilder
    private func smallView(snap: NowPlayingSnapshot, prefs: DisplayPreferences) -> some View {
        switch prefs.widgetStyle {
        case .cover:
            ZStack(alignment: .bottomLeading) {
                coverFill(trackId: snap.trackId)
                VStack(alignment: .leading, spacing: 2) {
                    Text(snap.line)
                        .font(.caption.bold())
                        .lineLimit(3)
                        .minimumScaleFactor(0.7)
                    if !snap.title.isEmpty {
                        Text(snap.title)
                            .font(.caption2)
                            .foregroundStyle(.white.opacity(0.7))
                            .lineLimit(1)
                    }
                }
                .padding(10)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
                .background(
                    LinearGradient(
                        colors: [.clear, .black.opacity(0.75)],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                )
            }
        case .minimal:
            VStack(alignment: .leading, spacing: 6) {
                Image(systemName: snap.isPlaying ? "music.note" : "pause.fill")
                    .foregroundStyle(Palette.accent)
                Text(snap.line)
                    .font(.caption.bold())
                    .lineLimit(4)
                    .minimumScaleFactor(0.7)
            }
            .padding(12)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        case .lyric:
            VStack(alignment: .leading, spacing: 4) {
                Text(snap.title.isEmpty ? LyricsActivityAttributes.appDisplayName : snap.title)
                    .font(.caption2)
                    .foregroundStyle(.white.opacity(0.6))
                    .lineLimit(1)
                Text(snap.line)
                    .font(.subheadline.bold())
                    .lineLimit(4)
                    .minimumScaleFactor(0.7)
            }
            .padding(12)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
    }

    @ViewBuilder
    private func mediumView(snap: NowPlayingSnapshot, prefs: DisplayPreferences) -> some View {
        HStack(alignment: .center, spacing: 12) {
            if prefs.widgetStyle != .minimal {
                ArtworkThumb(trackId: snap.trackId, size: 64, cornerRadius: 12)
            }
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 4) {
                    Image(systemName: snap.isPlaying ? "music.note" : "pause.fill")
                        .foregroundStyle(Palette.accent)
                        .font(.caption2)
                    Text(trackLabel(snap))
                        .font(.caption)
                        .foregroundStyle(.white.opacity(0.65))
                        .lineLimit(1)
                }
                Text(snap.line)
                    .font(.headline.bold())
                    .lineLimit(3)
                    .minimumScaleFactor(0.75)
                if prefs.showNextLine, !snap.nextLine.isEmpty {
                    Text(snap.nextLine)
                        .font(.caption)
                        .foregroundStyle(.white.opacity(0.55))
                        .lineLimit(1)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(14)
    }

    @ViewBuilder
    private func largeView(snap: NowPlayingSnapshot, prefs: DisplayPreferences) -> some View {
        ZStack(alignment: .bottom) {
            if prefs.widgetStyle == .cover {
                coverFill(trackId: snap.trackId)
                    .overlay(Color.black.opacity(0.45))
            }
            VStack(alignment: .leading, spacing: 10) {
                if prefs.widgetStyle != .cover {
                    HStack {
                        ArtworkThumb(trackId: snap.trackId, size: 72, cornerRadius: 14)
                        Spacer()
                        Image(systemName: snap.isPlaying ? "waveform" : "pause.fill")
                            .foregroundStyle(Palette.accent)
                            .font(.title3)
                    }
                }
                Text(trackLabel(snap))
                    .font(.subheadline)
                    .foregroundStyle(.white.opacity(0.7))
                    .lineLimit(1)
                Text(snap.line)
                    .font(.title2.bold())
                    .lineLimit(4)
                    .minimumScaleFactor(0.7)
                if prefs.showNextLine, !snap.nextLine.isEmpty {
                    Text(snap.nextLine)
                        .font(.body)
                        .foregroundStyle(.white.opacity(0.55))
                        .lineLimit(2)
                }
                Spacer(minLength: 0)
            }
            .padding(16)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
    }

    private func trackLabel(_ snap: NowPlayingSnapshot) -> String {
        if snap.title.isEmpty { return LyricsActivityAttributes.appDisplayName }
        return snap.artist.isEmpty ? snap.title : "\(snap.title) · \(snap.artist)"
    }

    @ViewBuilder
    private func coverFill(trackId: String) -> some View {
        if !trackId.isEmpty, let img = ArtworkStore.loadImage(for: trackId) {
            Image(uiImage: img)
                .resizable()
                .aspectRatio(contentMode: .fill)
        } else {
            LinearGradient(
                colors: [Palette.accent.opacity(0.35), Color.black],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        }
    }
}
