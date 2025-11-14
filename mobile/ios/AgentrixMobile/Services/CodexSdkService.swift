import Foundation

final class CodexSdkService {
    private let api: AgentrixAPIClient

    init(api: AgentrixAPIClient) {
        self.api = api
    }

    func listSessions(org: String, repo: String, branch: String) async throws -> [CodexSdkSessionSummary] {
        struct Response: Decodable {
            let sessions: [CodexSdkSessionSummary]
        }
        var components = URLComponents()
        components.queryItems = [
            URLQueryItem(name: "org", value: org),
            URLQueryItem(name: "repo", value: repo),
            URLQueryItem(name: "branch", value: branch)
        ]
        let query = components.percentEncodedQuery.map { "?\($0)" } ?? ""
        let response: Response = try await api.request("/api/codex-sdk/sessions\(query)")
        return response.sessions
    }

    func createSession(org: String, repo: String, branch: String, label: String?) async throws -> CodexSdkSessionDetail {
        struct Payload: Encodable {
            let org: String
            let repo: String
            let branch: String
            let label: String?
        }
        return try await api.request(
            "/api/codex-sdk/sessions",
            method: .post,
            body: Payload(org: org, repo: repo, branch: branch, label: label)
        )
    }

    func deleteSession(sessionId: String) async throws {
        try await api.requestVoid(
            Self.sessionPath(sessionId),
            method: .delete
        )
    }

    func makeWebSocketTask(sessionId: String) -> URLSessionWebSocketTask {
        let url = api.config.codexSdkWebSocketURL(sessionId: sessionId)
        return api.session.webSocketTask(with: url)
    }

    private static func sessionPath(_ sessionId: String) -> String {
        let encoded = sessionId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? sessionId
        return "/api/codex-sdk/sessions/\(encoded)"
    }
}
