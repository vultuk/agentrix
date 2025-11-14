import Foundation
import SwiftUI

enum MarkdownRenderer {
    static func attributedString(from markdown: String) -> AttributedString {
        let trimmed = markdown.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return AttributedString() }
        let options = AttributedString.MarkdownParsingOptions(interpretedSyntax: .full)
        if let rendered = try? AttributedString(markdown: trimmed, options: options) {
            return rendered
        }
        return AttributedString(trimmed)
    }
}
