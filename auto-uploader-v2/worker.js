const OWNER = "rahmadkn60-a11y";
const REPOSITORY = "LOADSTRINGVANZ";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders()
      });
    }

    // WORKER STATUS
    if (
      request.method === "GET" &&
      url.pathname === "/"
    ) {
      return json({
        success: true,
        service: "Load Generator TMPEK",
        status: "online",
        repository: `${OWNER}/${REPOSITORY}`
      });
    }

    // UPLOAD API
    if (
      request.method === "POST" &&
      url.pathname === "/api/upload"
    ) {
      return handleUpload(request, env);
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

async function handleUpload(request, env) {
  if (!env.GITHUB_TOKEN) {
    return json(
      {
        success: false,
        error: "GITHUB_TOKEN belum dipasang."
      },
      500
    );
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return json(
      {
        success: false,
        error: "Request JSON tidak valid."
      },
      400
    );
  }

  const code =
    typeof body.code === "string"
      ? body.code
      : "";

  if (!code.trim()) {
    return json(
      {
        success: false,
        error: "Kode Lua kosong."
      },
      400
    );
  }

  // Maksimum 2 MiB
  const size =
    new TextEncoder().encode(code).byteLength;

  if (size > 2 * 1024 * 1024) {
    return json(
      {
        success: false,
        error: "Kode terlalu besar. Maksimum 2 MiB."
      },
      413
    );
  }

  try {
    // Cari filename random
    const filename =
      await findAvailableFilename(
        env.GITHUB_TOKEN
      );

    // Encode Lua
    const encoded =
      encodeBase64(code);

    // GitHub Contents API
    const githubUrl =
      `https://api.github.com/repos/` +
      `${OWNER}/${REPOSITORY}/contents/${filename}`;

    const response =
      await fetch(
        githubUrl,
        {
          method: "PUT",

          headers: {
            "Authorization":
              `Bearer ${env.GITHUB_TOKEN}`,

            "Accept":
              "application/vnd.github+json",

            "X-GitHub-Api-Version":
              "2022-11-28",

            "Content-Type":
              "application/json",

            "User-Agent":
              "Load-Generator-TMPEK"
          },

          body:
            JSON.stringify({
              message:
                `Upload ${filename}`,

              content:
                encoded
            })
        }
      );

    const result =
      await safeJson(response);

    if (!response.ok) {
      return json(
        {
          success: false,
          error: "GitHub menolak upload.",
          status: response.status,
          message:
            result?.message ||
            "Unknown GitHub error"
        },
        502
      );
    }

    // Raw URL
    const rawUrl =
      result?.content?.download_url ||
      `https://raw.githubusercontent.com/` +
      `${OWNER}/${REPOSITORY}/HEAD/${filename}`;

    // Loadstring
    const loadstring =
      `loadstring(game:HttpGet("${rawUrl}"))()`;

    return json({
      success: true,
      filename,
      repository:
        `${OWNER}/${REPOSITORY}`,
      rawUrl,
      loadstring
    });

  } catch (error) {
    return json(
      {
        success: false,
        error:
          error?.message ||
          "Upload gagal."
      },
      500
    );
  }
}

async function findAvailableFilename(token) {
  const MAX_ATTEMPTS = 25;

  for (
    let attempt = 0;
    attempt < MAX_ATTEMPTS;
    attempt++
  ) {
    const filename =
      `${randomString(14)}.lua`;

    const checkUrl =
      `https://api.github.com/repos/` +
      `${OWNER}/${REPOSITORY}/contents/${filename}`;

    const response =
      await fetch(
        checkUrl,
        {
          method: "GET",

          headers: {
            "Authorization":
              `Bearer ${token}`,

            "Accept":
              "application/vnd.github+json",

            "X-GitHub-Api-Version":
              "2022-11-28",

            "User-Agent":
              "Load-Generator-TMPEK"
          }
        }
      );

    // 404 = file belum ada
    if (response.status === 404) {
      return filename;
    }

    // File sudah ada
    if (response.ok) {
      continue;
    }

    const result =
      await safeJson(response);

    throw new Error(
      result?.message ||
      `GitHub check error: ${response.status}`
    );
  }

  throw new Error(
    "Gagal mendapatkan nama file random."
  );
}

function randomString(length) {
  const alphabet =
    "ABCDEFGHJKLMNPQRSTUVWXYZ" +
    "abcdefghijkmnopqrstuvwxyz" +
    "23456789";

  const values =
    new Uint32Array(length);

  crypto.getRandomValues(values);

  let result = "";

  for (
    let i = 0;
    i < length;
    i++
  ) {
    result +=
      alphabet[
        values[i] % alphabet.length
      ];
  }

  return result;
}

function encodeBase64(text) {
  const bytes =
    new TextEncoder().encode(text);

  let binary = "";

  const CHUNK_SIZE = 0x8000;

  for (
    let i = 0;
    i < bytes.length;
    i += CHUNK_SIZE
  ) {
    const chunk =
      bytes.subarray(
        i,
        Math.min(
          i + CHUNK_SIZE,
          bytes.length
        )
      );

    binary +=
      String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function json(data, status = 200) {
  return new Response(
    JSON.stringify(
      data,
      null,
      2
    ),
    {
      status,

      headers: {
        ...corsHeaders(),

        "Content-Type":
          "application/json; charset=UTF-8"
      }
    }
  );
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",

    "Access-Control-Allow-Methods":
      "GET, POST, OPTIONS",

    "Access-Control-Allow-Headers":
      "Content-Type"
  };
}
