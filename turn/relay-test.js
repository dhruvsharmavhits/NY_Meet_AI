// Real libwebrtc relay test: two peers in headless Chrome forced to relay-only,
// exchanging fake-mic audio through the TURN server served by the backend.
const puppeteer = require("puppeteer-core");

const BASE = process.env.BASE || "http://127.0.0.1:8001";
const CHROME = process.env.CHROME || "/usr/bin/google-chrome";

(async () => {
  const user = await (await fetch(`${BASE}/users`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ full_name: "relay-test" }) })).json();
  const { iceServers } = await (await fetch(`${BASE}/meetings/ice-servers`, { headers: { "X-User-Id": user.id } })).json();
  const turn = iceServers.filter((s) => String(s.urls).startsWith("turn"));
  console.log("ICE servers from backend:", JSON.stringify(iceServers.map((s) => ({ urls: s.urls, username: s.username, credential: s.credential ? "present" : "MISSING" }))));

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    args: ["--no-sandbox", "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"],
  });
  const page = await browser.newPage();
  page.on("console", (m) => console.log("  [chrome]", m.text()));
  await page.goto(`${BASE}/health`);

  await page.evaluate((p) => { window.__policy = p; }, process.env.POLICY || "relay");
  const result = await page.evaluate(async (iceServers) => {
    const cfg = { iceServers, iceTransportPolicy: (window.__policy || "relay") };
    const a = new RTCPeerConnection(cfg);
    const b = new RTCPeerConnection(cfg);
    const log = [];
    for (const [name, pc] of [["A", a], ["B", b]]) {
      pc.onicecandidateerror = (e) => log.push(`${name} ICE ERROR ${e.errorCode} ${e.url} ${e.errorText}`);
      pc.oniceconnectionstatechange = () => log.push(`${name} ice=${pc.iceConnectionState}`);
      pc.onconnectionstatechange = () => log.push(`${name} connection=${pc.connectionState}`);
    }
    a.onicecandidate = (e) => e.candidate && b.addIceCandidate(e.candidate);
    b.onicecandidate = (e) => e.candidate && a.addIceCandidate(e.candidate);

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => a.addTrack(t, stream));
    b.addTransceiver("audio", { direction: "recvonly" });

    await a.setLocalDescription(await a.createOffer());
    await b.setRemoteDescription(a.localDescription);
    await b.setLocalDescription(await b.createAnswer());
    await a.setRemoteDescription(b.localDescription);

    const t0 = Date.now();
    while (Date.now() - t0 < 20000 && a.connectionState !== "connected" && a.connectionState !== "failed") await new Promise((r) => setTimeout(r, 100));
    await new Promise((r) => setTimeout(r, 4000));

    const out = { log, aState: a.connectionState, bState: b.connectionState, ice: a.iceConnectionState };
    const stats = await a.getStats();
    stats.forEach((r) => {
      if (r.type === "outbound-rtp") out.outbound = { kind: r.kind, packetsSent: r.packetsSent, bytesSent: r.bytesSent };
      if (r.type === "candidate-pair" && r.state === "succeeded" && r.nominated) {
        const l = stats.get(r.localCandidateId), rm = stats.get(r.remoteCandidateId);
        out.pair = { local: `${l.candidateType} ${l.address}:${l.port} ${l.protocol}`, remote: `${rm.candidateType} ${rm.address}:${rm.port}`, bytesSent: r.bytesSent, bytesReceived: r.bytesReceived };
      }
    });
    const bstats = await b.getStats();
    bstats.forEach((r) => { if (r.type === "inbound-rtp") out.inboundAtB = { kind: r.kind, packetsReceived: r.packetsReceived, bytesReceived: r.bytesReceived, audioLevel: r.audioLevel }; });
    a.close(); b.close();
    return out;
  }, turn);

  await browser.close();
  result.log.forEach((l) => console.log("  " + l));
  console.log("A connection:", result.aState, "| ice:", result.ice);
  console.log("selected pair:", JSON.stringify(result.pair));
  console.log("A outbound-rtp:", JSON.stringify(result.outbound));
  console.log("B inbound-rtp:", JSON.stringify(result.inboundAtB));
  const ok = result.aState === "connected" && result.pair && (process.env.POLICY === "all" || result.pair.local.startsWith("relay")) && result.outbound && result.outbound.packetsSent > 0 && result.inboundAtB && result.inboundAtB.packetsReceived > 0;
  console.log(ok ? "RELAY AUDIO OK" : "RELAY AUDIO FAILED");
  process.exit(ok ? 0 : 1);
})();
