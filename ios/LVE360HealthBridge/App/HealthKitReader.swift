import Foundation
import HealthKit

final class HealthKitReader {
    let store = HKHealthStore()

    var isAvailable: Bool { HKHealthStore.isHealthDataAvailable() }

    func requestReadAccess(_ signals: Set<HealthSignal>) async throws {
        guard isAvailable else { throw HealthBridgeError.healthUnavailable }
        let types = Set(signals.map(\.sampleType))
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            store.requestAuthorization(toShare: [], read: types) { _, error in
                if let error { continuation.resume(throwing: error) }
                else { continuation.resume() }
            }
        }
        // HealthKit deliberately does not disclose whether each read request was denied.
    }

    func readDays(_ intervals: [DateInterval], signals: Set<HealthSignal>) async throws -> [HealthDay] {
        guard let first = intervals.first, let last = intervals.last else { return [] }
        let timeZone = TimeZone.current
        let wholeRange = DateInterval(start: first.start, end: last.end)
        var totals: [String: DailyValues] = [:]
        for interval in intervals {
            totals[HealthCalendar.dayString(interval.start, in: timeZone)] = DailyValues()
        }

        for signal in signals {
            switch signal {
            case .steps, .activeEnergy, .exerciseTime:
                let daily = try await cumulativeDaily(signal, range: wholeRange)
                for (day, value) in daily where totals[day] != nil {
                    switch signal {
                    case .steps: totals[day]?.steps = Int(value.rounded())
                    case .activeEnergy: totals[day]?.activeEnergyKcal = value
                    case .exerciseTime: totals[day]?.exerciseMinutes = Int(value.rounded())
                    default: break
                    }
                }
            case .restingHeartRate, .weight:
                let samples = try await quantitySamples(signal, range: wholeRange)
                let grouped = Dictionary(grouping: samples) { HealthCalendar.dayString($0.endDate, in: timeZone) }
                for (day, values) in grouped where totals[day] != nil {
                    if signal == .restingHeartRate {
                        let readings = values.map { $0.quantity.doubleValue(for: HKUnit.count().unitDivided(by: .minute())) }
                        totals[day]?.restingHeartRate = readings.reduce(0, +) / Double(readings.count)
                    } else if let latest = values.max(by: { $0.endDate < $1.endDate }) {
                        totals[day]?.weightKg = latest.quantity.doubleValue(for: .gramUnit(with: .kilo))
                    }
                }
            case .sleep:
                let samples = try await sleepSamples(range: wholeRange)
                let grouped = Dictionary(grouping: samples) { HealthCalendar.dayString($0.endDate, in: timeZone) }
                for (day, values) in grouped where totals[day] != nil {
                    let minutes = values.reduce(0.0) { sum, sample in
                        sum + sample.endDate.timeIntervalSince(sample.startDate) / 60
                    }
                    totals[day]?.sleepMinutes = min(1440, Int(minutes.rounded()))
                }
            }
        }

        return intervals.compactMap { interval in
            let day = HealthCalendar.dayString(interval.start, in: timeZone)
            guard let values = totals[day], values.hasData else { return nil }
            return HealthDay(
                localDate: day,
                timeZone: timeZone.identifier,
                steps: values.steps,
                sleepMinutes: values.sleepMinutes,
                restingHeartRate: values.restingHeartRate,
                weightKg: values.weightKg,
                activeEnergyKcal: values.activeEnergyKcal,
                exerciseMinutes: values.exerciseMinutes,
                sourceUpdatedAt: ISO8601DateFormatter().string(from: Date())
            )
        }
    }

    private func cumulativeDaily(_ signal: HealthSignal, range: DateInterval) async throws -> [String: Double] {
        guard let type = signal.sampleType as? HKQuantityType else { return [:] }
        return try await withCheckedThrowingContinuation { continuation in
            let query = HKStatisticsCollectionQuery(
                quantityType: type,
                quantitySamplePredicate: HKQuery.predicateForSamples(withStart: range.start, end: range.end),
                options: .cumulativeSum,
                anchorDate: range.start,
                intervalComponents: DateComponents(day: 1)
            )
            query.initialResultsHandler = { _, collection, error in
                if let error { continuation.resume(throwing: error); return }
                var result: [String: Double] = [:]
                collection?.enumerateStatistics(from: range.start, to: range.end) { statistics, _ in
                    guard let quantity = statistics.sumQuantity() else { return }
                    let unit: HKUnit
                    switch signal {
                    case .steps: unit = .count()
                    case .activeEnergy: unit = .kilocalorie()
                    case .exerciseTime: unit = .minute()
                    default: return
                    }
                    result[HealthCalendar.dayString(statistics.startDate)] = quantity.doubleValue(for: unit)
                }
                continuation.resume(returning: result)
            }
            store.execute(query)
        }
    }

    private func quantitySamples(_ signal: HealthSignal, range: DateInterval) async throws -> [HKQuantitySample] {
        let samples = try await allSamples(signal.sampleType, range: range)
        return samples.compactMap { $0 as? HKQuantitySample }
    }

    private func sleepSamples(range: DateInterval) async throws -> [HKCategorySample] {
        let samples = try await allSamples(HealthSignal.sleep.sampleType, range: range)
        return samples.compactMap { $0 as? HKCategorySample }.filter { sample in
            guard let value = HKCategoryValueSleepAnalysis(rawValue: sample.value) else { return false }
            switch value {
            case .asleep, .asleepCore, .asleepDeep, .asleepREM, .asleepUnspecified: return true
            default: return false
            }
        }
    }

    private func allSamples(_ type: HKSampleType, range: DateInterval) async throws -> [HKSample] {
        try await withCheckedThrowingContinuation { continuation in
            let predicate = HKQuery.predicateForSamples(withStart: range.start, end: range.end, options: .strictEndDate)
            let query = HKSampleQuery(sampleType: type, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: nil) { _, samples, error in
                if let error { continuation.resume(throwing: error) }
                else { continuation.resume(returning: samples ?? []) }
            }
            store.execute(query)
        }
    }
}

private struct DailyValues {
    var steps: Int?
    var sleepMinutes: Int?
    var restingHeartRate: Double?
    var weightKg: Double?
    var activeEnergyKcal: Double?
    var exerciseMinutes: Int?

    var hasData: Bool {
        steps != nil || sleepMinutes != nil || restingHeartRate != nil || weightKg != nil
            || activeEnergyKcal != nil || exerciseMinutes != nil
    }
}
