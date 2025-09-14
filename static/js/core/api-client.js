import { jfetch } from "../api.js";
export const makeApi = (baseCfg) => ({
  listKeyset: async (params = {}) =>
    jfetch(
      baseCfg.listKeyset +
        (params.q ? `?q=${encodeURIComponent(params.q)}` : "")
    ),
  getById: async (id) => jfetch(baseCfg.byId(id)),
  create: async (payload) =>
    jfetch(baseCfg.base, { method: "POST", body: JSON.stringify(payload) }),
  update: async (id, payload) =>
    jfetch(baseCfg.byId(id), { method: "PUT", body: JSON.stringify(payload) }),
  remove: async (id) => jfetch(baseCfg.byId(id), { method: "DELETE" }),
});
