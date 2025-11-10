import Foundation

struct AuthStatusResponse: Decodable {
    let authenticated: Bool
}

final class AuthService {
    private let api: AgentrixAPIClient

    init(api: AgentrixAPIClient) {
        self.api = api
    }

    func status() async throws -> Bool {
        let response: AuthStatusResponse = try await api.request("/api/auth/status")
        return response.authenticated
    }

    func login(password: String) async throws {
        struct Payload: Encodable { let password: String }
        let response: AuthStatusResponse = try await api.request(
            "/api/auth/login",
            method: .post,
            body: Payload(password: password)
        )
        guard response.authenticated else {
            throw AgentrixError.server(message: "Authentication failed")
        }
    }

    func logout() async {
        struct EmptyPayload: Encodable {}
        do {
            _ = try await api.request<AuthStatusResponse, EmptyPayload>(
                "/api/auth/logout",
                method: .post,
                body: nil
            )
        } catch {
            // Logging out is best effort
        }
    }
}
