# Build Instructions

## Build from source

- JDK 21, [Eclipse Temurin 21](https://adoptium.net/en-GB/temurin/releases/) Recommanded
- Intelij IDEA (Both Community and Ultimate works)
- PHP (any recent version) on `PATH`, with the `mbstring` and `imagick` extensions, and
  [Composer](https://getcomposer.org/) - only needed to run the debug console's
  POS-printer simulation (see below), not for production use.

1. An artifact config file is included in git repository.

2. Use Intelij IDEA to "Build artifact" to yield `out\artifacts\webapp_hardware_bridge_jar`.

### Debug console POS-printer simulation (demo/escpos-tools)

The debug console's `/posprinter` simulation (converts an ESC/POS stream to an HTML
preview of the receipt) shells out to a PHP script from the separate escpos-tools
project - clone [our fork](https://github.com/LePat/escpos-tools) into
`demo/escpos-tools` (`esc2html.php` should end up at `demo/escpos-tools/esc2html.php`),
then install its PHP dependencies:

```
git clone https://github.com/LePat/escpos-tools.git demo/escpos-tools
cd demo/escpos-tools && composer install
```

We use our own fork rather than the
[upstream repo](https://github.com/receipt-print-hq/escpos-tools) because upstream is
unmaintained and crashes on PHP 8 (`implode()` argument order changed - see
[issue #79](https://github.com/receipt-print-hq/escpos-tools/issues/79), still open).
Our fork carries just that one fix. If upstream ever merges a fix, we can switch back.

This is only used by the debug console (never by production printing, which goes
through `PrinterWebSocketService`/`javax.print`), but it's still packaged into
`demo/` for both the Windows installer and the Linux AppImage since the debug console
ships with the app. `buildInstaller`/`buildAppImage` fail fast with a clear error if
`demo/escpos-tools` is missing.

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
via SignPath once configured - see [doc/CODE_SIGNING.md](doc/CODE_SIGNING.md).

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