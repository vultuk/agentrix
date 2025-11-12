import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

struct GitDiffSheet: View {
    @ObservedObject var viewModel: WorktreeDetailViewModel
    let repository: RepositoryListing
    let worktree: WorktreeSummary
    let selection: DiffPresentationState

    @Environment(\.dismiss) private var dismiss

    @State private var diffResponse: GitDiffResponse?
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var copyFeedback: String?
    @State private var copyTask: Task<Void, Never>? = nil

    var body: some View {
        NavigationStack {
            content
                .navigationTitle(selection.path)
                #if os(iOS)
                .navigationBarTitleDisplayMode(.inline)
                #endif
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Close") { dismiss() }
                    }
                    ToolbarItem(placement: .primaryAction) {
                        Button {
                            Task { await loadDiff(force: true) }
                        } label: {
                            Image(systemName: "arrow.clockwise")
                        }
                        .disabled(isLoading)
                    }
                }
        }
        .task {
            await loadDiff()
        }
        .onDisappear {
            copyTask?.cancel()
        }
    }

    @ViewBuilder
    private var content: some View {
        if isLoading && diffResponse == nil {
            ProgressView("Loading diff…")
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
        } else if let diffResponse {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    metadataView(for: diffResponse)
                    Divider()
                    Text(diffResponse.diff.isEmpty ? "No diff available." : diffResponse.diff)
                        .font(.system(.body, design: .monospaced))
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding()
                        .background(Color.gray.opacity(0.12))
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                    Button {
                        copyDiff(diffResponse.diff)
                    } label: {
                        Label("Copy Diff", systemImage: "doc.on.doc")
                    }
                    .buttonStyle(.bordered)
                    if let copyFeedback {
                        Text(copyFeedback)
                            .font(.caption)
                            .foregroundStyle(Color.agentrixAccent)
                    }
                }
                .padding()
            }
        } else if let errorMessage {
            VStack(spacing: 12) {
                Text(errorMessage)
                    .multilineTextAlignment(.center)
                Button("Retry") {
                    Task { await loadDiff(force: true) }
                }
                .buttonStyle(.borderedProminent)
            }
            .padding()
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
        } else {
            ContentUnavailableView(
                "Diff unavailable",
                systemImage: "doc.plaintext",
                description: Text("Unable to load diff for this file.")
            )
        }
    }

    @ViewBuilder
    private func metadataView(for response: GitDiffResponse) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Repository: \(repository.org)/\(repository.name)")
                .font(.caption)
                .foregroundStyle(.secondary)
            Text("Worktree: \(worktree.branch)")
                .font(.caption)
                .foregroundStyle(.secondary)
            if let previous = response.previousPath, previous != response.path {
                Text("Renamed from \(previous)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Text("Mode: \(response.mode)")
                .font(.caption2)
                .foregroundStyle(.secondary)
            if let status = selection.status, !status.isEmpty {
                Text("Status: \(status)")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private func loadDiff(force: Bool = false) async {
        if isLoading && !force { return }
        isLoading = true
        defer { isLoading = false }
        do {
            let diff = try await viewModel.fetchDiff(
                path: selection.path,
                previousPath: selection.previousPath,
                mode: selection.mode,
                status: selection.status
            )
            await MainActor.run {
                diffResponse = diff
                errorMessage = nil
            }
        } catch let error as AgentrixError {
            await MainActor.run {
                errorMessage = error.errorDescription
                diffResponse = nil
            }
        } catch {
            await MainActor.run {
                errorMessage = error.localizedDescription
                diffResponse = nil
            }
        }
    }

    private func copyDiff(_ diff: String) {
#if canImport(UIKit)
        UIPasteboard.general.string = diff
#endif
        copyTask?.cancel()
        copyTask = Task {
            await MainActor.run {
                copyFeedback = "Diff copied to clipboard."
            }
            try? await Task.sleep(nanoseconds: 1_500_000_000)
            await MainActor.run {
                copyFeedback = nil
            }
        }
    }
}

