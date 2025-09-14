import { trim, trimOrNull, upper } from "../core/utils.js";

export function makeEditor({ fields }) {
  let mode = "view"; // view | edit | create
  let initial = null; // entity
  let draft = {}; // temp edits

  const toPayload = () => {
    const obj = {};
    fields.forEach((f) => {
      const v = draft[f.key] ?? initial?.[f.key] ?? "";
      if (f.key === "name") obj[f.key] = trim(v);
      else obj[f.key] = trimOrNull(v);
      if (f.key === "code" && obj[f.key]) obj[f.key] = upper(obj[f.key]);
    });
    return obj;
  };

  return {
    get mode() {
      return mode;
    },
    setMode: (m) => (mode = m),
    setInitial: (ent) => {
      initial = ent;
      draft = {};
    },
    getInitial: () => initial,
    setDraftFromInitial: () => {
      draft = Object.fromEntries(
        fields.map((f) => [f.key, initial?.[f.key] ?? ""])
      );
    },
    setDraftEmpty: () => {
      draft = Object.fromEntries(fields.map((f) => [f.key, ""]));
    },
    updateField: (k, val) => {
      draft[k] = val;
    },
    getWorking: () => ({ ...(mode === "create" ? {} : initial), ...draft }),
    toPayload,
    clearDraft: () => {
      draft = {};
    },
  };
}
