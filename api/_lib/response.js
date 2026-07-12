function json(res, status, body) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("X-Content-Type-Options", "nosniff");
  return res.status(status).json(body);
}

function methodNotAllowed(res, allowed) {
  res.setHeader("Allow", allowed.join(", "));
  return json(res, 405, { error: "Method not allowed." });
}

function apiHandler(handler) {
  return async function protectedHandler(req, res) {
    try {
      return await handler(req, res);
    } catch {
      return json(res, 500, { error: "The service could not complete this request." });
    }
  };
}

module.exports = { apiHandler, json, methodNotAllowed };
