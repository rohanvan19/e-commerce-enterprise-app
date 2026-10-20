#!/usr/bin/env python3
"""Run in WSL: generate private pairing settings and a pinned TLS certificate."""
import argparse, hashlib, ipaddress, json, pathlib, plistlib, secrets, subprocess
root = pathlib.Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser()
parser.add_argument("--host", required=True, help="PC Wi-Fi IPv4 address")
parser.add_argument("--port", type=int, default=3443)
parser.add_argument("--rotate", action="store_true", help="Invalidate existing phone builds and regenerate pairing secrets")
args = parser.parse_args()
ipaddress.IPv4Address(args.host)
if not 1024 <= args.port <= 65535: parser.error("Choose a port from 1024 to 65535")
private = root / ".iphone"
private.mkdir(mode=0o700, exist_ok=True)
key, cert = private / "server-key.pem", private / "server-cert.pem"
certificate_matches = cert.exists() and subprocess.run(
    ["openssl", "x509", "-in", str(cert), "-noout", "-checkip", args.host],
    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0
if args.rotate or not key.exists() or not certificate_matches:
    subprocess.run(["openssl", "req", "-x509", "-newkey", "rsa:2048", "-sha256", "-nodes",
        "-keyout", str(key), "-out", str(cert), "-days", "365",
        "-subj", "/CN=Cocoa Local iPhone", "-addext", "subjectAltName=IP:" + args.host,
        "-addext", "basicConstraints=critical,CA:FALSE", "-addext", "extendedKeyUsage=serverAuth",
        "-addext", "keyUsage=critical,digitalSignature,keyEncipherment"],
        check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
der = subprocess.check_output(["openssl", "x509", "-in", str(cert), "-outform", "DER"])
config_file = private / "connection.json"
old = json.loads(config_file.read_text()) if config_file.exists() else {}
config = {
    "serverURL": "https://" + args.host + ":" + str(args.port),
    "token": secrets.token_hex(32) if args.rotate or not old else old["token"],
    "certificateSHA256": hashlib.sha256(der).hexdigest(),
}
content = json.dumps(config, indent=2) + "\n"
config_file.write_text(content)
resource = root / "ios/Sources/CocoaLocal/Connection.json"
resource.parent.mkdir(parents=True, exist_ok=True)
resource.write_text(content)
for path in [key, config_file, resource]:
    path.chmod(0o600)
print("Paired server:", config["serverURL"])
print("Private connection settings generated. Rebuild the app after changing them.")


# iOS 17+ supports an ATS exception for this exact IP. TLS and the certificate
# pin remain mandatory in the app; other hosts retain normal ATS policy.
info = plistlib.loads((root / "ios/Support/Info.plist").read_bytes())
info["NSAppTransportSecurity"] = {
    "NSAllowsLocalNetworking": True,
    "NSExceptionDomains": {args.host: {
        "NSExceptionAllowsInsecureHTTPLoads": True,
        "NSExceptionMinimumTLSVersion": "TLSv1.2"
    }}
}
(root / "ios/Support/Paired-Info.plist").write_bytes(plistlib.dumps(info))


