const CORS_HEADERS = {
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
        headers: CORS_HEADERS
      });
    }

    // Jangan pernah biarkan /api/*
    // jatuh ke index.html.
    if (url.pathname.startsWith("/api/")) {
      if (
        url.pathname === "/api/status" &&
        request.method === "GET"
      ) {
        return handleStatus(env);
      }

      if (
        url.pathname === "/api/upload" &&
        request.method === "POST"
      ) {
        return handleUpload(request, env);
      }

      return json(
        {
          success: false,
          error: "API endpoint tidak ditemukan."
        },
        404
      );
    }

    // Semua request non-API diteruskan ke static assets.
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response(
      "Static assets tidak tersedia.",
      {
        status: 500,
        headers: CORS_HEADERS
      }
    );
  }
};

function handleStatus(env) {
  const token =
    typeof env.GITHUB_TOKEN === "string" &&
    env.GITHUB_TOKEN.trim() !== "";

  const owner =
    typeof env.GITHUB_OWNER === "string" &&
    env.GITHUB_OWNER.trim() !== "";

  const repo =
    typeof env.GITHUB_REPO === "string" &&
    env.GITHUB_REPO.trim() !== "";

  return json({
    success: true,
    configured:
      token && owner && repo,
    environment: {
      GITHUB_TOKEN: token,
      GITHUB_OWNER: owner,
      GITHUB_REPO: repo
    },
    repository:
      owner && repo
        ? `${env.GITHUB_OWNER}/${env.GITHUB_REPO}`
        : null
  });
}

async function handleUpload(request, env) {
  if (
    !env.GITHUB_TOKEN ||
    !env.GITHUB_OWNER ||
    !env.GITHUB_REPO
  ) {
    return json(
      {
        success: false,
        error:
          "Konfigurasi GitHub belum lengkap. Pastikan GITHUB_TOKEN, GITHUB_OWNER, dan GITHUB_REPO sudah dipasang."
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

  const size =
    new TextEncoder()
      .encode(code)
      .byteLength;

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
    const filename =
      await findAvailableFilename(env);

    const encoded =
      encodeBase64(
        new TextEncoder().encode(code)
      );

    const endpoint =
      `https://api.github.com/repos/` +
      `${env.GITHUB_OWNER}/` +
      `${env.GITHUB_REPO}/` +
      `contents/${filename}`;

    const response =
      await fetch(endpoint, {
        method: "PUT",

        headers: {
          Authorization:
            `Bearer ${env.GITHUB_TOKEN}`,

          Accept:
            "application/vnd.github+json",

          "X-GitHub-Api-Version":
            "2022-11-28",

          "Content-Type":
            "application/json",

          "User-Agent":
            "LOADSTRINGVANZ"
        },

        body: JSON.stringify({
          message:
            `Upload ${filename}`,

          content:
            encoded
        })
      });

    const result =
      await safeJson(response);

    if (!response.ok) {
      return json(
        {
          success: false,
          error:
            "GitHub menolak upload.",
          status:
            response.status,
          message:
            result?.message ||
            "Unknown GitHub error"
        },
        502
      );
    }

    const rawUrl =
      result?.content?.download_url ||
      `https://raw.githubusercontent.com/` +
      `${env.GITHUB_OWNER}/` +
      `${env.GITHUB_REPO}/HEAD/${filename}`;

    return json({
      success: true,
      filename,
      rawUrl,
      loadstring:
        `loadstring(game:HttpGet("${rawUrl}"))()`
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

async function findAvailableFilename(env) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const filename =
      `${randomString(16)}.lua`;

    const endpoint =
      `https://api.github.com/repos/` +
      `${env.GITHUB_OWNER}/` +
      `${env.GITHUB_REPO}/` +
      `contents/${filename}`;

    const response =
      await fetch(endpoint, {
        method: "GET",

        headers: {
          Authorization:
            `Bearer ${env.GITHUB_TOKEN}`,

          Accept:
            "application/vnd.github+json",

          "X-GitHub-Api-Version":
            "2022-11-28",

          "User-Agent":
            "LOADSTRINGVANZ"
        }
      });

    if (response.status === 404) {
      return filename;
    }

    if (response.ok) {
      continue;
    }

    const result =
      await safeJson(response);

    throw new Error(
      result?.message ||
      `GitHub check error ${response.status}`
    );
  }

  throw new Error(
    "Gagal mendapatkan nama file unik."
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

  for (let i = 0; i < length; i++) {
    result +=
      alphabet[
        values[i] % alphabet.length
      ];
  }

  return result;
}

function encodeBase64(bytes) {
  let binary = "";

  const chunkSize = 0x8000;

  for (
    let i = 0;
    i < bytes.length;
    i += chunkSize
  ) {
    const chunk =
      bytes.subarray(
        i,
        Math.min(
          i + chunkSize,
          bytes.length
        )
      );

    binary += String.fromCharCode(
      ...chunk
    );
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
    JSON.stringify(data, null, 2),
    {
      status,
      headers: {
        ...CORS_HEADERS,
        "Content-Type":
          "application/json; charset=utf-8"
      }
    }
  );
}
