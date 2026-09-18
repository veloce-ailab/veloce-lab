# Multi-provider OIDC login

`@velocelab/auth-oidc` adds multiple OpenID Connect providers to `@velocelab/auth` from one configuration array. Each configured provider has its own stable ID, display name and optional icon.

## Configuration

```json
{
  "@velocelab/auth-oidc": {
    "providers": [
      {
        "id": "keycloak",
        "name": "Company SSO",
        "icon": "https://sso.example.com/icon.svg",
        "issuer": "https://sso.example.com/realms/main",
        "clientId": "veloce-web",
        "clientSecret": "replace-me",
        "redirectUri": "https://app.example.com/api/auth/callback/keycloak",
        "allowRegistration": false,
        "scopes": ["openid", "email", "profile"]
      },
      {
        "id": "auth0",
        "name": "Auth0",
        "icon": "",
        "issuer": "https://tenant.eu.auth0.com/",
        "clientId": "...",
        "clientSecret": "...",
        "redirectUri": "https://app.example.com/api/auth/callback/auth0",
        "allowRegistration": true,
        "scopes": ["openid", "email", "profile"]
      }
    ]
  }
}
```

Provider IDs must be unique and match `[A-Za-z0-9_-]`. Each redirect URI must be registered exactly with the corresponding upstream identity provider.

Every configured Provider exposes these routes:

```text
GET /api/auth/provider/<id>
GET /api/auth/callback/<id>
```

The plugin discovers standard OIDC endpoints from `<issuer>/.well-known/openid-configuration`, creates a one-time server-side state record plus PKCE verifier, exchanges the code, calls the discovered user-info endpoint, then delegates the normalized identity to `auth.completeExternalLogin()`.

It never creates Veloce tokens or cookies. `@velocelab/auth` applies local account and registration policy, and `@velocelab/user` persists the resulting login session.

Finally, add a provider ID to auth's `allowedLoginMethods`. To permit first-login registration, set auth `registrationMode` to `external` or `any` and add that ID to `allowedRegistrationProviders` as well.
