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
