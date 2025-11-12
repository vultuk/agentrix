import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

extension Color {
    static let agentrixAccent = Color(red: 0.1960784314, green: 0.7019607843, blue: 0.9803921569)
    static let agentrixError = Color(red: 0.85, green: 0.22, blue: 0.2)
}

#if canImport(UIKit)
extension UIColor {
    static let agentrixAccent = UIColor(red: 0.1960784314, green: 0.7019607843, blue: 0.9803921569, alpha: 1)
    static let agentrixError = UIColor(red: 0.85, green: 0.22, blue: 0.2, alpha: 1)
}
#endif

