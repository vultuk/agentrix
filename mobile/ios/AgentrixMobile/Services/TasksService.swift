import Foundation

final class TasksService {
    private let api: AgentrixAPIClient

    init(api: AgentrixAPIClient) {
        self.api = api
    }

    func fetchTasks() async throws -> [TaskItem] {
        let response: TasksResponse = try await api.request("/api/tasks")
        return response.tasks
    }
}
