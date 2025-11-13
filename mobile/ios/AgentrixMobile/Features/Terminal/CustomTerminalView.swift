import SwiftTerm

#if canImport(UIKit)
import UIKit
import ObjectiveC.runtime

/// `TerminalView` subclass that owns all keyboard focus and forwards bytes once.
final class CustomTerminalView: TerminalView {
    private var didPerformInitialFocus = false
    private var keyboardDismissedByUser = false
    private static let keyboardOverrides: Void = {
        overrideSelector(#selector(deleteBackward), with: #selector(agentrix_deleteBackwardShim))
    }()
    #if os(iOS) && !targetEnvironment(macCatalyst)
    private lazy var keyboardDismissButton: UIBarButtonItem = {
        let button = UIBarButtonItem(
            title: "Done",
            style: .done,
            target: self,
            action: #selector(handleAccessoryDismissButton)
        )
        button.accessibilityIdentifier = "terminal.keyboard.dismiss"
        return button
    }()
    private lazy var refocusTapRecognizer: UITapGestureRecognizer = {
        let recognizer = UITapGestureRecognizer(target: self, action: #selector(handleRefocusTap(_:)))
        recognizer.cancelsTouchesInView = false
        recognizer.delegate = self
        return recognizer
    }()
    #endif

    override init(frame: CGRect) {
        Self.installKeyboardOverrides()
        super.init(frame: frame)
        delaysContentTouches = false
        #if os(iOS) && !targetEnvironment(macCatalyst)
        addGestureRecognizer(refocusTapRecognizer)
        configureInputAssistant()
        #endif
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func willMove(toWindow newWindow: UIWindow?) {
        super.willMove(toWindow: newWindow)
        guard newWindow == nil else { return }
        didPerformInitialFocus = false
        keyboardDismissedByUser = false
    }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        guard window != nil else { return }
        guard !didPerformInitialFocus else { return }
        didPerformInitialFocus = true
        requestKeyboardFocusIfEligible(force: true)
    }

    override func becomeFirstResponder() -> Bool {
        let became = super.becomeFirstResponder()
        if became {
            keyboardDismissedByUser = false
        }
        return became
    }

    override func resignFirstResponder() -> Bool {
        let resigned = super.resignFirstResponder()
        if resigned, window != nil {
            keyboardDismissedByUser = true
        }
        return resigned
    }

    func requestKeyboardFocus() {
        keyboardDismissedByUser = false
        requestKeyboardFocusIfEligible(force: true)
    }

    func requestKeyboardDismissal() {
        guard window != nil else { return }
        keyboardDismissedByUser = true
        _ = resignFirstResponder()
    }

    private func requestKeyboardFocusIfEligible(force: Bool = false) {
        guard window != nil else { return }
        guard force || !keyboardDismissedByUser else { return }
        guard !isFirstResponder else { return }
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            guard self.window != nil else { return }
            guard force || !self.keyboardDismissedByUser else { return }
            _ = self.becomeFirstResponder()
        }
    }

    #if os(iOS) && !targetEnvironment(macCatalyst)
    override func insertText(_ text: String) {
        // Skip UIKit text system to avoid duplicate echoes.
        forwardInput(Array(text.utf8))
    }

    @objc private func handleAccessoryDismissButton() {
        requestKeyboardDismissal()
    }

    @objc private func handleRefocusTap(_ recognizer: UITapGestureRecognizer) {
        guard recognizer.state == .ended else { return }
        guard keyboardDismissedByUser else { return }
        requestKeyboardFocus()
    }

    private func configureInputAssistant() {
        let group = UIBarButtonItemGroup(barButtonItems: [keyboardDismissButton], representativeItem: nil)
        inputAssistantItem.trailingBarButtonGroups = [group]
        inputAssistantItem.leadingBarButtonGroups = []
    }
    #endif

    private func forwardInput(_ bytes: [UInt8]) {
        guard !bytes.isEmpty else { return }
        terminalDelegate?.send(source: self, data: bytes[...])
    }

    private static func installKeyboardOverrides() {
        _ = keyboardOverrides
    }

    private static func overrideSelector(_ original: Selector, with replacement: Selector) {
        guard
            let originalMethod = class_getInstanceMethod(TerminalView.self, original),
            let replacementMethod = class_getInstanceMethod(CustomTerminalView.self, replacement)
        else {
            return
        }
        let imp = method_getImplementation(replacementMethod)
        let types = method_getTypeEncoding(originalMethod)
        if !class_addMethod(CustomTerminalView.self, original, imp, types) {
            class_replaceMethod(CustomTerminalView.self, original, imp, types)
        }
    }

    @objc private func agentrix_deleteBackwardShim() {
        // Send DEL manually so only tmux/shell echoes back.
        forwardInput([UInt8(0x7f)])
    }
}

#if os(iOS) && !targetEnvironment(macCatalyst)
extension CustomTerminalView: UIGestureRecognizerDelegate {
    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer) -> Bool {
        true
    }
}
#endif
#endif

#if canImport(AppKit)
import AppKit

typealias CustomTerminalView = TerminalView
#endif
