import SwiftUI

struct CodexSessionListView: View {
    @EnvironmentObject private var store: CodexWatchSessionStore

    var body: some View {
        NavigationStack {
            List {
                if let description = store.worktreeDescription {
                    Section {
                        Text(description)
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }
                Section("Sessions") {
                    if store.sessions.isEmpty {
                        Text("No active Codex sessions.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                    ForEach(store.sessions) { session in
                        NavigationLink(value: session.id) {
                            CodexSessionRow(session: session)
                        }
                    }
                }
            }
            .navigationDestination(for: String.self) { sessionId in
                if let session = store.session(withId: sessionId) {
                    CodexSessionDetailView(sessionId: session.id)
                } else {
                    ContentUnavailableView("Session unavailable", systemImage: "exclamationmark.triangle")
                }
            }
            .navigationTitle("Codex")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        store.refresh()
                    } label: {
                        Image(systemName: "arrow.clockwise")
                    }
                }
            }
            .overlay(alignment: .bottom) {
                if let error = store.errorMessage {
                    Text(error)
                        .font(.caption2)
                        .padding(6)
                        .frame(maxWidth: .infinity)
                        .background(Color.red.opacity(0.2))
                        .foregroundStyle(.red)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                        .padding(.horizontal)
                }
            }
            .overlay {
                if store.isLoading {
                    ProgressView("Syncing…")
                }
            }
            .task {
                store.handleAppear()
            }
        }
    }
}

private struct CodexSessionRow: View {
    let session: CodexWatchSnapshot.Session
    private let formatter: RelativeDateTimeFormatter = {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        return formatter
    }()

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(session.label.isEmpty ? "Codex SDK" : session.label)
                .font(.headline)
                .lineLimit(1)
            Text("\(session.repo) • \(session.branch)")
                .font(.caption2)
                .foregroundStyle(.secondary)
            if let preview = session.latestPreview {
                Text(preview)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }
            if let activity = session.lastActivityAt ?? session.createdAt {
                Text(formatter.localizedString(for: activity, relativeTo: Date()))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
    }
}
