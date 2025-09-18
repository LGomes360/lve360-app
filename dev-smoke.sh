#!/usr/bin/env bash
# Run three quick smoke tests against a running local dev server.
set -e
BASE=http://localhost:3000
echo "1) env-check"
curl -s "${BASE}/api/env-check" | sed -n '1,120p'
echo; echo "-----"
echo "2) generate-stack (tally_submission_id=jaJMeJQ)"
curl -s -X POST "${BASE}/api/generate-stack" -H "Content-Type: application/json" -d '{"tally_submission_id":"jaJMeJQ"}' | sed -n '1,240p'
echo; echo "-----"
echo "3) generate-report (example submission UUID: 47ac3f93-4116-4dec-b5b4-93b6dc2ba47e)"
curl -s -X POST "${BASE}/api/generate-report" -H "Content-Type: application/json" -d '{"submissionId":"47ac3f93-4116-4dec-b5b4-93b6dc2ba47e"}' | sed -n '1,240p'
echo; echo "SMOKE COMPLETE"
