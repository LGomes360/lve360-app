# LVE360 iPhone Health bridge

This is a small, read-only iPhone companion for the private LVE360 dashboard. It requests only selected daily Health categories and sends daily aggregates to the authenticated PR183 endpoint. It does not read clinical records or workout routes. The companion is not yet a signed or App Store-distributed build.

## Build and sign on a Mac

1. Install Xcode 26 and XcodeGen, then run `xcodegen generate` in this directory.
2. Open the generated project in Xcode. Select your Apple Developer team and enable HealthKit plus Background Delivery on the app identifier. The generated entitlements request both capabilities.
3. Supply the existing Supabase **public/anon** key as `LVE_SUPABASE_ANON_KEY` in local Xcode build settings. Never add a service-role key. The project defaults to `CONFIGURE_FOR_DEVICE_BUILD` and blocks sign-in until changed. The project already points to the production Supabase URL and app URL; override those build settings for a nonproduction environment.
4. Add `lve360-health://auth/callback` to Supabase Auth's allowed redirect URLs for the same project used by the web dashboard. Google and email-link sign-in use this callback. Email-link sign-in is restricted to existing accounts and does not create members.
5. Sign the app and install it on an iPhone. The simulator can compile and run UI/unit tests, but cannot verify actual Health data or background observer delivery.

## Manual release gate on iPhone

- Sign in with Google and with an email link using the same private LVE360 account used on the web. A different account must not inherit the first account's chosen categories or anchors.
- Select a subset of the six categories; verify only selected daily values reach `/api/health/apple/sync` and appear in Today. Repeat with one category declined in iOS Health permissions. HealthKit does not disclose read denial, so the UI must not claim a category was granted.
- Confirm the first sync is limited to 30 local days. Add and delete a sample, return to the app, and verify the affected day updates or disappears. Confirm background observer delivery on a signed device after an app relaunch.
- Use Sync now, check the displayed last-sync time, then disconnect. Confirm imported rows are removed, the web card disappears, and no subsequent observer update sends data. Sign out and sign back in, including with a second account.
- Validate network loss and expired sessions. Failed uploads must not advance local HealthKit anchors. A retry must not create duplicate daily rows.

The release remains blocked until this signed-device checklist passes. macOS CI validates only compilation and simulator tests.
