import SwiftUI

struct TerminalConsoleView: View {
    @ObservedObject var viewModel: TerminalViewModel
    @State private var autoscrollAnchor = UUID()

    var body: some View {
        VStack(spacing: 8) {
            ScrollViewReader { proxy in
                ScrollView {
                    Text(viewModel.log)
                        .font(.system(.body, design: .monospaced))
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding()
                        .id(autoscrollAnchor)
                }
                .background(.black.opacity(0.9))
                .cornerRadius(8)
                .onChange(of: viewModel.log) { _ in
                    autoscrollAnchor = UUID()
                    withAnimation(.easeOut) {
                        proxy.scrollTo(autoscrollAnchor, anchor: .bottom)
                    }
                }
            }

            HStack {
                TextField("Command", text: $viewModel.input)
                    .textInputAutocapitalization(TextInputAutocapitalization.never)
                    .font(.system(.body, design: .monospaced))
                    .submitLabel(.send)
                    .onSubmit { viewModel.sendCurrentInput() }
                Button("Send") {
                    viewModel.sendCurrentInput()
                }
                .buttonStyle(.borderedProminent)
            }
        }
        .onAppear {
            Task { await viewModel.connect() }
        }
        .onDisappear {
            viewModel.disconnect()
        }
    }
}
