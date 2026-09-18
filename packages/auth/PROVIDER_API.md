# Auth Provider Extension API

`@velocelab/auth` owns authentication methods, local identity bindings and registration policy. `@velocelab/user` owns persistent Veloce login sessions and cookies. A third-party provider plugin owns only its upstream protocol (OAuth 2/OIDC/etc.).

## Dependencies

A provider plugin must depend on `auth` and should obtain `ctx.component.auth` after dependency injection.

## Public routes

Register the two routes using the provider ID that was registered with auth:

```text
GET /api/auth/provider/<provider-id>
GET /api/auth/callback/<provider-id>
```

The auth middleware deliberately allows only these two `/api/auth/` prefixes before a local user session exists. All other provider routes remain authenticated by default.

The start route creates and stores upstream `state`, PKCE verifier and nonce as appropriate for its protocol, then redirects to the upstream identity provider. The callback validates all of those values and exchanges the upstream authorization code.

## Registering a provider

```ts
import type { AuthProvider, ExternalIdentity } from "@velocelab/auth"

const provider: AuthProvider = {
  id: "github",
  displayName: "GitHub",
  available: () => Boolean(config.clientId && config.clientSecret),
  registrationEnabled: () => config.allowRegistration,
}

const unregister = ctx.component.auth.registerProvider(provider)
ctx.affect(unregister)
```

The ID must match the route suffix. `available()` must return false until the provider configuration is complete; unavailable providers are not offered in auth's public capabilities.

## Completing a callback

Do not issue tokens, set cookies, or redirect directly after upstream authentication. Normalize the upstream profile to `ExternalIdentity` and hand it to auth:

```ts
const identity: ExternalIdentity = {
  provider: "github",
  subject: upstream.id,
  email: upstream.email ?? undefined,
  emailVerified: true,
  usernameHint: upstream.login,
  avatarUrl: upstream.avatar_url,
}

await ctx.component.auth.completeExternalLogin(session, identity, {
  returnTo: storedReturnTo,
  responseMode: "redirect",
})
```

`completeExternalLogin()` validates provider availability and instance policy, finds or creates the local account, and persists `(provider, subject)` in `auth_identities`. It then delegates persistent login-state creation and the HttpOnly cookie to `@velocelab/user` before performing the safe local redirect. It refuses automatic email-based merges; users must bind an external identity explicitly while signed in.

## Binding an identity to an existing account

After the provider has verified an upstream identity for an already authenticated user:

```ts
await ctx.component.auth.bindExternalIdentity(currentUser.id!, identity)
```

This does not alter the current session or issue a new cookie.

## Runtime provider settings

Auth exposes available provider metadata at `GET /api/auth/providers` and administrator capabilities at `GET /api/auth/admin/capabilities`. The settings UI uses the latter to populate dynamic choices for `allowedLoginMethods` and `allowedRegistrationProviders`; provider IDs retained in saved config remain visible even if their plugin is later unavailable.
