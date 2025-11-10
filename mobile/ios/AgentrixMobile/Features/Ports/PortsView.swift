import SwiftUI

struct PortsView: View {
    let ports: [Int]
    let tunnels: [PortTunnel]
    let refreshAction: () -> Void
    let openTunnel: (Int) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Active Ports")
                    .font(.headline)
                Spacer()
                Button(action: refreshAction) {
                    Image(systemName: "arrow.clockwise")
                }
            }

            if ports.isEmpty {
                ContentUnavailableView("No ports", systemImage: "bolt.horizontal", description: Text("Services publish here when they listen on TCP."))
            } else {
                ForEach(ports, id: \.self) { port in
                    VStack(alignment: .leading) {
                        Text("Port \(port)")
                            .bold()
                        if let tunnel = tunnels.first(where: { $0.port == port }) {
                            Link(tunnel.url.absoluteString, destination: tunnel.url)
                                .font(.caption)
                                .foregroundColor(.blue)
                        } else {
                            Button("Open Tunnel") {
                                openTunnel(port)
                            }
                            .buttonStyle(.bordered)
                        }
                    }
                    .padding()
                    .background(.thinMaterial)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                }
            }
        }
    }
}
