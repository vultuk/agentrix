import XCTest
import SwiftUI
import UIKit
@testable import AgentrixMobile

final class TerminalSessionStyleTests: XCTestCase {
    func testTerminalStyleUsesAccentPalette() {
        let snapshot = makeSnapshot(tool: "terminal")
        let style = TerminalSessionVisualStyle(snapshot: snapshot)

        assertColorsEqual(style.accentColor, .agentrixAccent)
        XCTAssertEqual(style.badgeLabel, "Terminal")
        XCTAssertEqual(style.sessionTypeAnnouncement, "Terminal session")

        let accessibility = style.accessibilityValue(isActive: true, isIdle: false, isClosing: false)
        XCTAssertTrue(accessibility.contains("Terminal session"))
        XCTAssertTrue(accessibility.contains("Active"))
    }

    func testAgentStyleUsesAutomationPalette() {
        let snapshot = makeSnapshot(tool: "agent")
        let style = TerminalSessionVisualStyle(snapshot: snapshot)

        assertColorsEqual(style.accentColor, .agentrixAutomationAccent)
        XCTAssertEqual(style.badgeLabel, "Agent")

        let activeBorder = style.borderColor(isActive: true)
        let inactiveBorder = style.borderColor(isActive: false)
        XCTAssertNotEqual(colorSignature(activeBorder), colorSignature(inactiveBorder))
    }

    func testUnknownToolFallsBackToNeutralPalette() {
        let snapshot = makeSnapshot(tool: "custom")
        let style = TerminalSessionVisualStyle(snapshot: snapshot)

        XCTAssertEqual(style.badgeLabel, "Custom")
        XCTAssertEqual(style.sessionTypeAnnouncement, "Custom session")
        let accessibility = style.accessibilityValue(isActive: false, isIdle: true, isClosing: true)
        XCTAssertTrue(accessibility.contains("Inactive"))
        XCTAssertTrue(accessibility.contains("Idle"))
        XCTAssertTrue(accessibility.contains("Closing"))
    }

    func testBadgeBackgroundRespondsToActivation() {
        let snapshot = makeSnapshot(tool: "agent")
        let style = TerminalSessionVisualStyle(snapshot: snapshot)

        let activeBackground = style.badgeBackground(isActive: true)
        let inactiveBackground = style.badgeBackground(isActive: false)

        let activeAlpha = colorSignature(activeBackground).alpha
        let inactiveAlpha = colorSignature(inactiveBackground).alpha
        XCTAssertGreaterThan(activeAlpha, inactiveAlpha)
    }

    // MARK: - Helpers

    private func makeSnapshot(tool: String, idle: Bool = false) -> WorktreeSessionSnapshot {
        WorktreeSessionSnapshot(
            id: UUID().uuidString,
            label: "\(tool.capitalized) Session",
            kind: tool == "agent" ? "automation" : "interactive",
            tool: tool,
            idle: idle,
            usingTmux: false,
            lastActivityAt: Date(),
            createdAt: Date(),
            tmuxSessionName: nil
        )
    }

    private func assertColorsEqual(_ lhs: Color, _ rhs: Color, accuracy: CGFloat = 0.001, file: StaticString = #filePath, line: UInt = #line) {
        let left = colorSignature(lhs)
        let right = colorSignature(rhs)
        XCTAssertEqual(left.red, right.red, accuracy: accuracy, file: file, line: line)
        XCTAssertEqual(left.green, right.green, accuracy: accuracy, file: file, line: line)
        XCTAssertEqual(left.blue, right.blue, accuracy: accuracy, file: file, line: line)
        XCTAssertEqual(left.alpha, right.alpha, accuracy: accuracy, file: file, line: line)
    }

    private func colorSignature(_ color: Color) -> (red: CGFloat, green: CGFloat, blue: CGFloat, alpha: CGFloat) {
        var red: CGFloat = 0
        var green: CGFloat = 0
        var blue: CGFloat = 0
        var alpha: CGFloat = 0
        UIColor(color).getRed(&red, green: &green, blue: &blue, alpha: &alpha)
        return (red, green, blue, alpha)
    }
}
