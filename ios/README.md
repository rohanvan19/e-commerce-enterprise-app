# Cocoa Local on iPhone

The original Next.js interface runs in a native WKWebView app built with xtool.
The PC runs the existing Node/PostgreSQL shop. The phone needs the PC awake and
reachable on the same network; this is not an offline or publicly hosted shop.

## Start the shop

Double-click `../Start-IPhone.cmd` on Windows and keep it running. It starts the
existing database, the production shop on 127.0.0.1:3000, and the phone relay.
It reuses an already-running Cocoa Local server. Ctrl+C stops the processes this
launcher started; PostgreSQL remains running.

If no production build exists, run `npm run build` in the shop first.

## First setup or a changed PC address

Find the Windows Wi-Fi IPv4 address with `ipconfig`. From Ubuntu/WSL:

```sh
cd /mnt/c/Users/vanma/enterprise-project/cocoa-local
python3 scripts/iphone-setup.py --host YOUR_PC_WIFI_IP
cd ios
bash run-ios.sh
```

The setup creates a private TLS certificate, a random pairing key and a
certificate-pinned connection resource for this personal development app.
Keep `.iphone/`, `ios/Sources/CocoaLocal/Connection.json`, and the built app
private. They are excluded from source control. Never ship this paired build
to other users. Use `--rotate` to replace the certificate/key and invalidate
previous builds, then rebuild/reinstall and restart the relay.

On Windows, allow inbound TCP 3443 only for the Node executable and local subnet.
The relay binds only to the configured PC address. Network isolation on guest or
campus Wi-Fi can block communication; use a shared private Wi-Fi/hotspot if needed.
If the address changes, rerun setup, restart the launcher and rebuild/reinstall.
The existing backend and PostgreSQL remain bound to loopback.

Allow Local Network access when the iPhone asks. Developer Mode and a trusted
development signing identity must be enabled if iOS prompts. Free Apple developer
provisioning may require periodic re-signing/reinstallation.

## Build without installing

```sh
cd ios
xtool dev build
```

Unsigned output: `xtool/CocoaLocal.app`. `run-ios.sh` builds, signs/installs, and
launches the app. It reuses the Windows Apple Mobile Device bridge on the WSL
gateway's port 27015 when present. Alternatively provide
`USBMUXD_SOCKET_ADDRESS` explicitly, or use a USB device attached to WSL.

## Behavior and security

- Persistent website storage retains login and bags. Swipe back, toolbar Back,
  Home, refresh, pull to refresh, and connection/error guidance are native.
- Receipts open inside the app and Print uses the native iOS print dialog.
  CSV exports use the iOS share sheet, including Save to Files. Image upload uses
  the system file picker. These features need device checks after compilation.
- Only the configured shop origin is loaded inside the app. User-activated
  external HTTPS, mail and telephone links open in the corresponding system app.
- TLS pins the exact generated server certificate. An ATS exception is generated only for the exact PC IP so iOS permits the local certificate. The app still requires HTTPS and validates the pinned certificate; other hosts keep default transport protections.
- Every relay route requires pairing. The bootstrap sends the key in a header,
  then uses a Secure/HttpOnly/SameSite=Strict host cookie. It does not put keys
  in URLs or logs.
- Host/origin/cross-site checks happen before proxying. The relay strips forwarded
  headers and the pairing cookie, and rewrites only approved same-origin traffic
  to localhost. Existing API authentication/authorization/CSRF checks stay intact.
- The local test inbox and simulated payments remain development features. This
  does not turn the demo into a production payment or email system.
- No public tunnel, cloud deployment or database migration is required.

## Verification

```powershell
node --test tests/iphone-relay.test.mjs
npm run typecheck
npm run build
```

Relay tests cover unauthenticated requests, pairing, cross-origin and host
rejection, authenticated request forwarding, cookie handling, open-proxy
rejection and an unavailable backend.

On the iPhone, check the catalogue, login, bag, checkout with fictional data,
owner workspace, CSV Save to Files, receipt Print, background/resume and refresh.


