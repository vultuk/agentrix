import Foundation
import SwiftUI

enum MarkdownRenderer {
    static func attributedString(from markdown: String) -> AttributedString {
        (try? AttributedString(markdown: markdown)) ?? AttributedString(markdown)
    }
}
