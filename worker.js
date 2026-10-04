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

    if (url.pathname === "/api/status" && request.method === "GET") {
      const configured =
        Boolean(env.GITHUB_TOKEN) &&
        Boolean(env.GITHUB_OWNER) &&
        Boolean(env.GITHUB_REPO);

      return json({
        success: true,
        configured,
        service: "LOADSTRINGVANZ",
        repository: configured
          ? `${env.GITHUB_OWNER}/${env.GITHUB_REPO}`
          : null
      });
    }

    if (
      url.pathname === "/api/upload" &&
      request.method === "POST"
    ) {
      return upload(request, env);
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

async function upload(request, env) {
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
        error: "JSON request tidak valid."
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

  const bytes =
    new TextEncoder().encode(code);

  if (bytes.byteLength > 2 * 1024 * 1024) {
    return json(
      {
        success: false,
        error: "Ukuran kode melebihi 2 MiB."
      },
      413
    );
  }

  try {
    const filename =
      await generateUniqueFilename(env);

    const encoded =
      bytesToBase64(bytes);

    const githubEndpoint =
      `https://api.github.com/repos/` +
      `${env.GITHUB_OWNER}/` +
      `${env.GITHUB_REPO}/` +
      `contents/${filename}`;

    const response = await fetch(
      githubEndpoint,
      {
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
            "LOADSTRINGVANZ-Uploader"
        },

        body: JSON.stringify({
          message:
            `Upload ${filename}`,

          content:
            encoded
        })
      }
    );

    const result =
      await parseJson(response);

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

async function generateUniqueFilename(env) {
  for (let i = 0; i < 20; i++) {
    const filename =
      `${randomName(16)}.lua`;

    const endpoint =
      `https://api.github.com/repos/` +
      `${env.GITHUB_OWNER}/` +
      `${env.GITHUB_REPO}/` +
      `contents/${filename}`;

    const response = await fetch(
      endpoint,
      {
        headers: {
          Authorization:
            `Bearer ${env.GITHUB_TOKEN}`,

          Accept:
            "application/vnd.github+json",

          "X-GitHub-Api-Version":
            "2022-11-28",

          "User-Agent":
            "LOADSTRINGVANZ-Uploader"
        }
      }
    );

    if (response.status === 404) {
      return filename;
    }

    if (response.ok) {
      continue;
    }

    const result =
      await parseJson(response);

    throw new Error(
      result?.message ||
      `GitHub error ${response.status}`
    );
  }

  throw new Error(
    "Tidak bisa mendapatkan nama file unik."
  );
}

function randomName(length) {
  const alphabet =
    "ABCDEFGHJKLMNPQRSTUVWXYZ" +
    "abcdefghijkmnopqrstuvwxyz" +
    "23456789";

  const values =
    new Uint32Array(length);

  crypto.getRandomValues(values);

  let output = "";

  for (let i = 0; i < length; i++) {
    output +=
      alphabet[
        values[i] % alphabet.length
      ];
  }

  return output;
}

function bytesToBase64(bytes) {
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

async function parseJson(response) {
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
        ...CORS,
        "Content-Type":
          "application/json; charset=utf-8"
      }
    }
  );
}
