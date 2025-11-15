import XCTest
@testable import AgentrixMobile

final class CodexWatchSnapshotBuilderTests: XCTestCase {
    func testSnapshotIncludesSessionsAndWorktreeMetadata() {
        let builder = CodexWatchSnapshotBuilder()
        let worktree = WorktreeReference(org: "acme", repo: "web", branch: "feature/login")
        let now = Date()
        let summary = CodexSdkSessionSummary(
            id: "abc",
            org: "acme",
            repo: "web",
            branch: "feature/login",
            label: "Auth bot",
            createdAt: now.addingTimeInterval(-60),
            lastActivityAt: now
        )
        let events = [
            CodexSdkEvent(
                type: .userMessage,
                id: "1",
                text: "status",
                message: nil,
                status: nil,
                level: nil,
                timestamp: now.addingTimeInterval(-30),
                usage: nil
            ),
            CodexSdkEvent(
                type: .agentResponse,
                id: "2",
                text: nil,
                message: "Server looks good",
                status: nil,
                level: nil,
                timestamp: now.addingTimeInterval(-20),
                usage: nil
            )
        ]

        let snapshot = builder.makeSnapshot(
            worktree: worktree,
            sessions: [summary],
            eventsBySession: ["abc": events]
        )

        XCTAssertEqual(snapshot.worktree?.id, worktree.id)
        XCTAssertEqual(snapshot.sessions.count, 1)
        let session = snapshot.sessions.first
        XCTAssertEqual(session?.id, "abc")
        XCTAssertEqual(session?.latestPreview, "Server looks good")
        XCTAssertEqual(session?.messages.count, 2)
    }

    func testSnapshotFiltersUnsupportedEvents() {
        let builder = CodexWatchSnapshotBuilder()
        let worktree = WorktreeReference(org: "acme", repo: "web", branch: "main")
        let now = Date()
        let summary = CodexSdkSessionSummary(
            id: "chat-1",
            org: "acme",
            repo: "web",
            branch: "main",
            label: "Prod triage",
            createdAt: now.addingTimeInterval(-600),
            lastActivityAt: now
        )
        let events = [
            CodexSdkEvent(
                type: .ready,
                id: "ready",
                text: nil,
                message: "Ready",
                status: nil,
                level: nil,
                timestamp: now.addingTimeInterval(-500),
                usage: nil
            ),
            CodexSdkEvent(
                type: .userMessage,
                id: "m-1",
                text: "deploy?",
                message: nil,
                status: nil,
                level: nil,
                timestamp: now.addingTimeInterval(-400),
                usage: nil
            ),
            CodexSdkEvent(
                type: .thinking,
                id: "think-1",
                text: "Working…",
                message: nil,
                status: nil,
                level: nil,
                timestamp: now.addingTimeInterval(-350),
                usage: nil
            ),
            CodexSdkEvent(
                type: .agentResponse,
                id: "res-1",
                text: nil,
                message: "Ship it",
                status: nil,
                level: nil,
                timestamp: now.addingTimeInterval(-300),
                usage: nil
            ),
            CodexSdkEvent(
                type: .log,
                id: "log",
                text: nil,
                message: "log line",
                status: nil,
                level: nil,
                timestamp: now.addingTimeInterval(-250),
                usage: nil
            )
        ]

        let snapshot = builder.makeSnapshot(
            worktree: worktree,
            sessions: [summary],
            eventsBySession: ["chat-1": events]
        )

        guard let messages = snapshot.sessions.first?.messages else {
            XCTFail("Expected messages in snapshot")
            return
        }
        XCTAssertEqual(messages.map(\.role), [.user, .agent])
        XCTAssertEqual(messages.map(\.text), ["deploy?", "Ship it"])
    }
}
