{/* Actions Section */}
<SectionCard title="Actions">
  <div className="flex flex-wrap gap-4 justify-center">
    {/* Wrap in try/catch boundary */}
    <Suspense fallback={<p className="text-sm text-gray-500">⏳ Loading gate…</p>}>
      <LatestReadyGate
        onReady={(id) => {
          console.log("✅ Gate ready, submissionId:", id);
          setReady(true);
          setSubmissionId(id);
        }}
      />
    </Suspense>

    <CTAButton
      onClick={generateStack}
      variant="gradient"
      disabled={generating || !ready}
    >
      {generating
        ? "💪 Crunching..."
        : ready
        ? "✨ Generate Free Report"
        : "🤖 Warming up…"}
    </CTAButton>

    <CTAButton href="/pricing" variant="premium">
      👑 Upgrade to Premium
    </CTAButton>
  </div>

  {/* Debug output */}
  <p className="text-xs text-gray-400 mt-2">
    Debug: ready={String(ready)}, submissionId={submissionId ?? "null"}
  </p>

  {generating && (
    <p className="text-center text-gray-500 mt-3 text-sm animate-pulse">
      💪 Crunching the numbers… this usually takes about{" "}
      <strong>2 minutes</strong>.
    </p>
  )}
</SectionCard>
