#!/usr/bin/env node
// Serveur MCP GameTrack (v1.1) : permet à Claude d'interroger les données de ton appli.
// Lecture seule. Ne renvoie jamais les mots de passe / hachages / 2FA.
//
//   node server.js           -> mode local (stdio), pour Claude Desktop
//   node server.js --http    -> mode distant (HTTP), pour Claude web / mobile
//
// Comptes accessibles : variable GT_USERS (ex. "matteo,leo"). Seuls ces comptes
// peuvent être lus, le premier est le compte par défaut.

import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const DB_URL = (
  process.env.GT_DB_URL ||
  "https://gametrack-a345a-default-rtdb.europe-west1.firebasedatabase.app"
).replace(/\/+$/, "");
const FB_KEY = process.env.GT_FB_KEY || ""; // seulement si tu as protégé ta base

const norm = (s) =>
  String(s || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

// Liste blanche des comptes lisibles
const USERS = (process.env.GT_USERS || process.env.GT_USER || "matteo,leo")
  .split(",")
  .map(norm)
  .filter(Boolean);
if (!USERS.length) throw new Error("GT_USERS est vide");

const ACH = JSON.parse(
  readFileSync(new URL("./achievements.json", import.meta.url), "utf-8")
);

// ---------- Lecture Firebase (mêmes règles d'encodage des clés que l'appli) ----------
const fbDk = (k) =>
  k.replace(/%(25|2E|24|23|5B|5D|2F)/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
const fbDec = (v) => {
  if (Array.isArray(v)) return v.map(fbDec);
  if (v && typeof v === "object") {
    const o = {};
    for (const k in v) o[fbDk(k)] = fbDec(v[k]);
    return o;
  }
  return v;
};
const auth = FB_KEY ? `?auth=${encodeURIComponent(FB_KEY)}` : "";

function resolveUser(compte) {
  const u = norm(compte || USERS[0]);
  if (!USERS.includes(u)) {
    throw new Error(
      `Compte "${compte}" non autorisé. Comptes disponibles : ${USERS.join(", ")}`
    );
  }
  return u;
}

const cache = new Map();
async function loadData(user) {
  const hit = cache.get(user);
  if (hit && Date.now() - hit.t < 30_000) return hit.data;
  const base = `${DB_URL}/users/${encodeURIComponent(user)}`;
  const [rd, rn] = await Promise.all([
    fetch(`${base}/data.json${auth}`, { cache: "no-store" }),
    fetch(`${base}/name.json${auth}`, { cache: "no-store" }),
  ]);
  if (!rd.ok) throw new Error(`Firebase a répondu ${rd.status} pour "${user}"`);
  const raw = fbDec(await rd.json());
  if (!raw) throw new Error(`Aucune donnée pour le compte "${user}"`);
  const name = rn.ok ? await rn.json() : null;
  const games = Array.isArray(raw.games) ? raw.games : Object.values(raw.games || {});
  const data = {
    id: user,
    nom: typeof name === "string" && name ? name : user,
    games: games.filter(Boolean),
    ach: raw.ach || {},
    acc: raw.acc || {},
    ctr: raw.ctr || {},
    shop: raw.shop || {},
  };
  cache.set(user, { t: Date.now(), data });
  return data;
}

// ---------- Helpers ----------
const num = (x) => +x || 0;
const winrate = (g) => {
  const t = num(g.wins) + num(g.losses);
  return t ? Math.round((num(g.wins) / t) * 1000) / 10 : null;
};
const fmtGame = (g) => ({
  jeu: g.name,
  rang: g.rank || null,
  victoires: num(g.wins),
  defaites: num(g.losses),
  parties: num(g.wins) + num(g.losses),
  taux_de_victoire_pct: winrate(g),
  kills: num(g.kills),
});
const unlockedIds = (d) => Object.keys(d.ach).filter((id) => d.ach[id]);
const summary = (d) => {
  const w = d.games.reduce((t, g) => t + num(g.wins), 0);
  const l = d.games.reduce((t, g) => t + num(g.losses), 0);
  const k = d.games.reduce((t, g) => t + num(g.kills), 0);
  return {
    compte: d.id,
    nom_affiche: d.nom,
    nombre_de_jeux: d.games.length,
    victoires: w,
    defaites: l,
    kills: k,
    taux_de_victoire_global_pct: w + l ? Math.round((w / (w + l)) * 1000) / 10 : null,
    succes_debloques: `${unlockedIds(d).length} / ${Object.keys(ACH).length}`,
    visites_appli: num(d.ctr.visits),
    pieces_gagnees_boutique: num(d.shop.gain),
    pieces_depensees: num(d.shop.spent),
  };
};
const text = (obj) => ({
  content: [{ type: "text", text: typeof obj === "string" ? obj : JSON.stringify(obj, null, 2) }],
});
const compteArg = z
  .string()
  .optional()
  .describe(`Compte à interroger (${USERS.join(", ")}). Par défaut : ${USERS[0]}`);

// ---------- Serveur MCP ----------
function buildServer() {
  const server = new McpServer({ name: "gametrack", version: "1.1.0" });
  const ro = { readOnlyHint: true, openWorldHint: true };

  server.registerTool(
    "gametrack_comptes",
    {
      title: "Comptes GameTrack",
      description:
        "Liste les comptes GameTrack accessibles avec un mini-résumé de chacun (jeux, succès, visites). Utile pour comparer les comptes.",
      inputSchema: {},
      annotations: ro,
    },
    async () => {
      const out = [];
      for (const u of USERS) {
        try {
          out.push(summary(await loadData(u)));
        } catch (e) {
          out.push({ compte: u, erreur: e.message });
        }
      }
      return text(out);
    }
  );

  server.registerTool(
    "gametrack_resume",
    {
      title: "Résumé d'un compte",
      description:
        "Vue d'ensemble d'un compte GameTrack : nombre de jeux, totaux victoires/défaites/kills, taux de victoire global, succès débloqués, visites.",
      inputSchema: { compte: compteArg },
      annotations: ro,
    },
    async ({ compte }) => text(summary(await loadData(resolveUser(compte))))
  );

  server.registerTool(
    "gametrack_jeux",
    {
      title: "Liste des jeux",
      description:
        "Liste les jeux suivis par un compte avec rang, victoires, défaites, kills et taux de victoire. Peut filtrer par nom et trier.",
      inputSchema: {
        compte: compteArg,
        recherche: z.string().optional().describe("Partie du nom du jeu à chercher"),
        tri: z
          .enum(["taux_de_victoire", "kills", "victoires", "parties", "nom"])
          .optional()
          .describe("Critère de tri (décroissant, sauf nom)"),
        limite: z.number().int().min(1).max(100).optional(),
      },
      annotations: ro,
    },
    async ({ compte, recherche, tri, limite }) => {
      const d = await loadData(resolveUser(compte));
      let list = d.games.map(fmtGame);
      if (recherche) list = list.filter((g) => norm(g.jeu).includes(norm(recherche)));
      const sorters = {
        taux_de_victoire: (a, b) => (b.taux_de_victoire_pct ?? -1) - (a.taux_de_victoire_pct ?? -1),
        kills: (a, b) => b.kills - a.kills,
        victoires: (a, b) => b.victoires - a.victoires,
        parties: (a, b) => b.parties - a.parties,
        nom: (a, b) => a.jeu.localeCompare(b.jeu),
      };
      if (tri) list.sort(sorters[tri]);
      return text(list.length ? list.slice(0, limite ?? 100) : "Aucun jeu trouvé.");
    }
  );

  server.registerTool(
    "gametrack_jeu",
    {
      title: "Détail d'un jeu",
      description: "Statistiques détaillées d'un jeu précis (recherche par nom, tolérante aux accents).",
      inputSchema: { nom: z.string().describe("Nom du jeu, ex. Valorant"), compte: compteArg },
      annotations: ro,
    },
    async ({ nom, compte }) => {
      const d = await loadData(resolveUser(compte));
      const q = norm(nom);
      const g =
        d.games.find((x) => norm(x.name) === q) ||
        d.games.find((x) => norm(x.name).includes(q));
      if (!g) return text(`Aucun jeu trouvé pour "${nom}" sur le compte ${d.id}.`);
      return text({ compte: d.id, ...fmtGame(g) });
    }
  );

  server.registerTool(
    "gametrack_succes",
    {
      title: "Succès",
      description:
        "Liste les succès d'un compte GameTrack, débloqués ou restants, avec leur description.",
      inputSchema: {
        compte: compteArg,
        statut: z.enum(["debloques", "restants", "tous"]).optional().describe("Par défaut : tous"),
      },
      annotations: ro,
    },
    async ({ compte, statut }) => {
      const d = await loadData(resolveUser(compte));
      const rows = Object.entries(ACH).map(([id, a]) => ({
        id,
        nom: a.name,
        description: a.desc,
        debloque: !!d.ach[id],
      }));
      const s = statut || "tous";
      const out =
        s === "debloques" ? rows.filter((r) => r.debloque)
        : s === "restants" ? rows.filter((r) => !r.debloque)
        : rows;
      const inconnus = unlockedIds(d).filter((id) => !ACH[id]);
      return text({
        compte: d.id,
        total: rows.length,
        debloques: rows.filter((r) => r.debloque).length,
        ...(inconnus.length ? { autres_succes_non_listes: inconnus } : {}),
        succes: out,
      });
    }
  );

  server.registerTool(
    "gametrack_comptes_lies",
    {
      title: "Comptes liés",
      description: "Plateformes liées à un compte (Riot Games, Epic Games, Xbox…).",
      inputSchema: { compte: compteArg },
      annotations: ro,
    },
    async ({ compte }) => {
      const d = await loadData(resolveUser(compte));
      return text(Object.keys(d.acc).length ? { compte: d.id, ...d.acc } : "Aucun compte de plateforme lié.");
    }
  );

  return server;
}

// ---------- Démarrage ----------
if (process.argv.includes("--http")) {
  const TOKEN = process.env.MCP_TOKEN;
  if (!TOKEN || TOKEN.length < 16) {
    console.error("Définis MCP_TOKEN (16 caractères minimum) : il protège l'accès à tes données.");
    process.exit(1);
  }
  const PORT = +process.env.PORT || 3000;
  createServer(async (req, res) => {
    if (req.url !== `/mcp/${TOKEN}`) {
      res.writeHead(404).end("Not found");
      return;
    }
    if (req.method !== "POST") {
      res.writeHead(405, { Allow: "POST" }).end();
      return;
    }
    try {
      let raw = "";
      for await (const c of req) raw += c;
      const body = raw ? JSON.parse(raw) : undefined;
      const server = buildServer();
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      res.on("close", () => {
        transport.close();
        server.close();
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
    } catch (e) {
      console.error(e);
      if (!res.headersSent) res.writeHead(500).end("Erreur serveur");
    }
  }).listen(PORT, () =>
    console.error(`GameTrack MCP (HTTP) sur le port ${PORT} · comptes : ${USERS.join(", ")}`)
  );
} else {
  await buildServer().connect(new StdioServerTransport());
}
