const { json, methodNotAllowed } = require("../_lib/response");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  return json(res, 410, {
    status: "disabled",
    error: "Workout cloud copy has been permanently disabled. Notification registration remains available separately."
  });
};
