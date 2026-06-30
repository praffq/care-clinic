package care

import (
	"net"
	"net/http"
	"os/exec"
	"runtime"
	"strings"
	"time"
)

// DockerStatus reports whether the Docker daemon is reachable.
type DockerStatus struct {
	OK      bool   `json:"ok"`
	Message string `json:"message"`
}

// DockerCheck is the one prerequisite the app can't bundle.
func (e *Engine) DockerCheck() DockerStatus {
	cmd := exec.Command("docker", "version", "--format", "{{.Server.Version}}")
	cmd.Env = e.baseEnv()
	out, err := cmd.Output()
	switch {
	case err == nil:
		return DockerStatus{OK: true, Message: "Docker " + strings.TrimSpace(string(out))}
	case isNotFound(err):
		return DockerStatus{OK: false, Message: "Docker not found — install Docker Desktop to continue."}
	default:
		return DockerStatus{OK: false, Message: "Docker is installed but not running — start Docker Desktop."}
	}
}

func isNotFound(err error) bool {
	return strings.Contains(err.Error(), "executable file not found") ||
		strings.Contains(err.Error(), "cannot find the file")
}

// Health reports whether the app answers on :80 (through Caddy → backend /ping/).
type Health struct {
	Active bool   `json:"active"`
	Code   int    `json:"code"`
	Detail string `json:"detail"`
}

// Ping hits http://localhost/ping/ with a short timeout.
func (e *Engine) Ping() Health {
	client := &http.Client{Timeout: 3 * time.Second}
	resp, err := client.Get("http://localhost/ping/")
	if err != nil {
		return Health{Active: false, Code: 0, Detail: "nothing answering on :80"}
	}
	defer resp.Body.Close()
	if resp.StatusCode == 200 {
		return Health{Active: true, Code: 200, Detail: "healthy"}
	}
	return Health{Active: false, Code: resp.StatusCode, Detail: "HTTP " + strings.TrimSpace(resp.Status)}
}

// GitCheck reports whether git is available (needed for the one-time clone+build).
func (e *Engine) GitCheck() DockerStatus {
	cmd := exec.Command("git", "--version")
	cmd.Env = e.baseEnv()
	out, err := cmd.Output()
	if err == nil {
		return DockerStatus{OK: true, Message: strings.TrimSpace(string(out))}
	}
	return DockerStatus{OK: false, Message: "Git not found — install Git (Git for Windows / Xcode CLT / apt-get git)."}
}

// NameStatus reports whether this machine is reachable as <name>.local, with a
// per-OS "how" the wizard shows when it isn't.
type NameStatus struct {
	OK      bool   `json:"ok"`
	Message string `json:"message"`
	How     string `json:"how"`
}

// MDNSCheck verifies the server advertises <name>.local. It's gated in the
// installer because the frontend is baked to http://care.local.
func (e *Engine) MDNSCheck() NameStatus {
	name := e.mdnsName() // e.g. "care"
	full := name + ".local"
	switch runtime.GOOS {
	case "darwin":
		cur, _ := e.capture("scutil", "--get", "LocalHostName")
		if strings.EqualFold(cur, name) {
			return NameStatus{OK: true, Message: "This Mac is '" + full + "'"}
		}
		return NameStatus{OK: false,
			Message: "Not set yet (current name: '" + cur + "')",
			How:     "In Terminal: sudo scutil --set LocalHostName " + name + "  — or System Settings → General → Sharing → Local hostname → " + name + ". Then re-check."}
	case "linux":
		cur, _ := e.capture("hostname")
		if strings.EqualFold(cur, name) {
			return NameStatus{OK: true, Message: "Hostname is '" + name + "' (" + full + ")"}
		}
		return NameStatus{OK: false,
			Message: "Hostname is '" + cur + "', expected '" + name + "'",
			How:     "In Terminal: sudo hostnamectl set-hostname " + name + " && sudo systemctl enable --now avahi-daemon. Then re-check."}
	case "windows":
		if _, err := net.LookupHost(full); err == nil {
			return NameStatus{OK: true, Message: full + " resolves"}
		}
		return NameStatus{OK: false,
			Message: full + " doesn't resolve yet",
			How:     "Install Apple Bonjour (Bonjour Print Services) and set this PC's name to '" + name + "'. Then re-check."}
	}
	return NameStatus{OK: false, Message: "unsupported OS"}
}
