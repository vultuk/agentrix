import SwiftUI

struct RepoDashboardView: View {
    let dashboard: RepositoryDashboard?
    let gitStatus: GitStatusResponse.Status?
    var showGitTotals: Bool = true
    var onIssueSelect: ((Int) -> Void)?
    var onPullRequestsTap: (() -> Void)?
    var onIssuesTap: (() -> Void)?
    var onWorktreesTap: (() -> Void)?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let dashboard {
                Text("Updated \(dashboard.fetchedAt.formatted(date: .omitted, time: .standard))")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                HStack {
                    DashboardCountCard(
                        title: "PRs",
                        value: dashboard.pullRequests?.open ?? 0,
                        systemImage: "arrow.triangle.branch",
                        action: onPullRequestsTap
                    )
                    DashboardCountCard(
                        title: "Issues",
                        value: dashboard.issues?.open ?? 0,
                        systemImage: "exclamationmark.circle",
                        action: onIssuesTap
                    )
                    DashboardCountCard(
                        title: "Worktrees",
                        value: dashboard.worktrees?.local ?? 0,
                        systemImage: "tree",
                        action: onWorktreesTap
                    )
                }
                if showGitTotals, let gitStatus {
                    Divider()
                    GitTotalsSummaryView(totals: gitStatus.totals, fetchedAt: gitStatus.fetchedAt)
                }
                if let issues = dashboard.issues?.items, !issues.isEmpty {
                    Text("Open Issues")
                        .font(.headline)
                    ForEach(issues) { issue in
                        Button {
                            onIssueSelect?(issue.number)
                        } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                Text("#\(issue.number) · \(issue.title)")
                                    .font(.subheadline)
                                    .fontWeight(.semibold)
                                    .multilineTextAlignment(.leading)
                                if let created = issue.createdAt {
                                    Text(created.formatted())
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                                if let url = issue.url {
                                    HStack(spacing: 6) {
                                        Image(systemName: "link")
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                        Text(url.absoluteString)
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                            .lineLimit(1)
                                    }
                                }
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding()
                            .background(.thinMaterial)
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                        }
                        .buttonStyle(.plain)
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
    var action: (() -> Void)?

    var body: some View {
        Group {
            if let action {
                Button(action: action) {
                    cardContent
                }
                .buttonStyle(.plain)
            } else {
                cardContent
            }
        }
        .frame(maxWidth: .infinity)
    }

    private var cardContent: some View {
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

private struct GitTotalsSummaryView: View {
    let totals: GitTotals
    let fetchedAt: Date?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let fetchedAt {
                Text("Git status \(fetchedAt.formatted(date: .omitted, time: .standard))")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            HStack {
                DashboardCountCard(title: "Staged", value: totals.staged, systemImage: "checkmark.circle")
                DashboardCountCard(title: "Unstaged", value: totals.unstaged, systemImage: "pencil.circle")
                DashboardCountCard(title: "Untracked", value: totals.untracked, systemImage: "questionmark.circle")
                DashboardCountCard(title: "Conflicts", value: totals.conflicts, systemImage: "exclamationmark.triangle")
            }
        }
    }
}
