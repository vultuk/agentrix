import Foundation

struct CodexWatchSnapshotBuilder {
    func makeSnapshot(
        worktree: WorktreeReference?,
        sessions: [CodexSdkSessionSummary],
        eventsBySession: [String: [CodexSdkEvent]]
    ) -> CodexWatchSnapshot {
        let worktreeContext = worktree.map {
            CodexWatchSnapshot.WorktreeContext(org: $0.org, repo: $0.repo, branch: $0.branch)
        }
        let sessionSnapshots = sessions.map { session in
            let events = eventsBySession[session.id] ?? []
            let messages = buildMessages(events: events)
            return CodexWatchSnapshot.Session(
                id: session.id,
                label: session.label,
                org: session.org,
                repo: session.repo,
                branch: session.branch,
                createdAt: session.createdAt,
                lastActivityAt: session.lastActivityAt,
                latestPreview: messages.last?.text,
                messages: messages
            )
        }
        return CodexWatchSnapshot(worktree: worktreeContext, sessions: sessionSnapshots)
    }
}

private extension CodexWatchSnapshotBuilder {
    func buildMessages(events: [CodexSdkEvent]) -> [CodexWatchSnapshot.Message] {
        events.compactMap { event in
            guard
                let role = role(for: event.type),
                let text = normalizedText(for: event)?.nilIfEmpty
            else {
                return nil
            }
            return CodexWatchSnapshot.Message(
                id: event.id,
                role: role,
                text: text,
                timestamp: event.timestamp
            )
        }
    }

    func role(for type: CodexSdkEvent.EventType) -> CodexWatchMessageRole? {
        switch type {
        case .userMessage:
            return .user
        case .agentResponse:
            return .agent
        case .error:
            return .system
        case .thinking, .log, .usage, .ready:
            return nil
        }
    }

    func normalizedText(for event: CodexSdkEvent) -> String? {
        switch event.type {
        case .userMessage:
            return event.text
        case .agentResponse:
            return event.message ?? event.text
        case .error:
            return event.message ?? event.text
        case .thinking, .log, .usage, .ready:
            return nil
        }
    }
}

private extension String {
    var nilIfEmpty: String? {
        let trimmed = trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}
