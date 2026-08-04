const { apiHandler, json, methodNotAllowed } = require("../_lib/response");

module.exports = apiHandler(async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  return json(res, 410, {
    status: "disabled",
    error: "Workout cloud copy has been permanently disabled. No workout mutation was accepted."
  });
});

module.exports.WORKOUT_CLOUD_COPY_DISABLED = true;
