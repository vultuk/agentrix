import Foundation

struct TerminalOpenResponse: Decodable {
    let sessionId: String
    let log: String
    let created: Bool
}

struct WorktreeSessionSnapshot: Decodable, Identifiable {
    let id: String
    let label: String
    let kind: String
    let tool: String
    let idle: Bool
    let usingTmux: Bool
    let lastActivityAt: Date?
    let createdAt: Date?
    let tmuxSessionName: String?
}

struct WorktreeSessionSummary: Decodable, Identifiable {
    let org: String
    let repo: String
    let branch: String
    let idle: Bool
    let lastActivityAt: Date?
    let sessions: [WorktreeSessionSnapshot]

    var id: String { "\(org)/\(repo)/\(branch)" }
}

struct SessionsResponse: Decodable {
    let sessions: [WorktreeSessionSummary]
}

struct TerminalEvent: Decodable {
    let type: String
    let log: String?
    let chunk: String?
    let message: String?
}
