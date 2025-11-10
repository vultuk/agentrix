# Agentrix Mobile (iOS)

SwiftUI 5 app that mirrors the Agentrix web experience: authentication, repository browser, worktree dashboards, terminal sessions, tasks, plans, and ports.

## Requirements

- Xcode 15.4 or newer (iOS 17 SDK)
- Backend running locally or remotely (default `http://127.0.0.1:3414`)

## Getting Started

1. Open `AgentrixMobile.xcodeproj` in Xcode.
2. Select the `AgentrixMobile` scheme and an iOS simulator.
3. Build & run. On first launch enter the backend base URL and password.

## Architecture

- **SwiftUI + MVVM** – feature folders under `Features/` expose a view + view model pair.
- **Services** – strongly typed networking layer that mirrors the Node/React API clients.
- **Event streams** – `/api/events` is consumed via `AsyncStream`, updating repositories, tasks, and sessions in real time.
- **Terminal** – `TerminalViewModel` wraps the `/api/terminal/open` REST call + WebSocket stream to keep logs and input in sync.

See inline doc comments for extension hooks (automation launchers, advanced git ops, etc.).
