import Foundation

final class RepositoriesService {
    private let api: AgentrixAPIClient

    init(api: AgentrixAPIClient) {
        self.api = api
    }

    func fetchRepositories() async throws -> [RepositorySection] {
        let envelope: RepositoryEnvelope = try await api.request("/api/repos")
        return Self.makeSections(from: envelope.data)
    }

    func fetchIssue(org: String, repo: String, number: Int) async throws -> RepositoryIssueDetailResponse {
        struct IssueDetailEnvelope: Decodable {
            let data: RepositoryIssueDetailResponse
        }
        var components = URLComponents()
        components.queryItems = [
            URLQueryItem(name: "org", value: org),
            URLQueryItem(name: "repo", value: repo),
            URLQueryItem(name: "issue", value: String(number))
        ]
        let query = components.percentEncodedQuery.map { "?\($0)" } ?? ""
        let response: IssueDetailEnvelope = try await api.request("/api/repos/issue\(query)")
        return response.data
    }

    func addRepository(remoteURL: String, initCommand: String) async throws -> [RepositorySection] {
        struct Payload: Encodable {
            let url: String
            let initCommand: String
        }
        let response: RepositoryEnvelope = try await api.request(
            "/api/repos",
            method: .post,
            body: Payload(url: remoteURL, initCommand: initCommand)
        )
        return Self.makeSections(from: response.data)
    }

    func deleteRepository(org: String, repo: String) async throws -> [RepositorySection] {
        struct Payload: Encodable {
            let org: String
            let repo: String
        }
        let response: RepositoryEnvelope = try await api.request(
            "/api/repos",
            method: .delete,
            body: Payload(org: org, repo: repo)
        )
        return Self.makeSections(from: response.data)
    }

    func updateInitCommand(org: String, repo: String, initCommand: String) async throws -> [RepositorySection] {
        struct Payload: Encodable {
            let org: String
            let repo: String
            let initCommand: String
        }
        let response: RepositoryEnvelope = try await api.request(
            "/api/repos/init-command",
            method: .post,
            body: Payload(org: org, repo: repo, initCommand: initCommand)
        )
        return Self.makeSections(from: response.data)
    }

    func fetchCommandConfig() async throws -> CommandConfig {
        let response: CommandConfigResponse = try await api.request("/api/commands")
        return CommandConfig(values: response.commands)
    }

    static func makeSections(from data: [String: [String: RepositoryDTO]]) -> [RepositorySection] {
        data
            .keys
            .sorted()
            .map { org in
                let repos = data[org] ?? [:]
                let listings = repos
                    .keys
                    .sorted()
                    .map { repoName in
                        RepositoryListing(org: org, name: repoName, dto: repos[repoName] ?? .empty)
                    }
                return RepositorySection(id: org, title: org, repositories: listings)
            }
    }
}
