import Foundation

struct PortsResponse: Decodable {
    let ports: [Int]
}

struct PortTunnelResponse: Decodable {
    struct Tunnel: Decodable {
        let port: Int
        let url: String
        let createdAt: TimeInterval
    }
    let tunnel: Tunnel
}

struct PortTunnel: Identifiable, Hashable {
    let port: Int
    let url: URL
    let createdAt: Date

    var id: Int { port }
}
