import SwiftUI
import UIKit

struct AuthView: View {
    @StateObject var viewModel: AuthViewModel

    init(viewModel: AuthViewModel) {
        _viewModel = StateObject(wrappedValue: viewModel)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Server") {
                    TextField("Base URL", text: $viewModel.baseURLString)
                        .textInputAutocapitalization(TextInputAutocapitalization.never)
                        .keyboardType(UIKeyboardType.URL)
                    Button("Apply") {
                        viewModel.updateBaseURL()
                    }
                }

                Section("Login") {
                    SecureField("Password", text: $viewModel.password)
                    Toggle("Remember password", isOn: $viewModel.rememberPassword)
                }

                if let error = viewModel.errorMessage {
                    Section {
                        Text(error)
                            .font(.footnote)
                            .foregroundColor(.red)
                    }
                }

                Section {
                    Button {
                        Task { await viewModel.submit() }
                    } label: {
                        if viewModel.isLoading {
                            ProgressView()
                                .progressViewStyle(.circular)
                        } else {
                            Text("Sign In")
                                .bold()
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .frame(maxWidth: .infinity)
                    .disabled(viewModel.isLoading)
                }
            }
            .navigationTitle("Agentrix Login")
        }
    }
}
