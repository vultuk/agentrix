# Agentrix Mobile (iOS)

SwiftUI 5 app that mirrors the Agentrix web experience: authentication, repository browser, worktree dashboards, terminal sessions, tasks, plans, and ports.

## Highlights

- **Multi-session terminal** – open, resume, and close multiple terminal or agent sessions, with real-time logs and reconnection support.
- **Issue hub** – view full GitHub issue details (markdown, metadata, labels) and generate execution plans directly from seeded prompts.
- **Diff viewer** – tap any entry in the Git status list to preview the underlying patch before committing changes.
- **Plan composer** – craft ad-hoc automation plans with a rich prompt editor and quick copy controls.

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
- **Terminal** – `TerminalSessionsStore` coordinates `/api/terminal/open` + WebSocket streaming for multi-session lifecycle.
- **Issue + Plan flows** – `IssueDetailSheet` and `PlanComposerView` wrap the `/api/repos/issue` and `/api/create-plan` endpoints for assisted planning.
- **Git diffs** – `GitDiffSheet` renders `/api/git/diff` responses inline with status sections.

See inline doc comments for extension hooks (automation launchers, advanced git ops, etc.).

## Testing

- Unit tests live in `AgentrixMobileTests`.
- The suite uses a `MockURLProtocol` to simulate backend responses. Run with `⌘U` in Xcode or `xcodebuild test` from the project root.

## Archiving & Watch Companion

- Archive the iOS app with `xcodebuild -project Agentrix.xcodeproj -scheme Agentrix -destination 'generic/platform=iOS' archive -archivePath build/Agentrix`.
- Before releasing, run `./mobile/ios/scripts/verify-watch-bundle.sh` to ensure the watch target is marked `SKIP_INSTALL = YES`; this keeps the watch app embedded under the iOS bundle and prevents “Generic Xcode Archive” issues.
- After archiving, run `./mobile/ios/scripts/verify-watch-profiles.sh build/Agentrix.xcarchive` to confirm both the watch app and its extension are signed with the explicit `me.simonskinner.agentrix.watch*` provisioning profiles before installing to a real device.
- The resulting archive should contain a single installable `Agentrix.app` with `AgentrixWatch.app` nested inside `Agentrix.app/Watch/`.
