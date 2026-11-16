// Coleta as estações e réguas do sistema municipal de Cajamar (https://cajamar.catavento-surya.com/
// e https://cajamar-meteorologia.catavento-surya.com/) por raspagem/leitura da página e grava data/catavento.json.
// Suporta acesso público e login automático (via Secrets CATAVENTO_USER e CATAVENTO_PASS no GitHub Actions).
import { writeFile, rename, mkdir, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { lerCatavento, URL_CATAVENTO, URL_CATAVENTO_LOGIN, URL_CATAVENTO_PAINEL, USER_AGENT } from "../worker/cemaden-proxy.js";

function extrairCookies(headers) {
  if (!headers) return "";
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie().map((c) => c.split(";")[0]).filter(Boolean).join("; ");
  }
  const sc = headers.get ? headers.get("set-cookie") : "";
  return sc ? sc.split(/,(?=\s*[A-Za-z0-9_-]+=)/).map((c) => c.split(";")[0].trim()).join("; ") : "";
}

export async function autenticarCatavento({ buscar = fetch, loginUrl = URL_CATAVENTO_LOGIN, usuario = "", senha = "", timeoutMs = 15000 } = {}) {
  if (!usuario || !senha) return { cookies: "", token: "" };
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    // 1) GET na tela de login para obter cookie de sessão / CSRF se houver
    let cookiesIniciais = "";
    let csrf = "";
    try {
      const rGet = await buscar(loginUrl, { signal: ctl.signal, headers: { "User-Agent": USER_AGENT } });
      cookiesIniciais = extrairCookies(rGet.headers);
      const htmlLogin = await rGet.text();
      const mCsrf = /name=["'](?:_token|csrf_token|csrfToken)["']\s+value=["']([^"']+)["']/i.exec(htmlLogin);
      if (mCsrf) csrf = mCsrf[1];
    } catch (e) { /* segue para tentativa de POST direto */ }

    // 2) Tenta POST JSON e/ou Form-UrlEncoded em /login (e /api/login)
    const payloadObj = { email: usuario, username: usuario, user: usuario, login: usuario, password: senha, senha };
    if (csrf) payloadObj._token = csrf;

    const cabBase = { "User-Agent": USER_AGENT };
    if (cookiesIniciais) cabBase.Cookie = cookiesIniciais;

    const rPost = await buscar(loginUrl, {
      method: "POST",
      signal: ctl.signal,
      redirect: "manual",
      headers: { ...cabBase, "Content-Type": "application/json", Accept: "application/json, text/html" },
      body: JSON.stringify(payloadObj)
    });

    const novosCookies = extrairCookies(rPost.headers);
    const cookies = [cookiesIniciais, novosCookies].filter(Boolean).join("; ");
    let token = "";
    try {
      const j = await rPost.json();
      token = j.token || j.access_token || (j.data && j.data.token) || "";
    } catch (e) { /* resposta HTML ou redirecionamento */ }
    return { cookies, token };
  } catch (e) {
    return { cookies: "", token: "" };
  } finally {
    clearTimeout(t);
  }
}

export async function coletar({
  buscar = fetch,
  url = process.env.CATAVENTO_URL || URL_CATAVENTO,
  usuario = (process.env.CATAVENTO_USER || "").trim(),
  senha = (process.env.CATAVENTO_PASS || "").trim(),
  agora = new Date(),
  timeoutMs = 20000
} = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const auth = await autenticarCatavento({ buscar, usuario, senha, timeoutMs });
    const headers = { "User-Agent": USER_AGENT };
    if (auth.cookies) headers.Cookie = auth.cookies;
    if (auth.token) headers.Authorization = `Bearer ${auth.token}`;

    const urlsTentativa = [url];
    if (usuario && senha && !urlsTentativa.includes(URL_CATAVENTO_PAINEL)) {
      urlsTentativa.unshift(URL_CATAVENTO_PAINEL);
    }

    let ultimoErro = null;
    for (const u of urlsTentativa) {
      try {
        const r = await buscar(u, { signal: ctl.signal, headers });
        if (!r.ok) throw new Error("Catavento-Surya respondeu HTTP " + r.status);
        const texto = await r.text();
        const estacoes = lerCatavento(texto);
        return { coletadoEm: agora.toISOString(), fonte: u, autenticado: Boolean(auth.cookies || auth.token), estacoes };
      } catch (e) {
        ultimoErro = e;
      }
    }
    throw ultimoErro || new Error("Não foi possível coletar dados do Catavento-Surya");
  } finally {
    clearTimeout(t);
  }
}

export async function coletarEGravar(caminho = "data/catavento.json", opcoes) {
  const saida = await coletar(opcoes);
  await mkdir(dirname(caminho), { recursive: true });
  const tmp = caminho + ".tmp";
  try {
    await writeFile(tmp, JSON.stringify(saida, null, 1));
    await rename(tmp, caminho);
  } catch (e) {
    await unlink(tmp).catch(() => {});
    throw e;
  }
  return saida;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const s = await coletarEGravar(process.argv[2] || "data/catavento.json");
  console.log("OK: " + s.estacoes.length + " equipamento(s) lido(s) do Catavento-Surya (" + s.estacoes.map((e) => e.nome).join(", ") + ")");
}
