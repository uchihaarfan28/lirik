import SwiftUI

struct OnboardingView: View {
    @EnvironmentObject private var manager: ActivityManager
    @Environment(\.openURL) private var openURL
    let onDone: () -> Void

    @State private var step = 0

    var body: some View {
        VStack(spacing: 24) {
            Spacer()
            Image(systemName: stepIcon)
                .font(.system(size: 56))
                .foregroundStyle(Color(red: 0.133, green: 0.773, blue: 0.369))

            Text(stepTitle)
                .font(.title2.bold())
                .multilineTextAlignment(.center)

            Text(stepBody)
                .font(.body)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)

            Spacer()

            Button(action: primaryAction) {
                Text(stepButton)
                    .font(.headline)
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .tint(Color(red: 0.133, green: 0.773, blue: 0.369))
            .padding(.horizontal, 24)

            if step < 2 {
                Button("Lewati") { advance() }
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            Spacer().frame(height: 24)
        }
        .background(Color(.systemBackground).ignoresSafeArea())
    }

    private var stepIcon: String {
        switch step {
        case 0: return "music.note.house.fill"
        case 1: return "platter.filled.top.and.arrow.up.iphone"
        default: return "paperplane.fill"
        }
    }

    private var stepTitle: String {
        switch step {
        case 0: return "Hubungkan Spotify"
        case 1: return "Izinkan Live Activities"
        default: return "Coba push"
        }
    }

    private var stepBody: String {
        switch step {
        case 0: return "Login sekali supaya server tahu lagu yang sedang diputar."
        case 1: return "Nyalakan Live Activities di Settings bila diminta, agar lirik muncul di Island."
        default: return "Setelah Live Activity jalan, kirim tes push untuk memastikan koneksi APNs."
        }
    }

    private var stepButton: String {
        switch step {
        case 0: return "Login Spotify"
        case 1: return "Lanjut"
        default: return "Selesai"
        }
    }

    private func primaryAction() {
        switch step {
        case 0:
            Task {
                if let url = await manager.spotifyLoginURL() {
                    openURL(url)
                }
                advance()
            }
        case 1:
            advance()
        default:
            Task {
                await manager.startActivity()
                await manager.testPush()
                onDone()
            }
        }
    }

    private func advance() {
        if step < 2 { step += 1 } else { onDone() }
    }
}
