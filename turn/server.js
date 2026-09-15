const Turn = require("node-turn");

const port = Number(process.env.TURN_PORT || 3478);
const username = process.env.TURN_USERNAME || "linguameet";
const credential = process.env.TURN_CREDENTIAL || "linguameet-secret";
const realm = process.env.TURN_REALM || "linguameet";
const listeningIps = process.env.TURN_LISTEN_IPS ? process.env.TURN_LISTEN_IPS.split(",") : undefined;
const externalIp = process.env.TURN_EXTERNAL_IP || undefined;

const server = new Turn({
  listeningPort: port,
  listeningIps,
  externalIps: externalIp,
  authMech: "long-term",
  credentials: { [username]: credential },
  realm,
  minPort: Number(process.env.TURN_MIN_PORT || 49152),
  maxPort: Number(process.env.TURN_MAX_PORT || 65535),
  debugLevel: process.env.TURN_DEBUG || "INFO",
});

server.start();

// node-turn drops client->peer ChannelData frames (its STUN parser rejects
// anything whose first two bits aren't 00, which is every ChannelData frame).
// Browsers switch to ChannelData as soon as ChannelBind succeeds, so without
// this every relayed call goes silent. Forward them to the bound peer here.
for (const socket of server.network.sockets) {
  socket.on("message", (data, rinfo) => {
    if (data.length < 4) return;
    const local = socket.address();
    const channelNumber = data.readUInt16BE(0);
    if (channelNumber < 0x4000 || channelNumber > 0x7ffe) return;
    const length = data.readUInt16BE(2);
    if (length > data.length - 4) return;

    const family = rinfo.family === "IPv6" ? "6" : "4";
    const fiveTuple = `UDP${family}://${rinfo.address}:${rinfo.port}>${local.address}:${local.port}`;
    const allocation = server.allocations[fiveTuple];
    if (!allocation) return;
    const peer = allocation.channelBindings[channelNumber];
    if (!peer) return;

    const payload = data.subarray(4, 4 + length);
    allocation.sockets[0].send(payload, peer.port, peer.address, (err) => {
      if (err) server.debug("ERROR", `channeldata relay failed: ${err}`);
      else server.debug("TRACE", `channeldata ${rinfo.address}:${rinfo.port} -> ${peer.address}:${peer.port} (${length}b)`);
    });
  });
}

console.log(`[turn] listening on ${listeningIps ? listeningIps.join(",") : "all interfaces"}:${port} (udp) realm=${realm} user=${username}`);
