import SwiftUI
import Supabase

@main
struct LVE360HealthBridgeApp: App {
    @UIApplicationDelegateAdaptor(HealthBridgeAppDelegate.self) private var appDelegate

    var body: some Scene {
        WindowGroup {
            HealthBridgeView()
        }
    }
}

final class HealthBridgeAppDelegate: NSObject, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        Task { await HealthSyncCoordinator.shared.restoreObservers() }
        return true
    }
}

struct HealthBridgeView: View {
    @Environment(\.scenePhase) private var scenePhase
    @State private var accountID: String?
    @State private var accountEmail: String?
    @State private var emailInput = ""
    @State private var selected = Set(HealthSignal.allCases)
    @State private var lastSync: Date?
    @State private var isBusy = false
    @State private var message: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    introduction
                    if !BridgeAPI.isConfigured {
                        Text("This build is not configured for account sign-in yet.")
                            .foregroundStyle(.orange)
                    } else if let accountID {
                        connectedControls(accountID: accountID)
                    } else {
                        Button("Sign in with Google") { Task { await signIn() } }
                            .buttonStyle(.borderedProminent)
                        TextField("Your LVE360 account email", text: $emailInput)
                            .textContentType(.emailAddress)
                            .keyboardType(.emailAddress)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .textFieldStyle(.roundedBorder)
                        Button("Email me a sign-in link") { Task { await sendSignInLink() } }
                            .disabled(emailInput.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }
                    if let message {
                        Text(message).font(.footnote).foregroundStyle(.secondary)
                            .accessibilityIdentifier("health-bridge-message")
                    }
                    Text("LVE360 receives daily summaries only. This companion never uploads raw Health samples, routes, clinical records, or Apple identifiers. Health data is optional and is for educational wellness context, not medical decisions.")
                        .font(.footnote).foregroundStyle(.secondary)
                    Link("View LVE360 dashboard", destination: BridgeAPI.baseURL.appendingPathComponent("today"))
                        .font(.footnote)
                }
                .padding()
            }
            .navigationTitle("Apple Health")
            .task { await refreshSession() }
            .onOpenURL { url in
                Task {
                    do {
                        _ = try await BridgeAPI.client.auth.session(from: url)
                        await refreshSession()
                        await HealthSyncCoordinator.shared.restoreObservers()
                    } catch {
                        message = "Sign-in did not complete. Please try again."
                    }
                }
            }
            .onChange(of: scenePhase) { phase in
                if phase == .active { Task { await refreshSession() } }
            }
        }
    }

    private var introduction: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Connect the signals that matter to you")
                .font(.title2).bold()
            Text("Choose what to share. LVE360 uses your existing private member account and never changes records in Apple Health.")
                .foregroundStyle(.secondary)
        }
    }

    private func connectedControls(accountID: String) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            if let accountEmail {
                Text("Signed in as \(accountEmail)").font(.subheadline)
            }
            Text("Daily categories to request").font(.headline)
            ForEach(HealthSignal.allCases) { signal in
                Toggle(signal.title, isOn: Binding(
                    get: { selected.contains(signal) },
                    set: { enabled in
                        if enabled { selected.insert(signal) } else { selected.remove(signal) }
                    }
                ))
            }
            Text("Apple does not tell apps which Health read requests you declined. If no data appears, check Health access in iPhone Settings.")
                .font(.footnote).foregroundStyle(.secondary)

            Button("Connect and sync the last 30 days") {
                Task { await perform(success: "Health access requested and sync completed. If no data appears, check your iPhone Health permissions.") {
                    try await HealthSyncCoordinator.shared.connect(selected, accountID: accountID)
                } }
            }
            .buttonStyle(.borderedProminent)
            .disabled(isBusy || selected.isEmpty || !HealthSyncCoordinator.shared.isHealthAvailable)

            if !HealthSyncCoordinator.shared.selectedSignals(for: accountID).isEmpty {
                Button("Sync now") {
                    Task { await perform(success: "Your Health summaries are up to date.") {
                        try await HealthSyncCoordinator.shared.fullSync(accountID: accountID)
                    } }
                }
                .disabled(isBusy)
                if let lastSync {
                    Text("Last synced from this iPhone: \(lastSync.formatted(date: .abbreviated, time: .shortened))")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                Button("Disconnect and remove imported summaries", role: .destructive) {
                    Task { await perform(success: "Disconnected. Imported Health summaries were removed from LVE360.") {
                        try await HealthSyncCoordinator.shared.disconnect(accountID: accountID)
                    } }
                }
                .disabled(isBusy)
            }
            Button("Sign out") { Task { await signOut() } }
                .disabled(isBusy)
        }
    }

    private func refreshSession() async {
        guard BridgeAPI.isConfigured else { return }
        guard let session = try? await BridgeAPI.client.auth.session else {
            accountID = nil
            accountEmail = nil
            return
        }
        let id = String(describing: session.user.id)
        accountID = id
        accountEmail = session.user.email
        let existing = HealthSyncCoordinator.shared.selectedSignals(for: id)
        if !existing.isEmpty { selected = existing }
        lastSync = HealthSyncCoordinator.shared.lastSync(for: id)
    }

    private func signIn() async {
        do {
            let redirect = URL(string: "lve360-health://auth/callback")!
            let url = try BridgeAPI.client.auth.getOAuthSignInURL(provider: .google, redirectTo: redirect)
            await UIApplication.shared.open(url)
        } catch {
            message = error.localizedDescription
        }
    }

    private func sendSignInLink() async {
        let email = emailInput.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard email.contains("@") else {
            message = "Enter your LVE360 account email."
            return
        }
        do {
            try await BridgeAPI.client.auth.signInWithOTP(
                email: email,
                redirectTo: URL(string: "lve360-health://auth/callback"),
                shouldCreateUser: false
            )
            message = "Check your email on this iPhone for the sign-in link. This does not create a new account."
        } catch {
            message = "We could not send a sign-in link. Try Google or check your account email."
        }
    }

    private func signOut() async {
        do {
            try await BridgeAPI.client.auth.signOut()
            HealthSyncCoordinator.shared.stopForSignOut()
            accountID = nil
            accountEmail = nil
            lastSync = nil
            message = "Signed out. Your saved LVE360 connection remains until you disconnect it."
        } catch {
            message = error.localizedDescription
        }
    }

    private func perform(success: String, _ operation: () async throws -> Void) async {
        isBusy = true
        defer { isBusy = false }
        do {
            try await operation()
            if let accountID { lastSync = HealthSyncCoordinator.shared.lastSync(for: accountID) }
            message = success
        } catch {
            message = error.localizedDescription
        }
    }
}
