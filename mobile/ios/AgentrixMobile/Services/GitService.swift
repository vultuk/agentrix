import Foundation

final class GitService {
    private let api: AgentrixAPIClient

    init(api: AgentrixAPIClient) {
        self.api = api
    }

    func fetchStatus(org: String, repo: String, branch: String) async throws -> GitStatusResponse.Status {
        var components = URLComponents()
        components.queryItems = [
            URLQueryItem(name: "org", value: org),
            URLQueryItem(name: "repo", value: repo),
            URLQueryItem(name: "branch", value: branch),
            URLQueryItem(name: "entryLimit", value: "200"),
            URLQueryItem(name: "commitLimit", value: "20")
        ]
        let query = components.percentEncodedQuery.map { "?\($0)" } ?? ""
        let response: GitStatusResponse = try await api.request("/api/git/status\(query)")
        return response.status
    }

    func fetchDiff(
        org: String,
        repo: String,
        branch: String,
        path: String,
        previousPath: String?,
        mode: String?,
        status: String?
    ) async throws -> GitDiffResponse {
        struct Payload: Encodable {
            let org: String
            let repo: String
            let branch: String
            let path: String
            let mode: String?
            let previousPath: String?
            let status: String?
        }
        return try await api.request(
            "/api/git/diff",
            method: .post,
            body: Payload(
                org: org,
                repo: repo,
                branch: branch,
                path: path,
                mode: mode,
                previousPath: previousPath,
                status: status
            )
        )
    }
}
