import Foundation

struct CodexWatchSnapshot: Codable {
    struct WorktreeContext: Codable {
        let org: String
        let repo: String
        let branch: String

        var id: String {
            "\(org)/\(repo)/\(branch)"
        }
    }

    struct Session: Codable, Identifiable {
        let id: String
        let label: String
        let org: String
        let repo: String
        let branch: String
        let createdAt: Date
        let lastActivityAt: Date?
        let latestPreview: String?
        let messages: [Message]
    }

    struct Message: Codable, Identifiable, Hashable {
        let id: String
        let role: CodexWatchMessageRole
        let text: String
        let timestamp: Date?
    }

    let worktree: WorktreeContext?
    let sessions: [Session]
}

enum CodexWatchMessageRole: String, Codable {
    case user
    case agent
    case system
}
