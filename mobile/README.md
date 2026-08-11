# Veloce Mobile

React Native / Expo implementation of the Veloce web console. It connects to the existing Go service; configure the service URL on the first screen. Android emulator defaults to `http://10.0.2.2:8080`; use your LAN IP on a physical device.

```bash
cd mobile
npm install
npm start
```

The app includes persistent sign-in, password sign-in, chat/session handling, agents, knowledge bases, file library, devices, settings, theme and language preferences. OAuth, passkeys, hCaptcha, and the desktop-only terminal are deliberately handed off to the web/desktop clients because they need browser or desktop capabilities.
