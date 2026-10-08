// No npm install needed. Run with:  node server.js   (or npm start)
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || "admin123"; // change this
const PARTIES = ["Congress", "BJP", "BRS", "TDP", "NOTA"];
const FILE = path.join(__dirname, "votes.json");

// Votes are saved in votes.json so they survive a restart
let votes = [];
try {
  votes = JSON.parse(fs.readFileSync(FILE, "utf8")).filter(v => v.id && PARTIES.includes(v.party));
} catch (e) {}
const save = () => fs.writeFileSync(FILE, JSON.stringify(votes, null, 2));

function results(id) {
  const total = votes.length;
  const parties = PARTIES.map(name => {
    const n = votes.filter(v => v.party === name).length;
    return { name, votes: n, percent: total ? Math.round((n / total) * 1000) / 10 : 0 };
  });
  const top = Math.max(...parties.map(p => p.votes));
  const leaders = total ? parties.filter(p => p.votes === top).map(p => p.name) : [];
  const mine = votes.find(v => v.id === id);
  return {
    parties, total, leaders,
    majority: total && top > total / 2 ? leaders[0] : null,
    needed: Math.floor(total / 2) + 1,
    myVote: mine ? mine.party : null,
  };
}

function send(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(obj));
}

function readBody(req, cb) {
  let body = "";
  req.on("data", c => { body += c; if (body.length > 10000) req.destroy(); });
  req.on("end", () => { try { cb(JSON.parse(body || "{}")); } catch (e) { cb({}); } });
}

http.createServer((req, res) => {
  // Each browser gets a random voter id in a cookie: one vote per browser
  const cookies = {};
  (req.headers.cookie || "").split(";").forEach(c => {
    const [k, v] = c.trim().split("=");
    if (k) cookies[k] = v;
  });
  let id = cookies.vid;
  if (!/^[a-f0-9]{32}$/.test(id || "")) {
    id = crypto.randomBytes(16).toString("hex");
    res.setHeader("Set-Cookie", `vid=${id}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax`);
  }

  if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(fs.readFileSync(path.join(__dirname, "index.html")));
  }
  if (req.method === "GET" && req.url === "/api/results") return send(res, 200, results(id));

  if (req.method === "POST" && req.url === "/api/vote") {
    return readBody(req, body => {
      if (!PARTIES.includes(body.party)) return send(res, 400, { error: "Choose a valid option." });
      if (votes.some(v => v.id === id)) return send(res, 409, { error: "You have already voted from this browser." });
      votes.push({ id, party: body.party, time: new Date().toISOString() });
      save();
      send(res, 200, results(id));
    });
  }

  if (req.method === "POST" && req.url === "/api/reset") {
    return readBody(req, body => {
      if (body.key !== ADMIN_KEY) return send(res, 403, { error: "Wrong admin key." });
      votes = [];
      save();
      send(res, 200, results(id));
    });
  }

  send(res, 404, { error: "Not found" });
}).listen(PORT, () => console.log(`Voting app running at http://localhost:${PORT}`));
