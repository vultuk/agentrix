import Foundation

enum TaskStatus: String, Decodable {
    case pending
    case running
    case succeeded
    case failed
    case completed // compatibility with older payloads
}

struct TaskStep: Decodable, Identifiable {
    let id: String
    let label: String
    let status: TaskStatus
    let startedAt: Date?
    let completedAt: Date?
    let logs: [TaskLog]
}

struct TaskLog: Decodable, Identifiable {
    let id: String
    let message: String
    let timestamp: Date?
}

struct TaskItem: Decodable, Identifiable {
    let id: String
    let type: String
    let title: String?
    let status: TaskStatus
    let createdAt: Date?
    let updatedAt: Date?
    let completedAt: Date?
    let metadata: TaskMetadata?
    let steps: [TaskStep]?
    let error: String?
}

struct TaskMetadata: Decodable {
    let org: String?
    let repo: String?
    let branch: String?
    let status: String?
}

struct TasksResponse: Decodable {
    let tasks: [TaskItem]
}
