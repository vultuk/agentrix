import Foundation

final class DashboardService {
    private let api: AgentrixAPIClient

    init(api: AgentrixAPIClient) {
        self.api = api
    }

    func fetchDashboard(org: String, repo: String) async throws -> RepositoryDashboard {
        var components = URLComponents()
        components.queryItems = [
            URLQueryItem(name: "org", value: org),
            URLQueryItem(name: "repo", value: repo)
        ]
        let query = components.percentEncodedQuery.map { "?\($0)" } ?? ""
        let response: RepositoryDashboardResponse = try await api.request("/api/repos/dashboard\(query)")
        return response.data
    }
}
