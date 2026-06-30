package care

import (
	"fmt"
	"time"
)

// Start brings the stack up: ensure both images, mDNS, `compose up -d`, migrate,
// then a default admin. Mirrors `care.sh start`.
func (e *Engine) Start() error {
	if err := e.ensureBackendImage(); err != nil {
		return err
	}
	if err := e.ensureFrontendImage(); err != nil {
		return err
	}
	e.ensureMDNS()
	e.logln("Starting CARE...")
	if err := e.dc("up", "-d"); err != nil {
		return err
	}
	e.logln("Applying database migrations...")
	e.migrate()
	e.createAdmin()
	e.logln("")
	e.logln("CARE is up → http://" + e.mdnsName() + ".local/   (login: admin / admin)")
	return nil
}

func (e *Engine) Stop() error    { e.logln("Stopping CARE (data kept)..."); return e.dc("stop") }
func (e *Engine) Restart() error { e.logln("Restarting CARE..."); return e.dc("restart") }

// RebuildBackend rebuilds the backend image (after new backend code) and restarts
// the Django + celery services, then migrates.
func (e *Engine) RebuildBackend() error {
	if err := e.buildBackend(); err != nil {
		return err
	}
	if err := e.dc("up", "-d", "backend", "celery-worker", "celery-beat"); err != nil {
		return err
	}
	e.migrate()
	e.logln("Backend rebuilt and restarted.")
	return nil
}

// RebuildFrontend rebuilds the FE image (Vite bakes REACT_* at build time) and
// restarts the frontend service.
func (e *Engine) RebuildFrontend() error {
	if err := e.buildFrontend(); err != nil {
		return err
	}
	if err := e.dc("up", "-d", "frontend"); err != nil {
		return err
	}
	e.logln("Frontend rebuilt and restarted.")
	return nil
}

// Status returns `docker compose ps` as "<service> <state>" lines.
func (e *Engine) Status() (string, error) {
	return e.capture("docker", "compose", "ps", "--format", "{{.Service}} {{.State}}")
}

// BackupNow writes an immediate database dump into the backup folder.
func (e *Engine) BackupNow() error {
	ts := time.Now().Format("20060102-150405")
	script := fmt.Sprintf(
		`PGPASSWORD=$POSTGRES_PASSWORD pg_dump -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -Fc -d "$POSTGRES_DB" -f /backups/care-manual-%s.dump`, ts)
	if err := e.dc("exec", "-T", "backup", "sh", "-c", script); err != nil {
		return err
	}
	e.logln("Backup written to " + e.backupDir() + "/care-manual-" + ts + ".dump")
	return nil
}

// migrate runs migrations, retrying until the backend/db are ready. The prebuilt
// start.sh does NOT migrate, so we do (idempotent).
func (e *Engine) migrate() {
	for n := 1; n <= 20; n++ {
		if err := e.dc("exec", "-T", "backend", "python", "manage.py", "migrate", "--noinput"); err == nil {
			return
		}
		e.logln(fmt.Sprintf("  waiting for backend/db... (%d)", n))
		time.Sleep(5 * time.Second)
	}
	e.logln("backend not ready — run start again shortly")
}

// createAdmin makes a default admin/admin superuser (idempotent: a failure means
// it already exists, which we leave alone).
func (e *Engine) createAdmin() {
	err := e.dc("exec", "-T",
		"-e", "DJANGO_SUPERUSER_PASSWORD="+e.adminPassword(),
		"backend", "python", "manage.py", "createsuperuser", "--noinput",
		"--username", "admin", "--email", "admin@care.local")
	if err == nil {
		e.logln("Created admin login (username: admin) — change the password in the app.")
	} else {
		e.logln("Admin login already exists (left unchanged).")
	}
}
