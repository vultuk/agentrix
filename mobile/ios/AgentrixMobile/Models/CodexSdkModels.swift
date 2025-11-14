import Foundation

struct CodexSdkSessionSummary: Decodable, Identifiable, Hashable {
    let id: String
    let org: String
    let repo: String
    let branch: String
    let label: String
    let createdAt: Date
    let lastActivityAt: Date?

    func updating(lastActivityAt: Date?) -> CodexSdkSessionSummary {
        CodexSdkSessionSummary(
            id: id,
            org: org,
            repo: repo,
            branch: branch,
            label: label,
            createdAt: createdAt,
            lastActivityAt: lastActivityAt
        )
    }
}

struct CodexSdkSessionDetail: Decodable {
    let session: CodexSdkSessionSummary
    let events: [CodexSdkEvent]
}

struct CodexSdkUsage: Decodable {
    let values: [String: Double]

    init(values: [String: Double]) {
        self.values = values
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let numbers = try? container.decode([String: Double].self) {
            self.values = numbers
        } else if let integers = try? container.decode([String: Int].self) {
            self.values = integers.mapValues { Double($0) }
        } else {
            self.values = [:]
        }
    }
}

struct CodexSdkEvent: Decodable, Identifiable, Hashable {
    enum EventType: String, Decodable {
        case ready
        case userMessage = "user_message"
        case thinking
        case log
        case agentResponse = "agent_response"
        case usage
        case error
    }

    let type: EventType
    private let rawIdentifier: String?
    private let fallbackIdentifier: String
    let text: String?
    let message: String?
    let status: String?
    let level: String?
    let timestamp: Date?
    let usage: CodexSdkUsage?

    var id: String {
        rawIdentifier ?? "\(type.rawValue)-\(fallbackIdentifier)"
    }

    init(
        type: EventType,
        id: String?,
        text: String?,
        message: String?,
        status: String?,
        level: String?,
        timestamp: Date?,
        usage: CodexSdkUsage?
    ) {
        self.type = type
        self.rawIdentifier = id
        self.fallbackIdentifier = UUID().uuidString
        self.text = text
        self.message = message
        self.status = status
        self.level = level
        self.timestamp = timestamp
        self.usage = usage
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.type = try container.decode(EventType.self, forKey: .type)
        self.rawIdentifier = try container.decodeIfPresent(String.self, forKey: .id)
        self.text = try container.decodeIfPresent(String.self, forKey: .text)
        self.message = try container.decodeIfPresent(String.self, forKey: .message)
        self.status = try container.decodeIfPresent(String.self, forKey: .status)
        self.level = try container.decodeIfPresent(String.self, forKey: .level)
        self.timestamp = try container.decodeIfPresent(Date.self, forKey: .timestamp)
        self.usage = try container.decodeIfPresent(CodexSdkUsage.self, forKey: .usage)
        self.fallbackIdentifier = UUID().uuidString
    }

    private enum CodingKeys: String, CodingKey {
        case type
        case id
        case text
        case message
        case status
        case level
        case timestamp
        case usage
    }
}
