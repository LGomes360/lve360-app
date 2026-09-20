import Foundation
import Supabase

enum HealthBridgeError: LocalizedError {
    case healthUnavailable
    case configurationMissing
    case accountChanged
    case server(String)

    var errorDescription: String? {
        switch self {
        case .healthUnavailable: return "Apple Health is unavailable on this device. Use an iPhone to connect."
        case .configurationMissing: return "This build needs its Supabase public key configured."
        case .accountChanged: return "The signed-in LVE360 account changed. Sign in again before syncing."
        case .server(let code): return "LVE360 could not complete the request (\(code)). Please retry."
        }
    }
}

enum BridgeAPI {
    private static func configuration(_ key: String) -> String {
        Bundle.main.object(forInfoDictionaryKey: key) as? String ?? ""
    }

    static let client = SupabaseClient(
        supabaseURL: URL(string: configuration("LVE_SUPABASE_URL"))!,
        supabaseKey: configuration("LVE_SUPABASE_ANON_KEY")
    )

    static var isConfigured: Bool {
        let key = configuration("LVE_SUPABASE_ANON_KEY")
        return !key.isEmpty && key != "CONFIGURE_FOR_DEVICE_BUILD" && !key.contains("$(")
    }

    static var baseURL: URL { URL(string: configuration("LVE_APP_URL"))! }

    static func post(_ path: String, accountID: String, body: Data? = nil) async throws {
        guard isConfigured else { throw HealthBridgeError.configurationMissing }
        let session = try await client.auth.session
        guard String(describing: session.user.id) == accountID else { throw HealthBridgeError.accountChanged }
        var request = URLRequest(url: baseURL.appendingPathComponent(path))
        request.httpMethod = "POST"
        request.timeoutInterval = 30
        request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        if let body {
            request.httpBody = body
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let response = response as? HTTPURLResponse else { throw HealthBridgeError.server("invalid_response") }
        guard (200..<300).contains(response.statusCode) else {
            let error = (try? JSONDecoder().decode(ServerError.self, from: data))?.error
            throw HealthBridgeError.server(error ?? "http_\(response.statusCode)")
        }
    }

    private struct ServerError: Decodable { let error: String }
}
