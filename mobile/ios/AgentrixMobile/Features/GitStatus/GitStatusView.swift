import SwiftUI

struct GitStatusView: View {
    let status: GitStatusResponse.Status?

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            if let status {
                Text("Branch \(status.branch)")
                    .font(.headline)
                GitStatusSection(title: "Staged", files: status.files.staged.items)
                GitStatusSection(title: "Unstaged", files: status.files.unstaged.items)
                GitStatusSection(title: "Untracked", files: status.files.untracked.items)
                GitStatusSection(title: "Conflicts", files: status.files.conflicts.items)
            } else {
                ContentUnavailableView("Git status", systemImage: "tray", description: Text("No status snapshot yet."))
            }
        }
    }
}

private struct GitStatusSection: View {
    let title: String
    let files: [GitFileEntry]

    var body: some View {
        VStack(alignment: .leading) {
            HStack {
                Text(title)
                    .font(.subheadline)
                    .bold()
                Spacer()
                Text("\(files.count)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            if files.isEmpty {
                Text("No files")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            } else {
                ForEach(files) { file in
                    VStack(alignment: .leading) {
                        Text(file.path)
                            .font(.caption)
                        Text(file.status)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.vertical, 2)
                }
            }
        }
    }
}
