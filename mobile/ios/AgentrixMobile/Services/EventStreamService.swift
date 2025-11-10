import Foundation

enum AgentrixEvent {
    case repositories(RepositoryEnvelope)
    case sessions([WorktreeSessionSummary])
    case tasks([TaskItem])
}

final class EventStreamService {
    private let api: AgentrixAPIClient
    private let decoder: JSONDecoder

    init(api: AgentrixAPIClient) {
        self.api = api
        self.decoder = JSONDecoder()
        self.decoder.dateDecodingStrategy = .iso8601
    }

    func connect() -> AsyncStream<AgentrixEvent> {
        AsyncStream { continuation in
            let task = Task.detached(priority: .background) {
                var retryDelay: UInt64 = 2_000_000_000 // 2 seconds
                while !Task.isCancelled {
                    do {
                        var request = URLRequest(url: self.api.config.url(for: "/api/events"))
                        request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
                        let (stream, _) = try await self.api.session.bytes(for: request)
                        retryDelay = 2_000_000_000
                        var eventName: String?
                        var dataBuffer = ""

                        for try await line in stream.lines {
                            try Task.checkCancellation()
                            if line.isEmpty {
                                if let name = eventName, !dataBuffer.isEmpty {
                                    if let event = self.decodeEvent(named: name, data: dataBuffer) {
                                        continuation.yield(event)
                                    }
                                }
                                eventName = nil
                                dataBuffer = ""
                                continue
                            }

                            if line.hasPrefix("event:") {
                                eventName = line.replacingOccurrences(of: "event:", with: "").trimmingCharacters(in: .whitespaces)
                            } else if line.hasPrefix("data:") {
                                let value = line.replacingOccurrences(of: "data:", with: "").trimmingCharacters(in: .whitespaces)
                                if !dataBuffer.isEmpty {
                                    dataBuffer.append("\n")
                                }
                                dataBuffer.append(value)
                            }
                        }
                    } catch {
                        if Task.isCancelled { break }
                        try? await Task.sleep(nanoseconds: retryDelay)
                        retryDelay = min(retryDelay * 2, 30_000_000_000)
                        continue
                    }
                }
                continuation.finish()
            }

            continuation.onTermination = { _ in
                task.cancel()
            }
        }
    }

    private func decodeEvent(named name: String, data: String) -> AgentrixEvent? {
        guard let payloadData = data.data(using: .utf8) else { return nil }
        switch name {
        case "repos:update":
            if let envelope = try? decoder.decode(RepositoryEnvelope.self, from: payloadData) {
                return .repositories(envelope)
            }
        case "sessions:update":
            if let response = try? decoder.decode(SessionsResponse.self, from: payloadData) {
                return .sessions(response.sessions)
            }
        case "tasks:update":
            if let response = try? decoder.decode(TasksResponse.self, from: payloadData) {
                return .tasks(response.tasks)
            }
        default:
            break
        }
        return nil
    }
}
