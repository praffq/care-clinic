package care

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// genSecret must replace the placeholder with a real, long key — exactly once.
func TestGenSecret(t *testing.T) {
	dir := t.TempDir()
	be := filepath.Join(dir, "backend.env")
	if err := os.WriteFile(be, []byte("A=1\nDJANGO_SECRET_KEY=CHANGE_ME\nB=2\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	e := &Engine{Kit: dir}
	if err := e.genSecret(); err != nil {
		t.Fatal(err)
	}
	out, _ := os.ReadFile(be)
	got := string(out)
	if strings.Contains(got, "CHANGE_ME") {
		t.Fatal("placeholder not replaced")
	}
	var key string
	for _, l := range strings.Split(got, "\n") {
		if v, ok := strings.CutPrefix(l, "DJANGO_SECRET_KEY="); ok {
			key = v
		}
	}
	if len(key) < 40 {
		t.Fatalf("key too short: %q", key)
	}
	// idempotent: a second run (no placeholder left) must not change the file.
	before, _ := os.ReadFile(be)
	if err := e.genSecret(); err != nil {
		t.Fatal(err)
	}
	after, _ := os.ReadFile(be)
	if string(before) != string(after) {
		t.Fatal("genSecret not idempotent")
	}
}

// get must resolve Env override > versions.env > default.
func TestGetResolution(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "versions.env"), []byte("# c\nBACKEND_IMAGE=pinned:v1\n"), 0o644)
	e := &Engine{Kit: dir}
	if got := e.backendImage(); got != "pinned:v1" {
		t.Fatalf("versions.env not honored: %q", got)
	}
	if got := e.frontendImage(); got != "care_fe:clinic" {
		t.Fatalf("default not used: %q", got)
	}
	e.Env = map[string]string{"BACKEND_IMAGE": "override:v2"}
	if got := e.backendImage(); got != "override:v2" {
		t.Fatalf("Env override not honored: %q", got)
	}
}

// Real docker plumbing: drive compose for two light services, confirm the engine
// brings them up under the isolated project, then clean up. Skips without docker.
func TestComposeWiring(t *testing.T) {
	if exec.Command("docker", "version").Run() != nil {
		t.Skip("docker not available")
	}
	kit, err := filepath.Abs("../../..")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(kit, "docker-compose.yml")); err != nil {
		t.Skipf("kit not found at %s", kit)
	}
	var logs strings.Builder
	e := &Engine{Kit: kit, Log: func(s string) { logs.WriteString(s + "\n") }}
	t.Cleanup(func() { _ = e.dc("down") }) // no -v: volumes survive

	if err := e.dc("up", "-d", "db", "redis"); err != nil {
		t.Fatalf("compose up failed: %v\n%s", err, logs.String())
	}
	status, err := e.Status()
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(status, "db") || !strings.Contains(status, "redis") {
		t.Fatalf("services not in status:\n%s", status)
	}
}
