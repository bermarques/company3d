import fs from "node:fs";
import path from "node:path";

const MAX_EVENTS = 1000;

function records(value) {
  const out = Object.create(null);
  if (value && typeof value === "object")
    for (const [k, v] of Object.entries(value))
      if (v && typeof v === "object") out[k] = v;
  return out;
}

export function createStore(file) {
  let data = load();
  let queue = Promise.resolve();

  function load() {
    try {
      const raw = JSON.parse(fs.readFileSync(file, "utf8"));
      return {
        accounts: records(raw.accounts),
        workspaces: records(raw.workspaces),
        events: Array.isArray(raw.events) ? raw.events.slice(-MAX_EVENTS) : [],
      };
    } catch {
      return {
        accounts: Object.create(null),
        workspaces: Object.create(null),
        events: [],
      };
    }
  }

  function persist() {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, file);
  }

  return {
    read: () => data,
    update(change) {
      const run = queue.then(() => {
        const result = change(data);
        if (data.events.length > MAX_EVENTS)
          data.events.splice(0, data.events.length - MAX_EVENTS);
        persist();
        return result;
      });
      queue = run.catch(() => {});
      return run;
    },
  };
}
