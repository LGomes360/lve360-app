import Foundation
import HealthKit

@MainActor
final class HealthSyncCoordinator {
    static let shared = HealthSyncCoordinator()

    private let reader = HealthKitReader()
    private var observers: [HealthSignal: HKObserverQuery] = [:]
    private var isSyncing = false
    private var pendingSync = false

    var isHealthAvailable: Bool { reader.isAvailable }

    func selectedSignals(for accountID: String) -> Set<HealthSignal> {
        let names = UserDefaults.standard.stringArray(forKey: selectedKey(accountID)) ?? []
        return Set(names.compactMap(HealthSignal.init(rawValue:)))
    }

    func lastSync(for accountID: String) -> Date? {
        UserDefaults.standard.object(forKey: lastSyncKey(accountID)) as? Date
    }

    func connect(_ signals: Set<HealthSignal>, accountID: String) async throws {
        guard !signals.isEmpty else { throw HealthBridgeError.server("select_a_category") }
        try await reader.requestReadAccess(signals)
        UserDefaults.standard.set(signals.map(\.rawValue).sorted(), forKey: selectedKey(accountID))
        clearAnchors(for: accountID)
        try await fullSync(accountID: accountID)
        await startObservers(accountID: accountID)
    }

    func fullSync(accountID: String) async throws {
        let signals = selectedSignals(for: accountID)
        guard !signals.isEmpty else { return }
        let intervals = HealthCalendar.recentDays(30)
        let proposed = try await collectAnchors(signals, accountID: accountID)
        try await upload(intervals, signals: signals, accountID: accountID)
        saveAnchors(proposed, accountID: accountID)
    }

    func incrementalSync(accountID: String) async {
        if isSyncing {
            pendingSync = true
            return
        }
        isSyncing = true
        defer {
            isSyncing = false
            if pendingSync {
                pendingSync = false
                Task { await self.incrementalSync(accountID: accountID) }
            }
        }

        let signals = selectedSignals(for: accountID)
        guard !signals.isEmpty else { return }
        do {
            let changes = try await collectAnchors(signals, accountID: accountID)
            let intervals = HealthCalendar.recentDays(30)
            let affected = changes.values.reduce(into: Set<String>()) { result, change in
                result.formUnion(change.affectedDays)
            }
            let needsBroadRecheck = changes.values.contains { $0.hasDeletion }
            let days = needsBroadRecheck
                ? intervals
                : intervals.filter { affected.contains(HealthCalendar.dayString($0.start)) }
            if !days.isEmpty { try await upload(days, signals: signals, accountID: accountID) }
            saveAnchors(changes, accountID: accountID)
        } catch {
            // Keep anchors unchanged. A manual resync or later observer wake can retry.
        }
    }

    func startObservers(accountID: String) async {
        guard reader.isAvailable else { return }
        stopObservers()
        for signal in selectedSignals(for: accountID) {
            let query = HKObserverQuery(sampleType: signal.sampleType, predicate: nil) { _, completion, _ in
                Task { @MainActor in
                    await self.incrementalSync(accountID: accountID)
                    completion()
                }
            }
            observers[signal] = query
            reader.store.execute(query)
            // Background delivery may fail when an unsigned simulator lacks the entitlement.
            // Foreground/manual sync remains available in that case.
            reader.store.enableBackgroundDelivery(for: signal.sampleType, frequency: .hourly) { _, _ in }
        }
    }

    func restoreObservers() async {
        guard BridgeAPI.isConfigured, let session = try? await BridgeAPI.client.auth.session else { return }
        await startObservers(accountID: String(describing: session.user.id))
    }

    func stopForSignOut() { stopObservers() }

    func disconnect(accountID: String) async throws {
        try await BridgeAPI.post("api/health/apple/disconnect", accountID: accountID)
        for signal in selectedSignals(for: accountID) {
            reader.store.disableBackgroundDelivery(for: signal.sampleType) { _, _ in }
        }
        stopObservers()
        UserDefaults.standard.removeObject(forKey: selectedKey(accountID))
        UserDefaults.standard.removeObject(forKey: lastSyncKey(accountID))
        clearAnchors(for: accountID)
    }

    private func stopObservers() {
        for query in observers.values { reader.store.stop(query) }
        observers.removeAll()
    }

    private func upload(_ intervals: [DateInterval], signals: Set<HealthSignal>, accountID: String) async throws {
        guard !intervals.isEmpty else { return }
        let days = try await reader.readDays(intervals, signals: signals)
        let populated = Set(days.map(\.localDate))
        let removed = intervals.map { HealthCalendar.dayString($0.start) }.filter { !populated.contains($0) }
        let payload = HealthSyncPayload(
            requestedDataTypes: signals.map(\.rawValue).sorted(),
            days: days,
            removedLocalDates: removed
        )
        try await BridgeAPI.post("api/health/apple/sync", accountID: accountID, body: payload.encoded())
        UserDefaults.standard.set(Date(), forKey: lastSyncKey(accountID))
    }

    private struct AnchorChange {
        let anchor: HKQueryAnchor?
        let affectedDays: Set<String>
        let hasDeletion: Bool
    }

    private func collectAnchors(_ signals: Set<HealthSignal>, accountID: String) async throws -> [HealthSignal: AnchorChange] {
        var result: [HealthSignal: AnchorChange] = [:]
        for signal in signals {
            let anchor = savedAnchor(for: signal, accountID: accountID)
            result[signal] = try await anchoredChanges(signal, from: anchor)
        }
        return result
    }

    private func anchoredChanges(_ signal: HealthSignal, from anchor: HKQueryAnchor?) async throws -> AnchorChange {
        let since = HealthCalendar.recentDays(30).first!.start
        return try await withCheckedThrowingContinuation { continuation in
            let query = HKAnchoredObjectQuery(
                type: signal.sampleType,
                predicate: HKQuery.predicateForSamples(withStart: since, end: nil),
                anchor: anchor,
                limit: HKObjectQueryNoLimit
            ) { _, samples, deleted, nextAnchor, error in
                if let error { continuation.resume(throwing: error); return }
                let affected = Set((samples ?? []).map { HealthCalendar.dayString($0.endDate) })
                continuation.resume(returning: AnchorChange(
                    anchor: nextAnchor,
                    affectedDays: affected,
                    hasDeletion: !(deleted ?? []).isEmpty
                ))
            }
            reader.store.execute(query)
        }
    }

    private func savedAnchor(for signal: HealthSignal, accountID: String) -> HKQueryAnchor? {
        guard let data = UserDefaults.standard.data(forKey: anchorKey(signal, accountID)) else { return nil }
        return try? NSKeyedUnarchiver.unarchivedObject(ofClass: HKQueryAnchor.self, from: data)
    }

    private func saveAnchors(_ changes: [HealthSignal: AnchorChange], accountID: String) {
        for (signal, change) in changes {
            guard let anchor = change.anchor,
                  let data = try? NSKeyedArchiver.archivedData(withRootObject: anchor, requiringSecureCoding: true)
            else { continue }
            UserDefaults.standard.set(data, forKey: anchorKey(signal, accountID))
        }
    }

    private func clearAnchors(for accountID: String) {
        for signal in HealthSignal.allCases {
            UserDefaults.standard.removeObject(forKey: anchorKey(signal, accountID))
        }
    }

    private func selectedKey(_ accountID: String) -> String { "lve.health.selected.\(accountID)" }
    private func lastSyncKey(_ accountID: String) -> String { "lve.health.lastSync.\(accountID)" }
    private func anchorKey(_ signal: HealthSignal, _ accountID: String) -> String {
        "lve.health.anchor.\(accountID).\(signal.rawValue)"
    }
}
