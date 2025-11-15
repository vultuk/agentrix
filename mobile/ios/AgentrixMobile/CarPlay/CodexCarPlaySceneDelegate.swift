#if canImport(CarPlay)
import CarPlay

final class CodexCarPlaySceneDelegate: UIResponder, CPTemplateApplicationSceneDelegate {
    private let manager = CodexCarPlayManager()

    func templateApplicationScene(_ templateApplicationScene: CPTemplateApplicationScene, didConnect interfaceController: CPInterfaceController) {
        manager.connect(interfaceController: interfaceController)
    }

    func templateApplicationScene(_ templateApplicationScene: CPTemplateApplicationScene, didDisconnect interfaceController: CPInterfaceController) {
        manager.disconnect()
    }
}
#endif
