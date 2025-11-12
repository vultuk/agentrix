import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

struct PlanComposerView: View {
    @ObservedObject var viewModel: WorktreeDetailViewModel
    @State private var promptText: String
    @State private var generatedPlan: String?
    @State private var isGenerating = false
    @State private var planError: String?
    @State private var copyFeedback: String?
    @State private var copyTask: Task<Void, Never>? = nil

    let title: String

    init(viewModel: WorktreeDetailViewModel, initialPrompt: String, title: String = "Generate Plan") {
        self.viewModel = viewModel
        _promptText = State(initialValue: initialPrompt)
        self.title = title
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title)
                .font(.headline)

            TextEditor(text: $promptText)
                .frame(minHeight: 180)
                .padding(8)
                .background(Color.gray.opacity(0.12))
                .clipShape(RoundedRectangle(cornerRadius: 8))
                #if os(iOS)
                .textInputAutocapitalization(.never)
                #endif

            if let planError {
                Text(planError)
                    .font(.caption)
                    .foregroundStyle(Color.agentrixError)
            }

            HStack {
                Spacer()
                if isGenerating {
                    ProgressView("Generating…")
                        .padding(.vertical, 6)
                } else {
                    Button {
                        Task { await generatePlan() }
                    } label: {
                        Label("Generate Plan", systemImage: "sparkles")
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(promptText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }

            if let generatedPlan {
                Divider()
                Text("Generated Plan")
                    .font(.headline)
                ScrollView {
                    Text(generatedPlan)
                        .font(.system(.body, design: .monospaced))
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding()
                        .background(Color.gray.opacity(0.12))
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                }
                Button {
                    copyPlan(generatedPlan)
                } label: {
                    Label("Copy Plan", systemImage: "doc.on.doc")
                }
                .buttonStyle(.bordered)
            }

            if let copyFeedback {
                Text(copyFeedback)
                    .font(.caption)
                    .foregroundStyle(Color.agentrixAccent)
            }
        }
        .onChange(of: promptText) { _ in
            planError = nil
        }
        .onDisappear {
            copyTask?.cancel()
        }
    }

    private func generatePlan() async {
        let trimmed = promptText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            planError = "Enter a prompt before generating a plan."
            return
        }
        isGenerating = true
        planError = nil
        do {
            let plan = try await viewModel.createPlan(prompt: trimmed)
            await MainActor.run {
                generatedPlan = plan
                planError = nil
            }
        } catch let error as AgentrixError {
            await MainActor.run {
                planError = error.errorDescription
            }
        } catch {
            await MainActor.run {
                planError = error.localizedDescription
            }
        }
        isGenerating = false
    }

    private func copyPlan(_ plan: String) {
#if canImport(UIKit)
        UIPasteboard.general.string = plan
#endif
        copyTask?.cancel()
        copyTask = Task {
            await MainActor.run {
                copyFeedback = "Plan copied to clipboard."
            }
            try? await Task.sleep(nanoseconds: 1_500_000_000)
            await MainActor.run {
                copyFeedback = nil
            }
        }
    }
}

