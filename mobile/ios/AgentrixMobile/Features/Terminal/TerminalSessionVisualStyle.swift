import SwiftUI

struct TerminalSessionVisualStyle {
    enum Kind: Equatable {
        case terminal
        case agent
        case unknown(String)
    }

    let kind: Kind
    let badgeLabel: String
    let sessionTypeAnnouncement: String
    let accentColor: Color

    init(snapshot: WorktreeSessionSnapshot) {
        if let tool = snapshot.sessionTool {
            switch tool {
            case .terminal:
                kind = .terminal
                badgeLabel = tool.displayName
                sessionTypeAnnouncement = tool.accessibilityLabel
                accentColor = .agentrixAccent
            case .agent:
                kind = .agent
                badgeLabel = tool.displayName
                sessionTypeAnnouncement = tool.accessibilityLabel
                accentColor = .agentrixAutomationAccent
            }
        } else {
            kind = .unknown(snapshot.tool)
            badgeLabel = snapshot.tool.isEmpty ? "Session" : snapshot.tool.capitalized
            sessionTypeAnnouncement = snapshot.sessionAccessibilityLabel
            accentColor = Color.white.opacity(0.7)
        }
    }

    func borderColor(isActive: Bool) -> Color {
        accentColor.opacity(isActive ? 0.95 : 0.35)
    }

    func statusIndicatorColor(isActive: Bool) -> Color {
        accentColor.opacity(isActive ? 1.0 : 0.7)
    }

    func badgeBackground(isActive: Bool) -> Color {
        accentColor.opacity(isActive ? 0.3 : 0.18)
    }

    var badgeForeground: Color {
        Color.black.opacity(0.92)
    }

    func accessibilityValue(isActive: Bool, isIdle: Bool, isClosing: Bool) -> String {
        var segments: [String] = [sessionTypeAnnouncement]
        segments.append(isActive ? "Active" : "Inactive")
        if isIdle {
            segments.append("Idle")
        }
        if isClosing {
            segments.append("Closing")
        }
        return segments.joined(separator: ", ")
    }
}
