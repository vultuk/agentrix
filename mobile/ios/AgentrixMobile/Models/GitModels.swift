import Foundation

struct GitFileEntry: Decodable, Identifiable {
    let id: UUID = UUID()
    let path: String
    let status: String
    let previousPath: String?
    let description: String?
}

struct GitFileCollection: Decodable {
    let items: [GitFileEntry]
    let total: Int
    let truncated: Bool
}

struct GitCommit: Decodable, Identifiable {
    let id: UUID = UUID()
    let hash: String
    let author: String
    let relativeTime: String?
    let subject: String
}

struct GitStatusResponse: Decodable {
    struct Status: Decodable {
        let fetchedAt: Date?
        let org: String
        let repo: String
        let branch: String
        let files: GitStatusFiles
        let commits: GitCommitCollection
        let totals: GitTotals
    }

    let status: Status
}

struct GitStatusFiles: Decodable {
    let staged: GitFileCollection
    let unstaged: GitFileCollection
    let untracked: GitFileCollection
    let conflicts: GitFileCollection
}

struct GitCommitCollection: Decodable {
    let items: [GitCommit]
    let total: Int
    let truncated: Bool
}

struct GitTotals: Decodable {
    let staged: Int
    let unstaged: Int
    let untracked: Int
    let conflicts: Int
}

struct GitDiffResponse: Decodable {
    let path: String
    let previousPath: String?
    let mode: String
    let diff: String
}
