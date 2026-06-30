// CARE Clinic control app — one window, two views (installer → panel), driven by
// the Go bridge (window.go.main.App) and Wails events (window.runtime).

const App = window.go.main.App;
const on = (event: string, cb: (...data: any[]) => void) => window.runtime.EventsOn(event, cb);

const $ = <T extends HTMLElement>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`missing element: ${sel}`);
  return el;
};

type DockerStatus = { ok: boolean; message: string };
type Health = { active: boolean; code: number; detail: string };
type AppState = { setup_done: boolean; mdns_name: string; docker: DockerStatus };
type State = "running" | "partial" | "stopped" | "unknown";

let phase: "setup" | "panel" = "setup";

const wizard = $<HTMLDivElement>("#wizard");
const panel = $<HTMLDivElement>("#panel");
function showView(v: "wizard" | "panel"): void {
  wizard.hidden = v !== "wizard";
  panel.hidden = v !== "panel";
}

// Route streamed log lines to whichever view is visible.
const wlog = $<HTMLPreElement>("#wizard-log");
const logEl = $<HTMLPreElement>("#log");
function append(line: string): void {
  const el = panel.hidden ? wlog : logEl;
  el.textContent += line + "\n";
  el.scrollTop = el.scrollHeight;
}

// ===========================================================================
// Installer view — three gated checks (Docker, Git, care.local)
// ===========================================================================
const install = $<HTMLButtonElement>("#install");
const dirPath = $<HTMLSpanElement>("#dirPath");
const backupPath = $<HTMLSpanElement>("#backupPath");

const dockerDot = $<HTMLSpanElement>("#dockerDot");
const dockerMsg = $<HTMLSpanElement>("#dockerMsg");
const gitDot = $<HTMLSpanElement>("#gitDot");
const gitMsg = $<HTMLSpanElement>("#gitMsg");
const mdnsDot = $<HTMLSpanElement>("#mdnsDot");
const mdnsMsg = $<HTMLSpanElement>("#mdnsMsg");
const mdnsHow = $<HTMLParagraphElement>("#mdnsHow");

let installDir = "";
let backupDir = "";
let dockerOk = false;
let gitOk = false;
let mdnsOk = false;

function setDot(el: HTMLElement, ok: boolean): void {
  el.className = "dot " + (ok ? "running" : "stopped");
}

function gate(): void {
  install.disabled = !(dockerOk && gitOk && mdnsOk);
  $("#install-note").textContent = install.disabled ? "Complete the required steps (1–3) to continue." : "";
}

async function checkDocker(): Promise<void> {
  dockerMsg.textContent = "checking…";
  const d = await App.DockerStatus();
  dockerOk = d.ok;
  setDot(dockerDot, d.ok);
  dockerMsg.textContent = d.message;
  gate();
}

async function checkGit(): Promise<void> {
  gitMsg.textContent = "checking…";
  const d = await App.GitStatus();
  gitOk = d.ok;
  setDot(gitDot, d.ok);
  gitMsg.textContent = d.message;
  gate();
}

async function checkMDNS(): Promise<void> {
  mdnsMsg.textContent = "checking…";
  const d = await App.MDNSStatus();
  mdnsOk = d.ok;
  setDot(mdnsDot, d.ok);
  mdnsMsg.textContent = d.message;
  mdnsHow.textContent = d.ok ? "Devices reach the clinic at http://care.local." : d.how;
  mdnsHow.classList.toggle("howbox", !d.ok);
  gate();
}

$("#check-docker").addEventListener("click", () => void checkDocker());
$("#check-git").addEventListener("click", () => void checkGit());
$("#check-mdns").addEventListener("click", () => void checkMDNS());

$("#choose-dir").addEventListener("click", () => {
  void (async () => {
    const sel = await App.ChooseFolder("Choose install folder");
    if (sel) {
      installDir = sel;
      dirPath.textContent = sel;
    }
  })();
});

$("#choose-backup").addEventListener("click", () => {
  void (async () => {
    const sel = await App.ChooseFolder("Choose backup folder");
    if (sel) {
      backupDir = sel;
      backupPath.textContent = sel;
    }
  })();
});

install.addEventListener("click", () => {
  if (install.disabled) return;
  void (async () => {
    // Re-verify everything at the moment of install — the green dots could be
    // stale (Docker stopped, name changed) since the user last clicked Check.
    install.disabled = true;
    $("#install-note").textContent = "Re-checking requirements…";
    await Promise.all([checkDocker(), checkGit(), checkMDNS()]);
    if (!(dockerOk && gitOk && mdnsOk)) {
      // gate() already re-disabled Install; point at what regressed.
      $("#install-note").textContent = "A requirement is no longer met — fix the red step above and try again.";
      return;
    }

    install.disabled = true;
    $("#wizard-console").hidden = false;
    append("Starting one-time setup… (clones + builds the images; several minutes)");
    phase = "setup";
    void App.RunSetup("care.local", $<HTMLInputElement>("#adminpw").value, installDir, backupDir).catch(
      (e) => append(`error: ${String(e)}`),
    );
  })();
});

// ===========================================================================
// Panel view — .env  <->  form
// ===========================================================================
type Entry = { kind: "comment" | "blank" | "kv"; raw?: string; key?: string; value?: string; isNew?: boolean };

function parseEnv(text: string): Entry[] {
  const lines = text.split(/\r?\n/);
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  return lines.map((line): Entry => {
    if (line.trim() === "") return { kind: "blank" };
    if (line.trimStart().startsWith("#")) return { kind: "comment", raw: line };
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m) return { kind: "kv", key: m[1], value: m[2] };
    return { kind: "comment", raw: line };
  });
}

function serializeEnv(entries: Entry[]): string {
  const out = entries
    .map((e) => {
      if (e.kind === "comment") return e.raw ?? "";
      if (e.kind === "blank") return "";
      if (!e.key || e.key.trim() === "") return null;
      return `${e.key}=${e.value ?? ""}`;
    })
    .filter((l): l is string => l !== null);
  return out.join("\n") + "\n";
}

class EnvEditor {
  entries: Entry[] = [];
  constructor(
    private name: "backend" | "frontend",
    private container: HTMLElement,
  ) {}

  async load(): Promise<void> {
    try {
      this.entries = parseEnv(await App.ReadEnv(this.name));
    } catch (e) {
      this.entries = [{ kind: "comment", raw: `# could not read ${this.name}.env: ${String(e)}` }];
    }
    this.render();
  }

  render(): void {
    this.container.innerHTML = "";
    this.entries.forEach((e, idx) => {
      if (e.kind !== "kv") return;
      const row = document.createElement("div");
      row.className = "env-row";

      if (e.isNew) {
        const k = document.createElement("input");
        k.type = "text";
        k.placeholder = "NEW_KEY";
        k.value = e.key ?? "";
        k.className = "env-key-input";
        k.addEventListener("input", () => (this.entries[idx].key = k.value));
        row.appendChild(k);
      } else {
        const label = document.createElement("label");
        label.className = "env-key";
        label.textContent = e.key ?? "";
        row.appendChild(label);
      }

      const v = document.createElement("input");
      v.type = "text";
      v.value = e.value ?? "";
      v.className = "env-val-input";
      v.spellcheck = false;
      v.addEventListener("input", () => (this.entries[idx].value = v.value));
      row.appendChild(v);

      if (e.isNew) {
        const rm = document.createElement("button");
        rm.className = "ghost env-remove";
        rm.textContent = "×";
        rm.title = "remove";
        rm.addEventListener("click", () => {
          this.entries.splice(idx, 1);
          this.render();
        });
        row.appendChild(rm);
      }
      this.container.appendChild(row);
    });
  }

  add(): void {
    this.entries.push({ kind: "kv", key: "", value: "", isNew: true });
    this.render();
  }

  async save(): Promise<void> {
    await App.WriteEnv(this.name, serializeEnv(this.entries));
  }
}

const beEditor = new EnvEditor("backend", $("#be-form"));
const feEditor = new EnvEditor("frontend", $("#fe-form"));

// ===========================================================================
// Panel view — buttons + status
// ===========================================================================
const statusText = $<HTMLSpanElement>("#statusText");
const statusDot = $<HTMLSpanElement>("#dot");
const openLink = $<HTMLAnchorElement>("#openLink");
const autostartCb = $<HTMLInputElement>("#autostart");

let busy = false;
let lastState: State = "unknown";
let mdnsName = "care.local";

const buttons = {
  start: $<HTMLButtonElement>("#btn-start"),
  stop: $<HTMLButtonElement>("#btn-stop"),
  restart: $<HTMLButtonElement>("#btn-restart"),
  rebuild: $<HTMLButtonElement>("#btn-rebuild-frontend"),
  backup: $<HTMLButtonElement>("#btn-backup-now"),
  beSave: $<HTMLButtonElement>("#be-save"),
  feSave: $<HTMLButtonElement>("#fe-save"),
  beAdd: $<HTMLButtonElement>("#be-add"),
  feAdd: $<HTMLButtonElement>("#fe-add"),
};

function disableAll(): void {
  Object.values(buttons).forEach((b) => (b.disabled = true));
}

function applyState(state: State): void {
  const running = state === "running";
  const partial = state === "partial";
  const stopped = state === "stopped";
  buttons.start.disabled = busy || running || partial;
  buttons.stop.disabled = busy || stopped;
  buttons.restart.disabled = busy || stopped;
  buttons.backup.disabled = busy || stopped;
  buttons.rebuild.disabled = busy;
  buttons.beSave.disabled = busy;
  buttons.feSave.disabled = busy;
  buttons.beAdd.disabled = busy;
  buttons.feAdd.disabled = busy;

  statusDot.className = "dot " + (running ? "running" : partial ? "partial" : stopped ? "stopped" : "");
  statusText.textContent = running
    ? `running · ${mdnsName} is live`
    : partial
      ? "starting / partial…"
      : stopped
        ? "stopped"
        : "checking…";
}

async function refresh(): Promise<void> {
  if (busy || panel.hidden) return;
  let state: State;
  try {
    const h = await App.CareHealth();
    if (h.active) {
      state = "running";
    } else {
      let ps = "";
      try {
        ps = await App.CareStatus();
      } catch {
        ps = "";
      }
      state = ps.trim() ? "partial" : "stopped";
    }
  } catch {
    state = "stopped";
  }
  lastState = state;
  applyState(state);
}

function setBusy(b: boolean): void {
  busy = b;
  if (b) disableAll();
  else applyState(lastState);
}

async function run(action: string, note?: string): Promise<void> {
  if (busy) return;
  setBusy(true);
  append(`\n$ care ${action}${note ? `   # ${note}` : ""}`);
  try {
    await App.CareAction(action);
  } catch (e) {
    append(`error: ${String(e)}`);
    setBusy(false);
  }
}

buttons.start.addEventListener("click", () => void run("start"));
buttons.stop.addEventListener("click", () => void run("stop"));
buttons.restart.addEventListener("click", () => void run("restart"));
buttons.rebuild.addEventListener("click", () => void run("rebuild-frontend"));
buttons.backup.addEventListener("click", () => void run("backup-now"));
buttons.beAdd.addEventListener("click", () => beEditor.add());
buttons.feAdd.addEventListener("click", () => feEditor.add());

buttons.beSave.addEventListener("click", () => {
  if (busy) return;
  void (async () => {
    try {
      await beEditor.save();
      append("\nsaved backend.env");
      await run("start", "recreate backend with new settings");
    } catch (e) {
      append(`error saving backend.env: ${String(e)}`);
    }
  })();
});

buttons.feSave.addEventListener("click", () => {
  if (busy) return;
  void (async () => {
    try {
      await feEditor.save();
      append("\nsaved frontend.env");
      await run("rebuild-frontend", "rebuild app image with new settings");
    } catch (e) {
      append(`error saving frontend.env: ${String(e)}`);
    }
  })();
});

$("#clear-log").addEventListener("click", () => {
  logEl.textContent = "";
});

openLink.addEventListener("click", (e) => {
  e.preventDefault();
  void App.OpenURL(openLink.href);
});

autostartCb.addEventListener("change", () => {
  void (async () => {
    const want = autostartCb.checked;
    try {
      await App.SetAutostart(want);
      append(want ? "\nStart at login: ON" : "\nStart at login: OFF");
    } catch (e) {
      append(`autostart error: ${String(e)}`);
    }
    // Always reflect the real OS state, so the box can't drift from reality
    // (stays checked when it's actually on, even after reloads/errors).
    await syncAutostart();
  })();
});

async function syncAutostart(): Promise<void> {
  try {
    autostartCb.checked = await App.AutostartEnabled();
  } catch {
    /* ignore */
  }
}

// ===========================================================================
// Events
// ===========================================================================
on("care-log", (line: string) => append(line));
on("care-done", (code: number) => {
  if (phase === "setup") {
    if (code !== 0) {
      append(`\n✖ Setup failed (exit ${code}). Fix the issue above and try again.`);
      install.disabled = false;
    }
    return; // success path handled by setup-done
  }
  append(`— done (exit ${code}) —`);
  setBusy(false);
  void refresh();
});
on("setup-done", () => {
  append("\n✔ Setup complete — opening the control panel…");
  phase = "panel";
  showView("panel");
  void bootPanel();
});

// ===========================================================================
// Boot
// ===========================================================================
async function bootPanel(): Promise<void> {
  const state = await App.GetState();
  mdnsName = state.mdns_name || "care.local";
  openLink.href = `http://${mdnsName}/`;
  openLink.textContent = `Open ${mdnsName} ↗`;

  await beEditor.load();
  await feEditor.load();
  await refresh();

  await syncAutostart();

  try {
    if (await App.WasAutostartLaunched()) {
      const h = await App.CareHealth();
      if (!h.active && !busy) {
        append("\nLaunched at startup — starting CARE…");
        await run("start");
      }
    }
  } catch {
    /* ignore */
  }
}

async function boot(): Promise<void> {
  const state: AppState = await App.GetState();
  if (state.setup_done) {
    phase = "panel";
    showView("panel");
    await bootPanel();
  } else {
    phase = "setup";
    showView("wizard");
    await Promise.all([checkDocker(), checkGit(), checkMDNS()]);
  }
}

void boot();
setInterval(() => void refresh(), 5_000);
