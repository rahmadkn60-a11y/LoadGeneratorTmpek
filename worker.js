const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store"
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: CORS
      });
    }

    if (url.pathname === "/api/debug") {
      return json({
        worker: "loadgeneratortmpek",

        env: {
          GITHUB_TOKEN:
            typeof env.GITHUB_TOKEN === "string"
              ? `FOUND (${env.GITHUB_TOKEN.length} chars)`
              : "MISSING",

          GITHUB_OWNER:
            typeof env.GITHUB_OWNER === "string"
              ? `FOUND (${env.GITHUB_OWNER.length} chars)`
              : "MISSING",

          GITHUB_REPO:
            typeof env.GITHUB_REPO === "string"
              ? `FOUND (${env.GITHUB_REPO.length} chars)`
              : "MISSING"
        },

        assets:
          Boolean(env.ASSETS)
      });
    }

    if (url.pathname === "/api/status") {
      const configured =
        typeof env.GITHUB_TOKEN === "string" &&
        env.GITHUB_TOKEN.trim() !== "" &&
        typeof env.GITHUB_OWNER === "string" &&
        env.GITHUB_OWNER.trim() !== "" &&
        typeof env.GITHUB_REPO === "string" &&
        env.GITHUB_REPO.trim() !== "";

      return json({
        success: true,
        configured,
        repository: configured
          ? `${env.GITHUB_OWNER}/${env.GITHUB_REPO}`
          : null
      });
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return json(
      {
        success: false,
        error: "Endpoint tidak ditemukan."
      },
      404
    );
  }
};

function json(data, status = 200) {
  return new Response(
    JSON.stringify(data, null, 2),
    {
      status,
      headers: {
        ...CORS,
        "Content-Type":
          "application/json; charset=utf-8"
      }
    }
  );
}
