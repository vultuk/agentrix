import SwiftUI
import SwiftTerm
#if canImport(UIKit)
import UIKit
#elseif canImport(AppKit)
import AppKit
#endif
import UniformTypeIdentifiers

final class TerminalOutputAccumulator {
    private var buffer = Data()
    private var flushScheduled = false
    private var generation = 0

    func reset() {
        buffer.removeAll(keepingCapacity: true)
        flushScheduled = false
        generation &+= 1
    }

    func append(_ data: Data) {
        guard !data.isEmpty else { return }
        buffer.append(data)
    }

    func flush(into view: TerminalView) {
        guard !buffer.isEmpty else { return }
        let bytes = Array(buffer)
        buffer.removeAll(keepingCapacity: true)
        view.feed(byteArray: bytes[...])
    }

    func scheduleFlush(into view: TerminalView) {
        guard !flushScheduled else { return }
        flushScheduled = true
        let activeGeneration = generation
        DispatchQueue.main.async { [weak self, weak view] in
            guard let self else { return }
            self.flushScheduled = false
            guard self.generation == activeGeneration else { return }
            guard let view else { return }
            self.flush(into: view)
        }
    }
}

#if canImport(UIKit)
struct SwiftTermTerminalView: UIViewRepresentable {
    @ObservedObject var viewModel: TerminalViewModel
    private static let backgroundColor = UIColor(red: 0.04, green: 0.05, blue: 0.09, alpha: 1.0)
    private static let foregroundColor = UIColor(red: 0.85, green: 0.88, blue: 0.93, alpha: 1.0)
    private static let caretColor = UIColor(Color.agentrixAccent)

    func makeUIView(context: Context) -> CustomTerminalView {
        let terminalView = CustomTerminalView()
        configure(terminalView: terminalView, coordinator: context.coordinator)
        return terminalView
    }

    private func configure(terminalView: TerminalView, coordinator: Coordinator) {
        terminalView.translatesAutoresizingMaskIntoConstraints = false
        terminalView.backgroundColor = .clear
        terminalView.alwaysBounceVertical = true
        terminalView.alwaysBounceHorizontal = false
        terminalView.keyboardDismissMode = .interactive
        terminalView.optionAsMetaKey = true
        terminalView.contentInsetAdjustmentBehavior = .never
        terminalView.nativeBackgroundColor = Self.backgroundColor
        terminalView.nativeForegroundColor = Self.foregroundColor
        terminalView.caretColor = Self.caretColor
        terminalView.caretTextColor = UIColor.black
        terminalView.tintColor = Self.caretColor
        terminalView.autocorrectionType = .no
        terminalView.autocapitalizationType = .none
        terminalView.smartDashesType = .no
        terminalView.smartQuotesType = .no
        terminalView.smartInsertDeleteType = .no
        terminalView.spellCheckingType = .no
        coordinator.bind(to: terminalView)
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(viewModel: viewModel)
    }

    func updateUIView(_ uiView: CustomTerminalView, context: Context) {
        context.coordinator.updateTerminal(uiView)
    }

    static func dismantleUIView(_ uiView: TerminalView, coordinator: Coordinator) {
        coordinator.unbind(from: uiView)
    }

    final class Coordinator: NSObject, TerminalViewDelegate {
        private let viewModel: TerminalViewModel
        private weak var terminalView: TerminalView?
        private let outputAccumulator = TerminalOutputAccumulator()
        private lazy var outputSink: TerminalViewModel.OutputHandler = { [weak self] data, isFullReplay in
            self?.consume(data: data, isFullReplay: isFullReplay)
        }

        init(viewModel: TerminalViewModel) {
            self.viewModel = viewModel
            super.init()
        }

        func bind(to terminalView: TerminalView) {
            self.terminalView = terminalView
            terminalView.terminalDelegate = self
            Task { @MainActor in
                self.viewModel.setOutputHandler(self.outputSink)
            }
        }

        func updateTerminal(_ view: TerminalView) {
            if terminalView !== view {
                bind(to: view)
            }
            if view.terminalDelegate !== self {
                view.terminalDelegate = self
            }
        }

        func unbind(from view: TerminalView) {
            guard terminalView === view else { return }
            Task { @MainActor in
                self.viewModel.setOutputHandler(nil)
            }
            terminalView?.terminalDelegate = nil
            terminalView = nil
        }

        private func consume(data: Data, isFullReplay: Bool) {
            guard let terminalView else { return }
            if isFullReplay {
                outputAccumulator.reset()
                terminalView.getTerminal().resetToInitialState()
                terminalView.nativeBackgroundColor = SwiftTermTerminalView.backgroundColor
                terminalView.nativeForegroundColor = SwiftTermTerminalView.foregroundColor
                terminalView.caretColor = SwiftTermTerminalView.caretColor
            }
            outputAccumulator.append(data)
            outputAccumulator.scheduleFlush(into: terminalView)
        }

        // MARK: - TerminalViewDelegate

        func sizeChanged(source: TerminalView, newCols: Int, newRows: Int) {
            Task { await viewModel.sendResize(cols: newCols, rows: newRows) }
        }

        func setTerminalTitle(source: TerminalView, title: String) {
            // No-op: the host app maintains its own navigation titles.
        }

        func hostCurrentDirectoryUpdate(source: TerminalView, directory: String?) {
            // Future enhancement: surfaced in UI if needed.
        }

        func send(source: TerminalView, data: ArraySlice<UInt8>) {
            guard let string = TerminalByteStream.decodeInput(data), !string.isEmpty else { return }
            Task { await viewModel.send(input: string) }
        }

        func scrolled(source: TerminalView, position: Double) {
            // No-op: SwiftUI wrappers currently do not expose additional scroll UI.
        }

        func requestOpenLink(source: TerminalView, link: String, params: [String : String]) {
            guard let url = URL(string: link) else { return }
            Task { @MainActor in
                #if canImport(UIKit)
                UIApplication.shared.open(url)
                #elseif canImport(AppKit)
                NSWorkspace.shared.open(url)
                #endif
            }
        }

        func bell(source: TerminalView) {
            Task { @MainActor in
                #if canImport(UIKit)
                UIImpactFeedbackGenerator(style: .rigid).impactOccurred()
                #elseif canImport(AppKit)
                NSSound.beep()
                #endif
            }
        }

        func clipboardCopy(source: TerminalView, content: Data) {
            Task { @MainActor in
                if let string = String(data: content, encoding: .utf8) {
                    #if canImport(UIKit)
                    UIPasteboard.general.string = string
                    #elseif canImport(AppKit)
                    let pasteboard = NSPasteboard.general
                    pasteboard.clearContents()
                    pasteboard.setString(string, forType: .string)
                    #endif
                } else {
                    #if canImport(UIKit)
                    UIPasteboard.general.setData(content, forPasteboardType: UTType.utf8PlainText.identifier)
                    #elseif canImport(AppKit)
                    let pasteboard = NSPasteboard.general
                    pasteboard.clearContents()
                    pasteboard.setData(content, forType: .string)
                    #endif
                }
            }
        }

        func iTermContent(source: TerminalView, content: ArraySlice<UInt8>) {
            // The backend does not use OSC 1337 extensions today.
        }

        func rangeChanged(source: TerminalView, startY: Int, endY: Int) {
            // We can surface diffing updates later if needed.
        }
    }
}
#endif // canImport(UIKit)

#if canImport(AppKit)
struct SwiftTermTerminalView: NSViewRepresentable {
    @ObservedObject var viewModel: TerminalViewModel
    private static let backgroundColor = NSColor(red: 0.04, green: 0.05, blue: 0.09, alpha: 1.0)
    private static let foregroundColor = NSColor(red: 0.85, green: 0.88, blue: 0.93, alpha: 1.0)
    private static let caretColor = NSColor(Color.agentrixAccent)

    func makeCoordinator() -> Coordinator {
        Coordinator(viewModel: viewModel)
    }

    func makeNSView(context: Context) -> CustomTerminalView {
        let terminalView = CustomTerminalView()
        terminalView.translatesAutoresizingMaskIntoConstraints = false
        terminalView.wantsLayer = true
        terminalView.layer?.backgroundColor = NSColor.clear.cgColor
        terminalView.optionAsMetaKey = true
        terminalView.nativeBackgroundColor = Self.backgroundColor
        terminalView.nativeForegroundColor = Self.foregroundColor
        terminalView.caretColor = Self.caretColor
        terminalView.caretTextColor = NSColor.black
        
        // Note: localEcho property doesn't exist in SwiftTerm API (checked via Context7)
        // Deduplication in send() delegate method handles duplicate prevention
        // This prevents duplicate characters from being sent to the backend
        
        context.coordinator.bind(to: terminalView)
        
        return terminalView
    }

    func updateNSView(_ nsView: CustomTerminalView, context: Context) {
        context.coordinator.updateTerminal(nsView)
    }

    static func dismantleNSView(_ nsView: TerminalView, coordinator: Coordinator) {
        coordinator.unbind(from: nsView)
    }

    final class Coordinator: NSObject, TerminalViewDelegate {
        private let viewModel: TerminalViewModel
        private weak var terminalView: TerminalView?
        private let outputAccumulator = TerminalOutputAccumulator()
        private lazy var outputSink: TerminalViewModel.OutputHandler = { [weak self] data, isFullReplay in
            self?.consume(data: data, isFullReplay: isFullReplay)
        }

        init(viewModel: TerminalViewModel) {
            self.viewModel = viewModel
            super.init()
        }

        func bind(to terminalView: TerminalView) {
            self.terminalView = terminalView
            terminalView.terminalDelegate = self
            Task { @MainActor in
                self.viewModel.setOutputHandler(self.outputSink)
            }
        }

        func updateTerminal(_ view: TerminalView) {
            if terminalView !== view {
                bind(to: view)
            }
            
            if view.terminalDelegate !== self {
                view.terminalDelegate = self
            }

            // Ensure first responder status, but only if not already first responder
            if let window = view.window, window.firstResponder !== view {
                let targetWindow = window
                DispatchQueue.main.async { [weak view, weak targetWindow] in
                    guard
                        let view,
                        let window = targetWindow,
                        view.window === window,
                        window.firstResponder !== view
                    else { return }
                    window.makeFirstResponder(view)
                }
            }
        }

        func unbind(from view: TerminalView) {
            guard terminalView === view else { return }
            Task { @MainActor in
                self.viewModel.setOutputHandler(nil)
            }
            terminalView?.terminalDelegate = nil
            terminalView = nil
        }

        private func consume(data: Data, isFullReplay: Bool) {
            guard let terminalView else { return }
            if isFullReplay {
                outputAccumulator.reset()
                terminalView.getTerminal().resetToInitialState()
                terminalView.nativeBackgroundColor = SwiftTermTerminalView.backgroundColor
                terminalView.nativeForegroundColor = SwiftTermTerminalView.foregroundColor
                terminalView.caretColor = SwiftTermTerminalView.caretColor
            }
            outputAccumulator.append(data)
            outputAccumulator.scheduleFlush(into: terminalView)
        }

        // MARK: - TerminalViewDelegate

        func sizeChanged(source: TerminalView, newCols: Int, newRows: Int) {
            Task { await viewModel.sendResize(cols: newCols, rows: newRows) }
        }

        func setTerminalTitle(source: TerminalView, title: String) {
            // No-op: the host app maintains its own navigation titles.
        }

        func hostCurrentDirectoryUpdate(source: TerminalView, directory: String?) {
            // Future enhancement: surfaced in UI if needed.
        }

        func send(source: TerminalView, data: ArraySlice<UInt8>) {
            guard let string = TerminalByteStream.decodeInput(data), !string.isEmpty else { return }
            Task { await viewModel.send(input: string) }
        }

        func scrolled(source: TerminalView, position: Double) {
            // No-op: SwiftUI wrappers currently do not expose additional scroll UI.
        }

        func requestOpenLink(source: TerminalView, link: String, params: [String : String]) {
            guard let url = URL(string: link) else { return }
            Task { @MainActor in
                NSWorkspace.shared.open(url)
            }
        }

        func bell(source: TerminalView) {
            Task { @MainActor in
                NSSound.beep()
            }
        }

        func clipboardCopy(source: TerminalView, content: Data) {
            Task { @MainActor in
                if let string = String(data: content, encoding: .utf8) {
                    let pasteboard = NSPasteboard.general
                    pasteboard.clearContents()
                    pasteboard.setString(string, forType: .string)
                } else {
                    let pasteboard = NSPasteboard.general
                    pasteboard.clearContents()
                    pasteboard.setData(content, forType: .string)
                }
            }
        }

        func iTermContent(source: TerminalView, content: ArraySlice<UInt8>) {
            // The backend does not use OSC 1337 extensions today.
        }

        func rangeChanged(source: TerminalView, startY: Int, endY: Int) {
            // We can surface diffing updates later if needed.
        }
    }
}
#endif
