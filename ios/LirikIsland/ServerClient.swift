import Foundation

/// Respons GET /api/status dari server.
/// Respons GET /api/lyrics — daftar baris + index aktif.
struct LyricsPayload: Decodable, Equatable {
    struct Line: Decodable, Equatable {
        let t: Int
        let text: String
    }

    let status: String
    let trackId: String
    let title: String
    let artist: String
    let index: Int
    let lines: [Line]
}

/// Respons GET /api/me.
struct MePayload: Decodable, Equatable {
    let userId: String
    let name: String
    let spotifyConnected: Bool
    let deviceCount: Int
}

struct ServerStatus: Decodable {
    struct NowPlaying: Decodable {
        let title: String
        let artist: String
        let isPlaying: Bool
        let positionMs: Int?
        let durationMs: Int?
        let trackId: String?
        let album: String?
        let artworkURL: String?
    }

    struct LastPush: Decodable {
        let event: String
        let ok: Bool
        let status: Int
        let reason: String?
    }

    struct Preferences: Decodable, Equatable {
        var hideAfterPauseSec: Int
        var autoStart: Bool
        var pauseMode: String
    }

    let spotifyConnected: Bool
    let pushToStartRegistered: Bool
    let activityRegistered: Bool
    let deviceCount: Int?
    let nowPlaying: NowPlaying?
    let lyrics: String
    let line: String
    let nextLine: String
    let lastPush: LastPush?
    let lastError: String?
    let preferences: Preferences?
}

struct ServerClient {
    let baseURL: URL
    let apiKey: String

    enum ClientError: LocalizedError {
        case http(Int, String)
        case notConfigured

        var errorDescription: String? {
            switch self {
            case let .http(code, message):
                return code == 401 ? "API key salah" : "Server \(code): \(message)"
            case .notConfigured:
                return "Tidak bisa menghubungi server"
            }
        }
    }

    func status() async throws -> ServerStatus {
        try await request("GET", "api/status")
    }

    func lyrics() async throws -> LyricsPayload {
        try await request("GET", "api/lyrics")
    }

    func me() async throws -> MePayload {
        try await request("GET", "api/me")
    }

    func logout() async throws {
        try await post("api/logout")
    }

    func spotifyLoginLink() async throws -> URL {
        struct LinkResponse: Decodable { let url: URL }
        let response: LinkResponse = try await request("POST", "api/login-link")
        return response.url
    }

    func post(_ path: String, _ body: [String: String] = [:]) async throws {
        let _: Empty = try await request("POST", path, body: body)
    }

    func postJSON<B: Encodable>(_ path: String, _ body: B) async throws {
        let _: Empty = try await request("POST", path, encodable: body)
    }

    func postPreferences(_ body: [String: Any]) async throws -> ServerStatus.Preferences {
        struct PrefsResponse: Decodable { let preferences: ServerStatus.Preferences }
        var req = URLRequest(url: baseURL.appending(path: "api/preferences"))
        req.httpMethod = "POST"
        req.timeoutInterval = 10
        req.setValue(apiKey, forHTTPHeaderField: "x-api-key")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, response) = try await URLSession.shared.data(for: req)
        let code = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200 ..< 300).contains(code) else {
            let message = (try? JSONDecoder().decode([String: String].self, from: data))?["error"]
                ?? String(decoding: data.prefix(200), as: UTF8.self)
            throw ClientError.http(code, message)
        }
        return try JSONDecoder().decode(PrefsResponse.self, from: data).preferences
    }

    private struct Empty: Decodable {}

    private func request<T: Decodable>(_ method: String, _ path: String, body: [String: String]? = nil) async throws -> T {
        try await request(method, path, encodable: body)
    }

    private func request<T: Decodable, B: Encodable>(_ method: String, _ path: String, encodable: B?) async throws -> T {
        var req = URLRequest(url: baseURL.appending(path: path))
        req.httpMethod = method
        req.timeoutInterval = 10
        req.setValue(apiKey, forHTTPHeaderField: "x-api-key")
        if let encodable {
            req.httpBody = try JSONEncoder().encode(encodable)
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        let (data, response) = try await URLSession.shared.data(for: req)
        let code = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200 ..< 300).contains(code) else {
            let message = (try? JSONDecoder().decode([String: String].self, from: data))?["error"]
                ?? String(decoding: data.prefix(200), as: UTF8.self)
            throw ClientError.http(code, message)
        }
        return try JSONDecoder().decode(T.self, from: data)
    }
}

extension Data {
    /// Token push dalam bentuk hex (format yang diminta APNs).
    var hexString: String { map { String(format: "%02x", $0) }.joined() }
}
