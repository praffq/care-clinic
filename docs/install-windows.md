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
| Working **mDNS** for `care.local` | so devices find the server by name (see step 2) | native on recent Windows 11; otherwise [Apple Bonjour](https://support.apple.com/kb/DL999) or a static IP |

> **Hardware:** 8 GB RAM minimum (16 GB recommended), ~10 GB free disk. Docker
> Desktop on Windows needs virtualization enabled in the BIOS (usually on by default).

---

## 2. Make `care.local` resolvable

Devices reach the clinic at `http://care.local`. **Windows can *resolve* `.local`
names natively, and recent Windows 11 builds also *advertise* their own name** — so
this often works with **no extra software**. The installer's **step-3 Check** tells
you for sure (it tests whether `care.local` actually resolves).

### Try native first (no install)
1. **Rename the PC to `care`:** Settings → System → About → **Rename this PC** → `care` → restart.
2. **Set the network to Private:** Settings → Network & Internet → your Wi-Fi/Ethernet → set **Network profile** to **Private**. *(Windows blocks multicast/mDNS on Public networks.)*
3. **Allow mDNS through the firewall:** ensure **UDP port 5353** is allowed (inbound + outbound) in Windows Defender Firewall. *(Usually already allowed; create a rule if devices can't see the PC.)*
4. In the installer, click **Check** on step 3. Green → you're done, no Bonjour needed.

### If step 3 still won't go green — pick one:

**Option A — Apple Bonjour** (reliable `care.local` on any Windows version):
- Install [Bonjour Print Services](https://support.apple.com/kb/DL999), keep the PC named `care`, re-check.

**Option B — Static IP** (no extra software, no `.local`):
- Give the PC a fixed IP (router DHCP reservation), e.g. `192.168.1.50`; staff open `http://192.168.1.50/`.
- Also set `BUCKET_EXTERNAL_ENDPOINT=http://192.168.1.50:9100` in `backend.env`, and
  `REACT_CARE_API_URL=http://192.168.1.50` in `frontend.env` (then `care rebuild-frontend`).
- Since the frontend is built for `care.local` by default, **Option A is smoother** — use the static IP only if mDNS is blocked on your network.

> **Client devices need nothing.** Macs, iPhones, and Linux resolve `care.local` out
> of the box; modern Android usually does too (older Android may need the IP).

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
3. **Network name — care.local** — green once `care.local` resolves (native on recent Windows 11 with a Private network + UDP 5353 allowed; otherwise via Bonjour — see step 2).
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
