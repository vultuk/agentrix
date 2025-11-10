import Foundation

struct RepositoryEnvelope: Decodable {
    let data: [String: [String: RepositoryDTO]]
}

struct RepositoryDTO: Decodable {
    let branches: [String]?
    let initCommand: String?
}

extension RepositoryDTO {
    static var empty: RepositoryDTO {
        RepositoryDTO(branches: [], initCommand: nil)
    }
}

struct RepositoryListing: Identifiable, Hashable {
    let id: String
    let org: String
    let name: String
    var branches: [String]
    var initCommand: String

    init(org: String, name: String, dto: RepositoryDTO) {
        self.org = org
        self.name = name
        self.id = "\(org)/\(name)"
        self.branches = dto.branches ?? []
        self.initCommand = dto.initCommand ?? ""
    }

    var worktrees: [WorktreeSummary] {
        branches.map { WorktreeSummary(org: org, repo: name, branch: $0) }
    }
}

extension RepositoryListing {
    var representativeWorktree: WorktreeSummary? {
        worktrees.first(where: { $0.branch != "main" }) ?? worktrees.first
    }
    var representativeWorktree: WorktreeSummary? {
        worktrees.first(where: { $0.branch != "main" }) ?? worktrees.first
    }
}

struct WorktreeSummary: Identifiable, Hashable {
    let id: String
    let org: String
    let repo: String
    let branch: String

    init(org: String, repo: String, branch: String) {
        self.org = org
        self.repo = repo
        self.branch = branch
        self.id = "\(org)/\(repo)/\(branch)"
    }
}

struct RepositorySection: Identifiable, Hashable {
    let id: String
    let title: String
    var repositories: [RepositoryListing]
}

struct RepositoryReference: Hashable, Identifiable {
    let org: String
    let repo: String

    var id: String { "\(org)/\(repo)" }
}

struct WorktreeReference: Hashable, Identifiable {
    let org: String
    let repo: String
    let branch: String

    var id: String { "\(org)/\(repo)/\(branch)" }
}
