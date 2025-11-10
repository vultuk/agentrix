import Foundation

final class PlansService {
    private let api: AgentrixAPIClient

    init(api: AgentrixAPIClient) {
        self.api = api
    }

    func fetchPlans(org: String, repo: String, branch: String) async throws -> [PlanRecord] {
        var components = URLComponents()
        components.queryItems = [
            URLQueryItem(name: "org", value: org),
            URLQueryItem(name: "repo", value: repo),
            URLQueryItem(name: "branch", value: branch)
        ]
        let query = components.percentEncodedQuery.map { "?\($0)" } ?? ""
        let response: PlanListResponse = try await api.request("/api/plans\(query)")
        return response.data
    }

    func fetchPlanContent(org: String, repo: String, branch: String, planId: String) async throws -> PlanContentResponse.PlanContent {
        var components = URLComponents()
        components.queryItems = [
            URLQueryItem(name: "org", value: org),
            URLQueryItem(name: "repo", value: repo),
            URLQueryItem(name: "branch", value: branch),
            URLQueryItem(name: "planId", value: planId)
        ]
        let query = components.percentEncodedQuery.map { "?\($0)" } ?? ""
        let response: PlanContentResponse = try await api.request("/api/plans/content\(query)")
        return response.data
    }

    func createPlan(prompt: String, org: String?, repo: String?) async throws -> String {
        struct Payload: Encodable {
            let prompt: String
            let rawPrompt: Bool
            let dangerousMode: Bool
            let org: String?
            let repo: String?
        }
        struct Response: Decodable { let plan: String }
        let response: Response = try await api.request(
            "/api/create-plan",
            method: .post,
            body: Payload(prompt: prompt, rawPrompt: false, dangerousMode: false, org: org, repo: repo)
        )
        return response.plan
    }
}
