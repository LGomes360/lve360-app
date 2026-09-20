import Foundation

enum SleepMath {
    static func mergedMinutes(_ intervals: [DateInterval]) -> Int {
        let ordered = intervals.sorted { $0.start < $1.start }
        guard let first = ordered.first else { return 0 }
        var start = first.start
        var end = first.end
        var seconds = 0.0
        for interval in ordered.dropFirst() {
            if interval.start <= end {
                end = max(end, interval.end)
            } else {
                seconds += end.timeIntervalSince(start)
                start = interval.start
                end = interval.end
            }
        }
        seconds += end.timeIntervalSince(start)
        return min(1440, Int((seconds / 60).rounded()))
    }
}
