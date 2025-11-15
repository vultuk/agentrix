import Foundation
import WatchConnectivity

@MainActor
final class CodexWatchSessionStore: NSObject, ObservableObject {
    @Published private(set) var snapshot: CodexWatchSnapshot?
    @Published private(set) var isLoading = false
    @Published private(set) var sendingSessionIds: Set<String> = []
    @Published var errorMessage: String?

    private let decoder: JSONDecoder
    private let session: WCSession?

    override init() {
        if WCSession.isSupported() {
            self.session = WCSession.default
        } else {
            self.session = nil
        }
        self.decoder = JSONDecoder()
        self.decoder.dateDecodingStrategy = .iso8601
        super.init()
        session?.delegate = self
        session?.activate()
    }

    var sessions: [CodexWatchSnapshot.Session] {
        snapshot?.sessions.sorted(by: { lhs, rhs in
            (lhs.lastActivityAt ?? lhs.createdAt) > (rhs.lastActivityAt ?? rhs.createdAt)
        }) ?? []
    }

    var worktreeDescription: String? {
        guard let context = snapshot?.worktree else { return nil }
        return "\(context.org)/\(context.repo) • \(context.branch)"
    }

    func session(withId id: String) -> CodexWatchSnapshot.Session? {
        snapshot?.sessions.first(where: { $0.id == id })
    }

    func handleAppear() {
        if snapshot == nil {
            refresh()
        }
    }

    func refresh() {
        guard let session = session else {
            errorMessage = "Paired iPhone required"
            return
        }
        guard session.isReachable else {
            errorMessage = "Open Agentrix on iPhone"
            return
        }
        isLoading = true
        let message: [String: Any] = ["type": "codex.watch.snapshot"]
        session.sendMessage(
            message,
            replyHandler: { response in
                Task { await self.handleSnapshotResponse(response) }
            },
            errorHandler: { error in
                Task { @MainActor in
                    self.isLoading = false
                    self.errorMessage = error.localizedDescription
                }
            }
        )
    }

    func sendMessage(_ text: String, sessionId: String) async -> Bool {
        guard let session = session else {
            errorMessage = "Paired iPhone required"
            return false
        }
        guard session.isReachable else {
            errorMessage = "Open Agentrix on iPhone"
            return false
        }
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return false }
        sendingSessionIds.insert(sessionId)
        defer { sendingSessionIds.remove(sessionId) }

        return await withCheckedContinuation { continuation in
            let message: [String: Any] = [
                "type": "codex.watch.send-message",
                "sessionId": sessionId,
                "text": trimmed
            ]
                session.sendMessage(
                    message,
                    replyHandler: { response in
                        Task { @MainActor in
                            let status = response["status"] as? String
                            if status == "ok" {
                                self.errorMessage = nil
                                continuation.resume(returning: true)
                            } else {
                                self.errorMessage = response["message"] as? String ?? "Unable to send message"
                            continuation.resume(returning: false)
                        }
                    }
                },
                errorHandler: { error in
                    Task { @MainActor in
                        self.errorMessage = error.localizedDescription
                        continuation.resume(returning: false)
                    }
                }
            )
        }
    }

    private func handleSnapshotResponse(_ response: [String: Any]) async {
        isLoading = false
        guard let status = response["status"] as? String else {
            errorMessage = "Invalid reply"
            return
        }
        guard status == "ok" else {
            errorMessage = response["message"] as? String ?? "Unable to load Codex"
            return
        }
        guard let data = response["payload"] as? Data else {
            errorMessage = "Missing payload"
            return
        }
        await decodeSnapshotData(data)
    }

    private func decodeSnapshotData(_ data: Data) async {
        do {
            let snapshot = try decoder.decode(CodexWatchSnapshot.self, from: data)
            applySnapshot(snapshot)
            errorMessage = nil
        } catch {
            errorMessage = "Decoding failed"
        }
    }

    private func applySnapshot(_ snapshot: CodexWatchSnapshot) {
        self.snapshot = snapshot
    }
}

extension CodexWatchSessionStore: WCSessionDelegate {
    nonisolated func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {}

    nonisolated func sessionReachabilityDidChange(_ session: WCSession) {
        if session.isReachable {
            Task { await MainActor.run { self.refresh() } }
        }
    }

    nonisolated func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String : Any]) {
        guard let data = applicationContext["payload"] as? Data else { return }
        Task { await self.decodeSnapshotData(data) }
    }
}
