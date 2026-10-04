export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/debug") {
      return new Response(
        JSON.stringify({
          success: true,
          worker: "loadgeneratortmpek",
          message: "WORKER BARU AKTIF"
        }),
        {
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }

    return new Response(
      "WORKER AKTIF - " + url.pathname,
      {
        status: 200,
        headers: {
          "Content-Type": "text/plain"
        }
      }
    );
  }
};
