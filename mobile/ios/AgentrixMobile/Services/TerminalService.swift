import Foundation

final class TerminalService {
    private let api: AgentrixAPIClient

    init(api: AgentrixAPIClient) {
        self.api = api
    }

    struct TerminalOpenPayload: Encodable {
        let org: String
        let repo: String
        let branch: String
        let command: String?
        let prompt: String?
        let sessionId: String?
        let newSession: Bool?
        let sessionTool: String?
    }

    func openTerminal(
        org: String,
        repo: String,
        branch: String,
        command: String? = nil,
        prompt: String? = nil,
        sessionId: String? = nil,
        newSession: Bool = false,
        sessionTool: String? = nil
    ) async throws -> TerminalOpenResponse {
        let payload = TerminalOpenPayload(
            org: org,
            repo: repo,
            branch: branch,
            command: command,
            prompt: prompt,
            sessionId: sessionId,
            newSession: newSession ? true : nil,
            sessionTool: sessionTool
        )
        return try await api.request(
            "/api/terminal/open",
            method: .post,
            body: payload
        )
    }

    func closeTerminal(sessionId: String) async {
        struct Payload: Encodable { let sessionId: String }
        do {
            try await api.requestVoid(
                "/api/terminal/close",
                method: .post,
                body: Payload(sessionId: sessionId)
            )
        } catch {
            // Ignored, closing is best effort
        }
    }

    func makeWebSocketTask(sessionId: String) -> URLSessionWebSocketTask {
        let url = api.config.terminalWebSocketURL(sessionId: sessionId)
        return api.session.webSocketTask(with: url)
    }

    func fetchSessions() async throws -> [WorktreeSessionSummary] {
        let response: SessionsResponse = try await api.request("/api/sessions")
        return response.sessions
    }
}
