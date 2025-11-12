import SwiftTerm

#if canImport(UIKit)
import UIKit

/// `TerminalView` subclass that owns all keyboard focus and forwards bytes once.
final class CustomTerminalView: TerminalView {
    private var hasActivatedFirstResponder = false

    override init(frame: CGRect) {
        super.init(frame: frame)
        delaysContentTouches = false
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        guard !hasActivatedFirstResponder else { return }
        hasActivatedFirstResponder = true
        DispatchQueue.main.async { [weak self] in
            _ = self?.becomeFirstResponder()
        }
    }

    override func insertText(_ text: String) {
        // Skip UIKit text system to avoid duplicate echoes.
        forwardInput(Array(text.utf8))
    }

    override func deleteBackward() {
        // Send DEL manually so only tmux/shell echoes back.
        forwardInput([UInt8(0x7f)])
    }

    private func forwardInput(_ bytes: [UInt8]) {
        guard !bytes.isEmpty else { return }
        terminalDelegate?.send(source: self, data: bytes[...])
    }
}
#endif

#if canImport(AppKit)
import AppKit

typealias CustomTerminalView = TerminalView
#endif
