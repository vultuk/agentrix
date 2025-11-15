#if canImport(CarPlay)
import AVFoundation
import CarPlay
import Combine
import Foundation

@MainActor
final class CodexCarPlayManager: NSObject {
    private weak var interfaceController: CPInterfaceController?
    private var cancellable: AnyCancellable?
    private let bridge: CodexCarPlayBridge
    private let speechSynthesizer = AVSpeechSynthesizer()
    private var latestSnapshot: CodexWatchSnapshot?

    init(bridge: CodexCarPlayBridge = .shared) {
        self.bridge = bridge
    }

    func connect(interfaceController: CPInterfaceController) {
        self.interfaceController = interfaceController
        cancellable = bridge.$snapshot.sink { [weak self] snapshot in
            self?.latestSnapshot = snapshot
            self?.reloadTemplate()
        }
        reloadTemplate()
    }

    func disconnect() {
        cancellable?.cancel()
        cancellable = nil
        interfaceController = nil
    }
}

// MARK: - Template handling

@MainActor
private extension CodexCarPlayManager {
    func reloadTemplate() {
        guard let controller = interfaceController else { return }
        let template = makeTemplate(for: latestSnapshot)
        controller.setRootTemplate(template, animated: true)
    }

    func makeTemplate(for snapshot: CodexWatchSnapshot?) -> CPTemplate {
        guard let snapshot, !snapshot.sessions.isEmpty else {
            let messageItem = CPListItem(text: "Open a worktree in Agentrix", detailText: "Codex chats sync when active")
            let section = CPListSection(items: [messageItem])
            let template = CPListTemplate(title: "Codex", sections: [section])
            template.delegate = self
            return template
        }

        let sections = snapshot.sessions.map { session -> CPListSection in
            let item = CPListItem(
                text: session.label.isEmpty ? "Codex SDK" : session.label,
                detailText: "\(session.repo)/\(session.branch)"
            )
            item.userInfo = session.id
            if let preview = session.latestPreview {
                item.detailText = preview
            }
            return CPListSection(items: [item])
        }
        let template = CPListTemplate(title: "Codex Sessions", sections: sections)
        template.delegate = self
        return template
    }

    func handleSelection(sessionId: String) {
        guard let session = latestSnapshot?.sessions.first(where: { $0.id == sessionId }) else { return }
        speakLatestMessage(for: session)
        presentReplyInput(for: session)
    }

    func speakLatestMessage(for session: CodexWatchSnapshot.Session) {
        guard let message = session.messages.last else { return }
        let utterance = AVSpeechUtterance(string: message.text)
        utterance.voice = AVSpeechSynthesisVoice(language: "en-US")
        speechSynthesizer.speak(utterance)
    }

    func presentReplyInput(for session: CodexWatchSnapshot.Session) {
        guard let controller = interfaceController else { return }
        controller.presentTextInputController(withTitle: "Reply to \(session.label)", text: nil, style: .default) { [weak self] results in
            guard
                let text = results?.first?.trimmingCharacters(in: .whitespacesAndNewlines),
                !text.isEmpty
            else {
                return
            }
            Task {
                let success = await self?.bridge.sendMessage(text, sessionId: session.id) ?? false
                await self?.presentSendResult(success: success)
            }
        }
    }

    func presentSendResult(success: Bool) async {
        guard let controller = interfaceController else { return }
        let message = success ? "Sent" : "Unable to send"
        let action = CPAlertAction(title: "OK") { _ in }
        let template = CPAlertTemplate(titleVariants: [message], actions: [action])
        controller.presentTemplate(template, animated: true)
    }
}

extension CodexCarPlayManager: CPListTemplateDelegate {
    func listTemplate(_ listTemplate: CPListTemplate, didSelect item: CPListItem, completionHandler: @escaping () -> Void) {
        if let sessionId = item.userInfo as? String {
            handleSelection(sessionId: sessionId)
        }
        completionHandler()
    }
}
#endif
