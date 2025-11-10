import Foundation

struct RepositoryEnvelope: Decodable {
    let data: [String: [String: RepositoryDTO]]
}

struct RepositoryDTO: Decodable {
    let branches: [String]?
    let initCommand: String?
    let worktrees: [WorktreeDTO]?
}

struct WorktreeDTO: Decodable {
    let branch: String
    let path: String?
    let current: Bool?
    let prunable: Bool?
}

extension RepositoryDTO {
    static var empty: RepositoryDTO {
        RepositoryDTO(branches: [], initCommand: nil, worktrees: [])
    }
}

struct RepositoryListing: Identifiable, Hashable {
    let id: String
    let org: String
    let name: String
    var branches: [String]
    var initCommand: String
    var worktrees: [WorktreeSummary]

    init(org: String, name: String, dto: RepositoryDTO) {
        self.org = org
        self.name = name
        self.id = "\(org)/\(name)"
        self.branches = dto.branches ?? []
        self.initCommand = dto.initCommand ?? ""
        self.worktrees = (dto.worktrees ?? []).map { WorktreeSummary(dto: $0, org: org, repo: name) }
    }
}

struct WorktreeSummary: Identifiable, Hashable {
    let id: String
    let org: String
    let repo: String
    let branch: String
    let path: String?
    let isCurrent: Bool
    let isPrunable: Bool

    init(dto: WorktreeDTO, org: String, repo: String) {
        self.org = org
        self.repo = repo
        self.branch = dto.branch
        self.id = "\(org)/\(repo)/\(dto.branch)"
        self.path = dto.path
        self.isCurrent = dto.current ?? false
        self.isPrunable = dto.prunable ?? false
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
