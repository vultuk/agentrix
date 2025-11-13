import SwiftUI

struct TasksListView: View {
    let tasks: [TaskItem]

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if tasks.isEmpty {
                ContentUnavailableView("No tasks", systemImage: "checkmark.circle", description: Text("Automation and worktree tasks appear here."))
            } else {
                ForEach(tasks) { task in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(task.title ?? task.type.capitalized)
                            .font(.headline)
                        Text(task.statusDisplay)
                            .font(.caption)
                            .foregroundStyle(task.statusColor)
                        if let metadata = task.metadata {
                            Text([metadata.org, metadata.repo, metadata.branch].compactMap { $0 }.joined(separator: "/"))
                                .font(.caption2)
                        }
                    }
                    .padding()
                    .background(.thinMaterial)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                }
            }
        }
    }
}

private extension TaskItem {
    var statusDisplay: String {
        switch status {
        case .pending: return "Pending"
        case .running: return "Running"
        case .succeeded: return "Succeeded"
        case .failed: return "Failed"
        case .completed: return "Completed"
        }
    }

    var statusColor: Color {
        switch status {
        case .pending: return .orange
        case .running: return .blue
        case .succeeded, .completed: return .green
        case .failed: return .agentrixError
        }
    }
}
