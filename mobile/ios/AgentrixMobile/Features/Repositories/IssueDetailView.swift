import SwiftUI

struct IssueDetailSheet: View {
    @ObservedObject var viewModel: WorktreeDetailViewModel
    let repository: RepositoryListing
    let issueNumber: Int

    @Environment(\.dismiss) private var dismiss

    @State private var issueDetail: RepositoryIssueDetailResponse?
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var promptSeed: String = ""

    var body: some View {
        NavigationStack {
            content
                .navigationTitle("Issue #\(issueNumber)")
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Close") { dismiss() }
                    }
                    ToolbarItem(placement: .primaryAction) {
                        Button {
                            Task { await loadIssue(force: true) }
                        } label: {
                            Image(systemName: "arrow.clockwise")
                        }
                        .disabled(isLoading)
                    }
                }
        }
        .task(id: issueNumber) {
            await loadIssue()
        }
    }

    @ViewBuilder
    private var content: some View {
        if isLoading && issueDetail == nil {
            ProgressView("Loading issue…")
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
        } else if let detail = issueDetail {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    issueHeader(detail: detail)
                    if let url = detail.issue.url {
                        Link(destination: url) {
                            Label("View on GitHub", systemImage: "safari")
                        }
                        .buttonStyle(.bordered)
                    }
                    if !detail.issue.body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        Divider()
                        Text(MarkdownRenderer.attributedString(from: detail.issue.body))
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    Divider()
                    PlanComposerView(
                        viewModel: viewModel,
                        initialPrompt: promptSeed,
                        title: "Generate Plan for Issue"
                    )
                    .id(promptSeed)
                }
                .padding()
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        } else if let errorMessage {
            VStack(spacing: 12) {
                Text(errorMessage)
                    .font(.subheadline)
                    .multilineTextAlignment(.center)
                Button("Retry") {
                    Task { await loadIssue(force: true) }
                }
                .buttonStyle(.borderedProminent)
            }
            .padding()
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
        } else {
            ContentUnavailableView(
                "Issue unavailable",
                systemImage: "exclamationmark.triangle",
                description: Text("Unable to load issue details.")
            )
        }
    }

    @ViewBuilder
    private func issueHeader(detail: RepositoryIssueDetailResponse) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(detail.issue.title)
                .font(.title3)
                .bold()
                .multilineTextAlignment(.leading)
            HStack(spacing: 8) {
                Text("#\(detail.issue.number)")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                if let state = detail.issue.state {
                    Text(state.capitalized)
                        .font(.caption)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(state == "open" ? Color.green.opacity(0.2) : Color.gray.opacity(0.2))
                        .clipShape(Capsule())
                }
                if let created = detail.issue.createdAt {
                    Text(created.formatted(date: .abbreviated, time: .shortened))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            if let fetchedAt = detail.fetchedAt {
                Text("Fetched \(fetchedAt.formatted(date: .abbreviated, time: .shortened))")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            if let author = detail.issue.author {
                Text(authorDisplay(author: author))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            if !detail.issue.labels.isEmpty {
                let columns = [GridItem(.adaptive(minimum: 80), spacing: 6)]
                LazyVGrid(columns: columns, alignment: .leading, spacing: 6) {
                    ForEach(detail.issue.labels, id: \.self) { label in
                        Text(label.name)
                            .font(.caption2)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(Color.gray.opacity(0.15))
                            .clipShape(Capsule())
                    }
                }
            }
        }
    }

    private func authorDisplay(author: IssueDetail.Author) -> String {
        if let name = author.name {
            if let login = author.login {
                return "\(name) (@\(login))"
            }
            return name
        }
        if let login = author.login {
            return "@\(login)"
        }
        return "Unknown author"
    }
    private func loadIssue(force: Bool = false) async {
        if isLoading && !force { return }
        isLoading = true
        defer { isLoading = false }
        do {
            let detail = try await viewModel.fetchIssueDetail(number: issueNumber)
            await MainActor.run {
                issueDetail = detail
                promptSeed = viewModel.issuePlanPrompt(for: detail)
                errorMessage = nil
            }
        } catch let error as AgentrixError {
            await MainActor.run {
                errorMessage = error.errorDescription
            }
        } catch {
            await MainActor.run {
                errorMessage = error.localizedDescription
            }
        }
    }
}

