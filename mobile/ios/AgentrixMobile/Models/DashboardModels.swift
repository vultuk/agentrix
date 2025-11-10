import Foundation

struct RepositoryDashboardResponse: Decodable {
    let data: RepositoryDashboard
}

struct RepositoryDashboard: Decodable {
    let org: String
    let repo: String
    let fetchedAt: Date
    let pullRequests: DashboardCount?
    let issues: DashboardIssues?
    let worktrees: DashboardCount?
    let workflows: DashboardCount?
}

struct DashboardCount: Decodable {
    let open: Int?
    let running: Int?
    let local: Int?
}

struct DashboardIssues: Decodable {
    struct Issue: Decodable, Identifiable {
        let id = UUID()
        let number: Int
        let title: String
        let createdAt: Date?
        let labels: [String]?
        let url: URL?
    }

    let open: Int?
    let items: [Issue]
}
