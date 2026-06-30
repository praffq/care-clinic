# Install CARE Clinic on Windows

Follow these once on the **server PC** — the computer that stays on and runs the
clinic. Other devices install nothing; they open `http://care.local`.

> Budget ~15–25 minutes for the first setup. Internet is needed **for setup only**.
> The app is pure Go — **no WSL, no Git Bash, no bash** is required to run it.

---

## 1. Requirements

| Need | Why | How |
|---|---|---|
| **Windows 10/11** (64-bit) | the server OS | — |
| **Docker Desktop**, running (WSL 2 backend) | runs the whole stack | [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/) → install → enable WSL 2 if prompted → open it |
| **Git for Windows** | downloads + builds CARE once | [git-scm.com/download/win](https://git-scm.com/download/win) → install with defaults |
| **Apple Bonjour** *or* a static IP | makes `care.local` resolvable (see step 2) | [Bonjour Print Services](https://support.apple.com/kb/DL999) |

> **Hardware:** 8 GB RAM minimum (16 GB recommended), ~10 GB free disk. Docker
> Desktop on Windows needs virtualization enabled in the BIOS (usually on by default).

---

## 2. Make `care.local` resolvable

**Windows cannot advertise its own `.local` name** the way macOS/Linux do, so pick one:

### Option A — Apple Bonjour (gives you `http://care.local`)
1. Install **Bonjour Print Services** (link above).
2. Rename the PC to `care`: **Settings → System → About → Rename this PC** → `care` → restart.
3. After restart, devices on the WiFi can reach `http://care.local`.

### Option B — Static IP (no extra software)
1. Give the PC a fixed IP (router DHCP reservation, or Windows network settings), e.g. `192.168.1.50`.
2. Staff open `http://192.168.1.50/` instead of `http://care.local`.
3. **Also** set, in `backend.env`:
   `BUCKET_EXTERNAL_ENDPOINT=http://192.168.1.50:9100`
   and in `frontend.env`: `REACT_CARE_API_URL=http://192.168.1.50` (then `care rebuild-frontend`).

> The installer's **step 3 check** passes when `care.local` resolves. If you chose a
> static IP, that check won't go green — use the CLI path, or install Bonjour to use
> the wizard. The frontend is built for `care.local` by default, so **Option A is the
> smoother path**.

---

## 3. Get the app

1. Download `CARE-Clinic-windows.zip` from the project's **GitHub Releases** page.
2. Unzip it. (Windows SmartScreen may warn about an unsigned app — **More info → Run anyway**.)
3. Run **CARE Clinic.exe**.

---

## 4. Run the setup wizard

The installer shows gated steps — each must be green before **Install & Start** enables:

1. **Docker** — green when Docker Desktop is running.
2. **Git** — green when Git for Windows is installed.
3. **Network name — care.local** — green once Bonjour + the PC name (`care`) are set.
4. **Install location** *(optional)*.
5. **Backup location** *(optional)* — a USB/external drive is recommended.
6. **Admin password** *(optional)* — blank = `admin`.

Click **Install & Start**. It clones + builds CARE and starts the stack (several minutes).

---

## 5. Log in

Open **http://care.local/** (or `http://<your-static-ip>/`) on any device on the WiFi:

- **Username:** `admin`
- **Password:** what you set (or `admin`)

**Change it immediately** at `/admin/`.

---

## Notes

- Tick **Start at login** in the panel so CARE returns after a reboot. Also set
  **Docker Desktop → Settings → General → Start Docker Desktop when you log in**, so
  the containers come back automatically.
- Closing the window leaves CARE running.
- See [troubleshooting.md](troubleshooting.md) for `care.local` and Docker issues.
