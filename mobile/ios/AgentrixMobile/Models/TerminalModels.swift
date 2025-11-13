import Foundation

enum TerminalSessionTool: String, Decodable, CaseIterable {
    case terminal
    case agent

    var displayName: String {
        switch self {
        case .terminal:
            return "Terminal"
        case .agent:
            return "Agent"
        }
    }

    var kindValue: String {
        switch self {
        case .terminal:
            return "interactive"
        case .agent:
            return "automation"
        }
    }

    var accessibilityLabel: String {
        switch self {
        case .terminal:
            return "Terminal session"
        case .agent:
            return "Agent session"
        }
    }
}

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

    var sessionTool: TerminalSessionTool? {
        TerminalSessionTool(rawValue: tool)
    }

    var sessionAccessibilityLabel: String {
        sessionTool?.accessibilityLabel ?? "\(tool.capitalized) session"
    }
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
