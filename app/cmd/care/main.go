// Command care is the terminal entrypoint to the CARE clinic engine — the Go
// replacement for care.sh. It runs the same engine the desktop app uses.
//
//	care setup | start | stop | restart | rebuild-backend | rebuild-frontend | status | backup-now
//
// The kit dir defaults to the current directory (override with CARE_CLINIC_DIR).
package main

import (
	"fmt"
	"os"

	"care-clinic/app/internal/care"
)

func main() {
	if len(os.Args) < 2 {
		usage()
		os.Exit(1)
	}
	kit := os.Getenv("CARE_CLINIC_DIR")
	if kit == "" {
		kit, _ = os.Getwd()
	}
	e := &care.Engine{
		Kit: kit,
		Log: func(s string) { fmt.Println(s) },
	}

	var err error
	switch os.Args[1] {
	case "setup":
		err = e.Setup()
	case "start":
		err = e.Start()
	case "stop":
		err = e.Stop()
	case "restart":
		err = e.Restart()
	case "rebuild-backend":
		err = e.RebuildBackend()
	case "rebuild-frontend":
		err = e.RebuildFrontend()
	case "status":
		var out string
		if out, err = e.Status(); err == nil {
			fmt.Print(out)
		}
	case "backup-now":
		err = e.BackupNow()
	default:
		usage()
		os.Exit(1)
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}

func usage() {
	fmt.Fprintln(os.Stderr, "usage: care [setup|start|stop|restart|rebuild-backend|rebuild-frontend|status|backup-now]")
}
