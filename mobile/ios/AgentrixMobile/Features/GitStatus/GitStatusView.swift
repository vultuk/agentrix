import SwiftUI

struct GitStatusView: View {
    let status: GitStatusResponse.Status?
    var onSelectFile: ((GitFileEntry, GitDiffMode) -> Void)? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            if let status {
                Text("Branch \(status.branch)")
                    .font(.headline)
                GitStatusSection(
                    title: "Staged",
                    files: status.files.staged.items,
                    mode: .staged,
                    onSelect: onSelectFile
                )
                GitStatusSection(
                    title: "Unstaged",
                    files: status.files.unstaged.items,
                    mode: .unstaged,
                    onSelect: onSelectFile
                )
                GitStatusSection(
                    title: "Untracked",
                    files: status.files.untracked.items,
                    mode: .untracked,
                    onSelect: onSelectFile
                )
                GitStatusSection(
                    title: "Conflicts",
                    files: status.files.conflicts.items,
                    mode: .unstaged,
                    onSelect: onSelectFile
                )
            } else {
                ContentUnavailableView("Git status", systemImage: "tray", description: Text("No status snapshot yet."))
            }
        }
    }
}

private struct GitStatusSection: View {
    let title: String
    let files: [GitFileEntry]
    let mode: GitDiffMode
    let onSelect: ((GitFileEntry, GitDiffMode) -> Void)?

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
                    Button {
                        onSelect?(file, mode)
                    } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(file.path)
                                .font(.caption)
                                .foregroundStyle(.primary)
                                .multilineTextAlignment(.leading)
                            Text(file.status.isEmpty ? "—" : file.status)
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.vertical, 4)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }
}
