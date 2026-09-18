# Google Sign-In Provider

`@velocelab/auth-google` is an independent Google OAuth 2.0 / OpenID Connect provider for `@velocelab/auth`.

## Google Cloud setup

1. In Google Cloud Console, create an OAuth client of type **Web application**.
2. Add the exact callback URL below to **Authorized redirect URIs**:

   ```text
   https://your-domain.example/api/auth/callback/google
   ```

3. Copy its Client ID and Client Secret into this plugin's settings.
4. Set `redirectUri` to the same exact callback URL.
5. In the auth plugin settings, add `google` to **允许登录方式**. To allow first-login account creation, choose `external` or `any` for `registrationMode` and add `google` to **允许首次登录时创建账号的 Provider ID**.

The plugin remains loaded with empty Client ID/secret values, but is unavailable and hidden from the login page until all three values (`clientId`, `clientSecret`, `redirectUri`) are configured.

## Routes

```text
GET /api/auth/provider/google
GET /api/auth/callback/google
```

The start route creates a short-lived server-side state record and PKCE S256 verifier, then redirects to Google with `openid email profile` scopes. The callback consumes that state once, exchanges the authorization code with its stored verifier, retrieves the OpenID Connect user-info profile, then invokes `auth.completeExternalLogin()`.

No Google access token, Veloce token, or login cookie is stored or emitted by this plugin. `@velocelab/auth` handles authentication policy; `@velocelab/user` stores the resulting persistent login session.

## Workspace restriction

Set `hostedDomain` to a Google Workspace domain such as `example.com` to require the returned OpenID Connect `hd` claim to match it. Leave it empty to permit ordinary Google accounts and all Workspace domains.
