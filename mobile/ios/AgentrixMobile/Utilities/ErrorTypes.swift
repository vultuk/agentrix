import Foundation

enum AgentrixError: LocalizedError, Equatable {
    case unreachable
    case unauthorized
    case decodingFailed
    case invalidResponse
    case server(message: String)
    case custom(message: String)

    var errorDescription: String? {
        switch self {
        case .unreachable:
            return "Unable to reach the Agentrix backend. Check the base URL and network connection."
        case .unauthorized:
            return "Authentication required. Please log in again."
        case .decodingFailed:
            return "The server response was not understood."
        case .invalidResponse:
            return "The server returned an unexpected response."
        case .server(let message), .custom(let message):
            return message
        }
    }
}
