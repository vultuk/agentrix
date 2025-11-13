struct DiffPresentationState: Identifiable {
    let path: String
    let previousPath: String?
    let mode: GitDiffMode
    let status: String?

    var id: String {
        [mode.rawValue, path, previousPath ?? ""].joined(separator: "::")
    }
}

