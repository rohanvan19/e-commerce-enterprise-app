import SwiftUI
import WebKit
import CryptoKit
import Security

struct Connection: Decodable {
    let serverURL: URL
    let token: String
    let certificateSHA256: String
    func owns(_ url: URL?) -> Bool {
        guard let url else { return false }
        return url.scheme == serverURL.scheme && url.host == serverURL.host
            && (url.port ?? 443) == (serverURL.port ?? 443)
    }
}

@main
struct CocoaLocalApp: App {
    var body: some Scene {
        WindowGroup { ShopView().preferredColorScheme(.light) }
    }
}
struct ShopView: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> ShopController { ShopController() }
    func updateUIViewController(_ controller: ShopController, context: Context) {}
}

final class ShopController: UIViewController, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler, WKDownloadDelegate {
    private var connection: Connection?
    private var web: WKWebView!
    private let notice = UILabel()
    private let progress = UIProgressView(progressViewStyle: .default)
    private var observations: [NSKeyValueObservation] = []
    private var downloads: [ObjectIdentifier: URL] = [:]
    private var backButton: UIBarButtonItem!
    private let toolbar = UIToolbar()

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.98, green: 0.96, blue: 0.92, alpha: 1)
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.userContentController.add(self, name: "cocoaNative")
        configuration.userContentController.addUserScript(WKUserScript(source: """
        window.print = () => window.webkit.messageHandlers.cocoaNative.postMessage({kind:'print'});
        document.addEventListener('click', async event => {
          const anchor = event.target.closest?.('a[download]');
          if (!anchor || !anchor.href.startsWith('blob:')) return;
          event.preventDefault();
          const response = fetch(anchor.href);
          try {
            const blob = await (await response).blob();
            if (blob.size > 5 * 1024 * 1024) throw new Error('Export exceeds 5 MB');
            window.webkit.messageHandlers.cocoaNative.postMessage({kind:'csv', name:anchor.download, text:await blob.text()});
          } catch (_) { window.webkit.messageHandlers.cocoaNative.postMessage({kind:'exportError'}); }
        }, true);
        """, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        web = WKWebView(frame: .zero, configuration: configuration)
        web.navigationDelegate = self
        web.uiDelegate = self
        web.allowsBackForwardNavigationGestures = true
        web.isOpaque = false
        web.backgroundColor = view.backgroundColor
        let refresh = UIRefreshControl()
        refresh.addTarget(self, action: #selector(reload), for: .valueChanged)
        web.scrollView.refreshControl = refresh
        notice.font = .preferredFont(forTextStyle: .footnote)
        notice.textAlignment = .center
        notice.numberOfLines = 0
        notice.textColor = .secondaryLabel
        notice.isHidden = true
        backButton = UIBarButtonItem(image: UIImage(systemName: "chevron.backward"), style: .plain, target: self, action: #selector(back))
        backButton.accessibilityLabel = "Back"
        let home = UIBarButtonItem(image: UIImage(systemName: "house"), style: .plain, target: self, action: #selector(connect))
        home.accessibilityLabel = "Shop home"
        let refreshButton = UIBarButtonItem(barButtonSystemItem: .refresh, target: self, action: #selector(reload))
        let info = UIBarButtonItem(image: UIImage(systemName: "info.circle"), style: .plain, target: self, action: #selector(showConnection))
        info.accessibilityLabel = "Connection information"
        toolbar.items = [backButton, .flexibleSpace(), home, .flexibleSpace(), refreshButton, .flexibleSpace(), info]
        toolbar.tintColor = UIColor(red: 0.26, green: 0.13, blue: 0.08, alpha: 1)
        let stack = UIStackView(arrangedSubviews: [notice, progress, web, toolbar])
        stack.axis = .vertical
        stack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor),
            stack.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            stack.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor)
        ])
        observations = [
            web.observe(\.estimatedProgress, options: [.new]) { [weak self] web, _ in
                self?.progress.progress = Float(web.estimatedProgress)
                self?.progress.isHidden = web.estimatedProgress >= 1
            },
            web.observe(\.canGoBack, options: [.initial, .new]) { [weak self] web, _ in self?.backButton.isEnabled = web.canGoBack }
        ]
        do {
            guard let url = Bundle.module.url(forResource: "Connection", withExtension: "json") else { throw CocoaError(.fileNoSuchFile) }
            connection = try JSONDecoder().decode(Connection.self, from: Data(contentsOf: url))
            guard connection?.serverURL.scheme == "https", connection?.certificateSHA256.count == 64 else { throw CocoaError(.fileReadCorruptFile) }
            connect()
        } catch { showError("Connection configuration is missing. Run the iPhone setup script and rebuild the app.") }
    }

    @objc private func back() { web.goBack() }
    @objc private func reload() {
        notice.isHidden = true
        if web.url == nil { connect() } else { web.reload() }
    }
    @objc private func connect() {
        guard let connection else { return }
        notice.isHidden = true
        var request = URLRequest(url: connection.serverURL.appendingPathComponent("_iphone/connect"))
        request.setValue(connection.token, forHTTPHeaderField: "X-Cocoa-Pairing")
        request.cachePolicy = .reloadIgnoringLocalCacheData
        web.load(request)
    }
    @objc private func showConnection() {
        let alert = UIAlertController(title: "Cocoa Local", message: "Shop: \(connection?.serverURL.absoluteString ?? "Not configured")\n\nKeep your PC and shop running and both devices on the same network. Allow Local Network access in iPhone Settings. This shop uses test payments.\n\nIf the PC address changes, rerun setup and rebuild.", preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Reconnect", style: .default) { [weak self] _ in self?.connect() })
        alert.addAction(UIAlertAction(title: "Close", style: .cancel))
        present(alert, animated: true)
    }
    private func showError(_ message: String) {
        toolbar.isHidden = false
        notice.text = "\n\(message)\n"
        notice.isHidden = false
        progress.isHidden = true
        web.scrollView.refreshControl?.endRefreshing()
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        notice.isHidden = true
        web.scrollView.refreshControl?.endRefreshing()
        web.evaluateJavaScript("!!document.querySelector('.mobile-bottom-nav') && matchMedia('(max-width: 760px)').matches") { [weak self] result, _ in
            self?.toolbar.isHidden = result as? Bool == true
        }
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { failed(error) }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { failed(error) }
    private func failed(_ error: Error) {
        if (error as NSError).code != NSURLErrorCancelled {
            showError("Unable to reach your shop. Check the PC server, Wi-Fi and Local Network permission, then tap refresh.\n\(error.localizedDescription)")
        }
    }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { webView.reload() }

    func webView(_ webView: WKWebView, didReceive challenge: URLAuthenticationChallenge, completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
        guard let connection,
              challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
              challenge.protectionSpace.host == connection.serverURL.host,
              challenge.protectionSpace.port == (connection.serverURL.port ?? 443),
              let trust = challenge.protectionSpace.serverTrust,
              let certificates = SecTrustCopyCertificateChain(trust) as? [SecCertificate],
              let certificate = certificates.first else {
            completionHandler(.performDefaultHandling, nil); return
        }
        let hash = SHA256.hash(data: SecCertificateCopyData(certificate) as Data).map { String(format: "%02x", $0) }.joined()
        guard hash == connection.certificateSHA256.lowercased() else {
            completionHandler(.cancelAuthenticationChallenge, nil)
            showError("The shop server certificate has changed. Rebuild with the current PC connection settings.")
            return
        }
        SecTrustSetAnchorCertificates(trust, [certificate] as CFArray)
        SecTrustSetAnchorCertificatesOnly(trust, true)
        var trustError: CFError?
        guard SecTrustEvaluateWithError(trust, &trustError) else {
            completionHandler(.cancelAuthenticationChallenge, nil)
            showError("The paired server certificate failed validation. \(trustError.map { CFErrorCopyDescription($0) as String } ?? "Regenerate the PC certificate and rebuild.")")
            return
        }
        completionHandler(.useCredential, URLCredential(trust: trust))
    }
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        let url = action.request.url
        if connection?.owns(url) == true || url?.scheme == "blob" {
            decisionHandler(action.shouldPerformDownload ? .download : .allow)
        } else {
            decisionHandler(.cancel)
            if action.navigationType == .linkActivated, let url, ["https", "mailto", "tel"].contains(url.scheme ?? "") { UIApplication.shared.open(url) }
        }
    }
    func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        if let http = response.response as? HTTPURLResponse, http.statusCode == 401 {
            decisionHandler(.cancel); showError("The PC connection key changed. Rebuild the app with the current connection settings."); return
        }
        if !response.canShowMIMEType || (response.response as? HTTPURLResponse)?.value(forHTTPHeaderField: "Content-Disposition")?.lowercased().hasPrefix("attachment") == true {
            decisionHandler(.download)
        } else { decisionHandler(.allow) }
    }
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if action.targetFrame == nil, connection?.owns(action.request.url) == true { webView.load(action.request) }
        return nil
    }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame, connection?.owns(message.frameInfo.request.url) == true,
              let body = message.body as? [String: String] else { return }
        switch body["kind"] {
        case "print":
            let printer = UIPrintInteractionController.shared
            printer.printFormatter = web.viewPrintFormatter()
            printer.present(animated: true)
        case "csv":
            guard let text = body["text"], text.utf8.count <= 5 * 1024 * 1024 else { return }
            let name = URL(fileURLWithPath: body["name"] ?? "export.csv").lastPathComponent
            do {
                let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
                try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
                let file = directory.appendingPathComponent(name.hasSuffix(".csv") ? name : "export.csv")
                try text.write(to: file, atomically: true, encoding: .utf8)
                share(file)
            } catch { showError("Could not prepare the export. Please try again.") }
        case "exportError": showError("Could not export this file. Try again or export from the PC.")
        default: break
        }
    }
    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) { download.delegate = self }
    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) { download.delegate = self }
    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            let file = directory.appendingPathComponent(URL(fileURLWithPath: suggestedFilename).lastPathComponent)
            downloads[ObjectIdentifier(download)] = file
            completionHandler(file)
        } catch { completionHandler(nil) }
    }
    func downloadDidFinish(_ download: WKDownload) {
        if let file = downloads.removeValue(forKey: ObjectIdentifier(download)) { share(file) }
    }
    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        if let file = downloads.removeValue(forKey: ObjectIdentifier(download)) { try? FileManager.default.removeItem(at: file.deletingLastPathComponent()) }
        showError("Download failed. Please try again.")
    }
    private func share(_ file: URL) {
        let sheet = UIActivityViewController(activityItems: [file], applicationActivities: nil)
        sheet.popoverPresentationController?.sourceView = view
        sheet.popoverPresentationController?.sourceRect = CGRect(x: view.bounds.midX, y: view.bounds.maxY - 50, width: 1, height: 1)
        sheet.completionWithItemsHandler = { _, _, _, _ in try? FileManager.default.removeItem(at: file.deletingLastPathComponent()) }
        present(sheet, animated: true)
    }
}



