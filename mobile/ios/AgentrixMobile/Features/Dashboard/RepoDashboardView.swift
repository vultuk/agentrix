import SwiftUI

struct RepoDashboardView: View {
    let dashboard: RepositoryDashboard?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let dashboard {
                Text("Updated \(dashboard.fetchedAt.formatted(date: .omitted, time: .standard))")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                HStack {
                    DashboardCountCard(title: "PRs", value: dashboard.pullRequests?.open ?? 0, systemImage: "arrow.triangle.branch")
                    DashboardCountCard(title: "Issues", value: dashboard.issues?.open ?? 0, systemImage: "exclamationmark.circle")
                    DashboardCountCard(title: "Worktrees", value: dashboard.worktrees?.local ?? 0, systemImage: "tree")
                }
                if let issues = dashboard.issues?.items, !issues.isEmpty {
                    Text("Open Issues")
                        .font(.headline)
                    ForEach(issues) { issue in
                        VStack(alignment: .leading, spacing: 4) {
                            Text("#\(issue.number) · \(issue.title)")
                                .font(.subheadline)
                                .bold()
                            if let created = issue.createdAt {
                                Text(created.formatted())
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            if let url = issue.url {
                                Link("View on GitHub", destination: url)
                                    .font(.caption)
                            }
                        }
                        .padding()
                        .background(.thinMaterial)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                    }
                }
            } else {
                ContentUnavailableView("No metrics", systemImage: "chart.xyaxis.line", description: Text("Dashboard data has not been fetched yet."))
            }
        }
    }
}

private struct DashboardCountCard: View {
    let title: String
    let value: Int
    let systemImage: String

    var body: some View {
        VStack {
            Label("\(value)", systemImage: systemImage)
                .font(.title3)
            Text(title)
                .font(.caption)
        }
        .frame(maxWidth: .infinity)
        .padding()
        .background(.thinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}
