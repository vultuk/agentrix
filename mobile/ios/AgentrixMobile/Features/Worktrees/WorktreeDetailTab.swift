enum WorktreeDetailTab: String, CaseIterable, Identifiable {
    case terminal
    case diffs
    case ports
    case plans

    var id: String { rawValue }

    var title: String {
        switch self {
        case .terminal: return "Terminal"
        case .diffs: return "Diffs"
        case .ports: return "Ports"
        case .plans: return "Plans"
        }
    }

    var systemImageName: String {
        switch self {
        case .terminal: return "terminal"
        case .diffs: return "doc.plaintext"
        case .ports: return "bolt.horizontal"
        case .plans: return "doc.text"
        }
    }

    var accessibilityLabel: String {
        "\(title) tab"
    }

    var accessibilityIdentifier: String {
        "worktree.tab.\(rawValue)"
    }
}
