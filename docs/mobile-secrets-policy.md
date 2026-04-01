# Mobile Secrets Policy

This repository is public.

That means no release-signing or publishing secret may ever be committed here.

## Public-Safe By Default

The repository may contain:

1. Source code.
2. Public documentation.
3. Capacitor configuration that is safe to expose.
4. Native project structure for iOS and Android.
5. Placeholder examples that contain no real secrets.

## Never Commit These

Do not commit:

1. Android keystores.
2. Android signing passwords.
3. Android alias passwords.
4. `key.properties`.
5. Apple signing certificates.
6. Apple provisioning profiles.
7. App Store Connect API keys.
8. Google Play publishing credentials.
9. CI secrets.
10. Any `.env` file that contains private values.

## Development Builds

Public clones of the repo should be able to:

1. Install dependencies.
2. Build the web app.
3. Generate Capacitor projects.
4. Run development builds in simulator or emulator mode.

Public clones of the repo should not be able to:

1. Produce store-ready signed release builds.
2. Access private Apple or Google publishing accounts.

## Release Signing

Release signing must happen outside the public repository.

Allowed approaches:

1. Ignored local files on a trusted machine.
2. Private CI secrets.
3. Secure credential storage provided by the release environment.

Disallowed approach:

1. Committing secret-bearing files or values to this repo.

## Team And Account Data

If Apple team identifiers, signing identities, or store account details are considered sensitive for this project, they must also remain outside committed source.

## Validation

Before merging mobile-related changes:

1. Check `git status` for accidental secret files.
2. Confirm `.gitignore` covers known mobile signing artifacts.
3. Run the repo secret-file validation script when available.
4. Inspect generated native project diffs for team-specific signing settings.

## Rule Of Thumb

If a file or value would let someone sign, publish, impersonate, or administer the app, it does not belong in this repository.
