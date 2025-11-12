import Foundation

struct CommandConfigResponse: Decodable {
    let commands: CommandConfigValues
}

struct CommandConfigValues: Decodable {
    let codex: String?
    let codexDangerous: String?
    let claude: String?
    let claudeDangerous: String?
    let cursor: String?
    let vscode: String?
}

struct CommandConfig: Equatable {
    let codex: String
    let codexDangerous: String
    let claude: String
    let claudeDangerous: String
    let cursor: String
    let vscode: String

    static let defaults = CommandConfig(
        codex: "codex",
        codexDangerous: "codex --dangerously-bypass-approvals-and-sandbox",
        claude: "claude",
        claudeDangerous: "claude --dangerously-skip-permissions",
        cursor: "cursor-agent",
        vscode: "code ."
    )
}

extension CommandConfig {
    init(values: CommandConfigValues) {
        self.codex = CommandConfig.normalise(values.codex, fallback: CommandConfig.defaults.codex)
        self.codexDangerous = CommandConfig.normalise(values.codexDangerous, fallback: CommandConfig.defaults.codexDangerous)
        self.claude = CommandConfig.normalise(values.claude, fallback: CommandConfig.defaults.claude)
        self.claudeDangerous = CommandConfig.normalise(values.claudeDangerous, fallback: CommandConfig.defaults.claudeDangerous)
        self.cursor = CommandConfig.normalise(values.cursor, fallback: CommandConfig.defaults.cursor)
        self.vscode = CommandConfig.normalise(values.vscode, fallback: CommandConfig.defaults.vscode)
    }

    private static func normalise(_ input: String?, fallback: String) -> String {
        guard let input else { return fallback }
        let trimmed = input.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? fallback : trimmed
    }
}

