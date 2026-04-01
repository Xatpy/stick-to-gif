# Mobile Release Checklist

This checklist separates public repository steps from private release-signing steps.

## Public Repo Steps

These steps are safe to document and automate in the public repo.

1. Run `npm run check:mobile-secrets`.
2. Run `npm run test`.
3. Run `npm run build:mobile`.
4. Run `npm run cap:sync`.
5. Verify the mobile test matrix has no blocker failures.
6. Confirm no secret-bearing files are staged in git.

## Private Release Steps

These steps must happen with ignored local files or private CI secrets.

1. Inject Android signing credentials through `android/key.properties` or environment variables.
2. Apply iOS signing configuration locally in Xcode or private CI.
3. Use private store credentials for distribution.
4. Produce release builds only in a trusted environment.

## Android Signing Inputs

Supported private inputs:

1. Ignored `android/key.properties`.
2. `ANDROID_KEYSTORE_PATH`
3. `ANDROID_KEYSTORE_PASSWORD`
4. `ANDROID_KEY_ALIAS`
5. `ANDROID_KEY_PASSWORD`

## iOS Signing Inputs

Supported private inputs:

1. Local Xcode signing configuration.
2. Private CI-managed signing identities and provisioning assets.

Do not commit:

1. Certificates.
2. Provisioning profiles.
3. Team-specific release secrets.

## Final Pre-Release Checks

1. The app still claims local-only processing truthfully.
2. The bundle identifier is correct for the intended release target.
3. The release build path does not depend on committed secrets.
4. The repo remains public-safe after the release branch changes.
