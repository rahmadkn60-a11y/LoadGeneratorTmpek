export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ================================
    // CORS
    // ================================
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders()
      });
    }

    // ================================
    // TEST / STATUS
    // ================================
    if (request.method === "GET" && url.pathname === "/") {
      return json({
        success: true,
        service: "Auto Uploader V2",
        status: "online"
      });
    }

    // ================================
    // API UPLOAD
    // ================================
    if (request.method === "POST" && url.pathname === "/api/upload") {
      return uploadToGitHub(request, env);
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


// ============================================
// GITHUB UPLOAD
// ============================================

async function uploadToGitHub(request, env) {
  const OWNER = "rahmadkn60-a11y";
  const REPO = "BUATSCRIPT";

  if (!env.GITHUB_TOKEN) {
    return json(
      {
        success: false,
        error: "GITHUB_TOKEN belum dipasang di Cloudflare."
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
        error: "Data request tidak valid."
      },
      400
    );
  }

  const code = typeof body.code === "string"
    ? body.code
    : "";

  if (!code.trim()) {
    return json(
      {
        success: false,
        error: "Kode Lua masih kosong."
      },
      400
    );
  }

  // Batas 2 MiB
  const byteLength = new TextEncoder().encode(code).length;

  if (byteLength > 2 * 1024 * 1024) {
    return json(
      {
        success: false,
        error: "Kode terlalu besar. Maksimum 2 MiB."
      },
      413
    );
  }

  try {
    // Cari nama random yang belum digunakan
    const filename = await findAvailableFilename(
      OWNER,
      REPO,
      env.GITHUB_TOKEN
    );

    // Encode UTF-8 → Base64
    const encoded = encodeBase64(code);

    const apiUrl =
      `https://api.github.com/repos/${OWNER}/${REPO}/contents/${filename}`;

    const response = await fetch(apiUrl, {
      method: "PUT",

      headers: {
        "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
        "User-Agent": "Auto-Uploader-V2"
      },

      body: JSON.stringify({
        message: `Auto upload ${filename}`,
        content: encoded
      })
    });

    const result = await safeJson(response);

    if (!response.ok) {
      return json(
        {
          success: false,
          error: "GitHub menolak upload.",
          status: response.status,
          message: result?.message || "Unknown GitHub error"
        },
        502
      );
    }

    // GitHub biasanya memberikan download_url
    const rawUrl =
      result?.content?.download_url ||
      `https://raw.githubusercontent.com/${OWNER}/${REPO}/HEAD/${filename}`;

    const loadstring =
      `loadstring(game:HttpGet("${rawUrl}"))()`;

    return json({
      success: true,

      filename,

      repository: `${OWNER}/${REPO}`,

      rawUrl,

      loadstring
    });

  } catch (error) {
    return json(
      {
        success: false,
        error: error?.message || "Upload gagal."
      },
      500
    );
  }
}


// ============================================
// CARI NAMA FILE RANDOM
// ============================================

async function findAvailableFilename(
  owner,
  repo,
  token
) {
  const MAX_ATTEMPTS = 25;

  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const filename =
      `${randomFilename(14)}.lua`;

    const url =
      `https://api.github.com/repos/${owner}/${repo}/contents/${filename}`;

    const response = await fetch(url, {
      method: "GET",

      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "Auto-Uploader-V2"
      }
    });

    // Belum ada → aman digunakan
    if (response.status === 404) {
      return filename;
    }

    // Sudah ada → generate lagi
    if (response.ok) {
      continue;
    }

    const result = await safeJson(response);

    throw new Error(
      result?.message ||
      `Gagal mengecek GitHub (${response.status}).`
    );
  }

  throw new Error(
    "Tidak berhasil mendapatkan nama file random."
  );
}


// ============================================
// RANDOM FILENAME
// ============================================

function randomFilename(length) {
  const alphabet =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

  const values =
    new Uint32Array(length);

  crypto.getRandomValues(values);

  let output = "";

  for (let i = 0; i < length; i++) {
    output +=
      alphabet[values[i] % alphabet.length];
  }

  return output;
}


// ============================================
// UTF-8 → BASE64
// ============================================

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

    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}


// ============================================
// SAFE JSON
// ============================================

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}


// ============================================
// JSON RESPONSE
// ============================================

function json(data, status = 200) {
  return new Response(
    JSON.stringify(data, null, 2),
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


// ============================================
// CORS HEADERS
// ============================================

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",

    "Access-Control-Allow-Methods":
      "GET, POST, OPTIONS",

    "Access-Control-Allow-Headers":
      "Content-Type"
  };
}
