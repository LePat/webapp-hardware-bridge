# Build Instructions

## Build from source

- JDK 21, [Eclipse Temurin 21](https://adoptium.net/en-GB/temurin/releases/) Recommanded
- Intelij IDEA (Both Community and Ultimate works)

1. An artifact config file is included in git repository.

2. Use Intelij IDEA to "Build artifact" to yield `out\artifacts\webapp_hardware_bridge_jar`.

## Windows Installer bundled with JRE

- JRE 21, [Eclipse Temurin 21](https://adoptium.net/en-GB/temurin/releases/) Recommanded
- [Nullsoft Scriptable Install System](https://nsis.sourceforge.io/) 

1. Follow "Build from source" instructions to yield `out\artifacts\webapp_hardware_bridge_jar`

2. Copy JRE 21 into `./jre` directory 

3. Run `install.nsi` with NSIS to yield `whb.exe`

Or, with Gradle (does steps 1-3 for you, as long as `./jre` already exists and
`makensis` is on `PATH`):

```
./gradlew buildInstaller
```

`whb.exe` built this way is **unsigned** and will trigger the Windows SmartScreen
warning. The release pipeline (`.github/workflows/release.yml`) signs it automatically
via SignPath once configured - see [docs/CODE_SIGNING.md](docs/CODE_SIGNING.md).

## Linux AppImage bundled with JRE

- JRE 21 for Linux x64, [Eclipse Temurin 21](https://adoptium.net/en-GB/temurin/releases/) Recommanded
- [appimagetool](https://github.com/AppImage/appimagetool/releases) (`appimagetool-x86_64.AppImage` on `PATH`, or saved as `./appimagetool.AppImage`)

1. Extract a Linux x64 JRE 21 into `./jre-linux` (the folder itself should contain
   `bin/`, `lib/`, etc. directly - strip the top-level `jdk-21.x+y-jre` folder when
   extracting the tarball).

2. Run:

```
./gradlew buildAppImage
```

This produces `WebApp_Hardware_Bridge-<version>-x86_64.AppImage` at the repo root - a
single portable executable, no root/install required. `config.json` and `log/` are
created next to wherever the user places the `.AppImage` file (same idea as the
Windows install directory).

- `./WebApp_Hardware_Bridge-*.AppImage` launches the GUI (system tray) - needs a
  desktop environment with tray support.
- `./WebApp_Hardware_Bridge-*.AppImage --server` runs headless (no tray), for servers
  or minimal desktop environments.

## How to run

1. Start application
   - GUI: `javaw -cp webapp-hardware-bridge.jar tigerworkshop.webapphardwarebridge.GUI`
   - Server: `java -cp webapp-hardware-bridge.jar tigerworkshop.webapphardwarebridge.Server`