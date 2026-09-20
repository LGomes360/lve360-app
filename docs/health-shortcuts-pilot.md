# iPhone Health Shortcuts pilot

PR185 is a narrow, iPhone-only alternative to the draft native PR184. It does not require a LVE360 iOS app, a Mac, or Apple Developer Program membership. The first supported category is the daily step total. Do not describe the pilot as automatic Apple Health synchronization or a substitute for the native bridge.

## Data and security contract

- A signed-in private member creates a 90-day key from Settings > iPhone Health Shortcut pilot. Creating a new key invalidates the previous one.
- Only the SHA-256 hash is stored in `health_shortcut_tokens`; the raw key is shown once. Keep it out of URLs, logs, shared Shortcuts, and screenshots.
- The key can only call the Apple Health Shortcuts sync endpoint and is currently limited to steps. It cannot access the rest of the member account.
- One validated daily total is written to `connected_health_daily_metrics` under provider `apple_health_shortcuts`. Raw Health samples and routes are not uploaded.
- Disconnect revokes the key and removes only Shortcut-provider summaries. It does not remove native-provider summaries or data in the iPhone Health app.
- The member's saved LVE360 timezone determines the default local date. The sync endpoint accepts a date up to 30 days old when explicitly supplied.

## Required release sequence

1. Review and apply `20260920005625_health_shortcuts_pilot.sql` to the relevant Supabase project. It is additive except for widening the two provider checks.
2. Deploy the web changes. Keep PR184 draft and separate; it has not been tested on a physical iPhone.
3. On an iPhone, create a key and configure a Shortcut using the instructions in Settings. Do not enable an automation yet.
4. Run a manual sync with actual step data, verify `ok: true`, refresh Today, and compare the stored number with the Health app's daily total.
5. If an iPhone and Apple Watch both contribute steps, investigate source overlap before treating the imported value as reliable. The Shortcut action has not been validated against HealthKit's de-duplicated statistics on a physical device.
6. Rotate the key and verify the old key is rejected. Disconnect and verify the key is rejected, Shortcut rows are removed, and any native-provider rows remain untouched.

## Rollback

Disable the Settings entry and both Shortcut endpoints. Revoke issued keys before removing server support. Existing Shortcut summaries can remain for account export or be removed by members with the disconnect control. Restore the original provider checks only after Shortcut-provider rows have been removed with member consent. Drop `health_shortcut_tokens` last. Do not drop the PR183 native-provider tables or data.
