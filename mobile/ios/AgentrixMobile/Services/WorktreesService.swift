import Foundation

final class WorktreesService {
    private let api: AgentrixAPIClient

    init(api: AgentrixAPIClient) {
        self.api = api
    }

    struct CreateWorktreeResponse: Decodable {
        let taskId: String
        let org: String
        let repo: String
        let branch: String?
    }

    func createWorktree(org: String, repo: String, branch: String?, prompt: String?) async throws -> CreateWorktreeResponse {
        struct Payload: Encodable {
            let org: String
            let repo: String
            let branch: String?
            let prompt: String?
        }
        return try await api.request(
            "/api/worktrees",
            method: .post,
            body: Payload(org: org, repo: repo, branch: branch, prompt: prompt)
        )
    }

    func deleteWorktree(org: String, repo: String, branch: String) async throws {
        struct Payload: Encodable {
            let org: String
            let repo: String
            let branch: String
        }
        try await api.requestVoid(
            "/api/worktrees",
            method: .delete,
            body: Payload(org: org, repo: repo, branch: branch)
        )
    }
}
