# Notflix for Tizen

A Netflix-style interface for [Nuvio TV](https://github.com/NuvioMedia/NuvioTVSmart) on Samsung Smart TVs.

**Version 0.0.2**

## Compatibility

Optimized for the **Samsung UN32T4300 (Tizen 5.5)**. Layout, timings and memory use were tuned on that TV, but the app works on any Samsung Tizen TV supported by Nuvio TV (Tizen 4 and newer).

## Features

- Netflix-style profile picker with a trending showcase
- Billboard home with trailers, logos and IMDb, TMDB and Trakt ratings
- Redesigned detail page, episode list and cast section
- Netflix-style player with skip intro, recap and credits buttons, next episode at the start of the credits and a pause screen
- Post-play recommendations
- Spanish audio variants picked according to each profile's language settings

Your Nuvio account, profiles, addons, Trakt and Simkl connections work exactly as in Nuvio TV. Plugins are not available on Tizen 5.5.

## Install

1. Download the latest `.wgt` from the releases page.
2. Install it with the Nuvio TV Installer, Tizen Studio or any other Tizen sideloading tool.

The package keeps the official Nuvio TV app id, so it installs over an existing Nuvio TV app and keeps your login.

## Updates

The app checks this repository's releases instead of the official Nuvio releases. When a newer release is published (for example `v0.0.2`), the TV shows an update notice. Updates are installed manually with the Nuvio TV Installer.

## Build from source

```bash
npm install
npm run build
npm run package:tizen
```

The build needs a `nuvio.env.js` (or `local.properties`, see `local.example.properties`) with your own keys. These files are ignored by git and must never be committed.

## Trailer proxy

`nf-youtube-proxy.html` lets the app control trailer volume so ads stay silent. Enable GitHub Pages for this repository (branch `main`, root folder) and the app will find it automatically at `https://esmequiinn.github.io/Notflix-Tizen/nf-youtube-proxy.html`. Without it, trailers still play using the standard proxy.

## Credits

- [NuvioTVSmart](https://github.com/NuvioMedia/NuvioTVSmart) by NuvioMedia, the Tizen app this project is based on.
- [Notflix](https://github.com/DaoeZ/notflix) by DaoeZ, the Android TV app whose Netflix-style design inspired this interface.

This is an unofficial modified version and is not affiliated with Nuvio or Netflix.

## License

[GNU General Public License v3.0](./LICENSE)
