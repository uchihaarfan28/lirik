import Foundation

/// Respons GET /api/status dari server.
struct ServerStatus: Decodable {
    struct NowPlaying: Decodable {
        let title: String
        let artist: String
        let isPlaying: Bool
    }

    struct LastPush: Decodable {
        let event: String
        let ok: Bool
        let status: Int
        let reason: String?
    }

    let spotifyConnected: Bool
    let pushToStartRegistered: Bool
    let activityRegistered: Bool
    let nowPlaying: NowPlaying?
    let lyrics: String
    let line: String
    let nextLine: String
    let lastPush: LastPush?
    let lastError: String?
}

struct ServerClient {
    let baseURL: URL
    let apiKey: String

    enum ClientError: LocalizedError {
        case http(Int, String)

        var errorDescription: String? {
            switch self {
            case let .http(code, message):
                return code == 401 ? "API key salah" : "Server \(code): \(message)"
            }
        }
    }

    func status() async throws -> ServerStatus {
        try await request("GET", "api/status")
    }

    func spotifyLoginLink() async throws -> URL {
        struct LinkResponse: Decodable { let url: URL }
        let response: LinkResponse = try await request("POST", "api/login-link")
        return response.url
    }

    func post(_ path: String, _ body: [String: String] = [:]) async throws {
        let _: Empty = try await request("POST", path, body: body)
    }

    private struct Empty: Decodable {}

    private func request<T: Decodable>(_ method: String, _ path: String, body: [String: String]? = nil) async throws -> T {
        var req = URLRequest(url: baseURL.appending(path: path))
        req.httpMethod = method
        req.timeoutInterval = 10
        req.setValue(apiKey, forHTTPHeaderField: "x-api-key")
        if let body {
            req.httpBody = try JSONEncoder().encode(body)
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
