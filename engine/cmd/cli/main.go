package main

import (
	"flag"
	"fmt"
	"log"
	"os"
	"strings"

	mikrotikhotspot "gopkg.gilang.dev/mikrotik/hotspot"
)

func main() {
	var (
		bind        = flag.String("bind", ":8080", "Address to listen on (e.g. :8080)")
		templateDir = flag.String("templates", "templates/mikrotik-default", "Path to hotspot template directory")
		hostname    = flag.String("hostname", "127.0.0.1:8080", "Hostname shown in hotspot links")
		identity    = flag.String("identity", "MikroTik", "RouterOS identity name")
		serverName  = flag.String("server-name", "hotspot1", "HotSpot server name")
		users       = flag.String("users", "admin:admin,user:password", "Comma-separated user:password pairs")
		allowTrial  = flag.Bool("trial", false, "Allow trial access (T-<mac> username)")
	)
	flag.Usage = func() {
		fmt.Fprintf(os.Stderr, "Usage: hotspot-sim [flags]\n\nFlags:\n")
		flag.PrintDefaults()
		fmt.Fprintf(os.Stderr, "\nExamples:\n")
		fmt.Fprintf(os.Stderr, "  hotspot-sim -bind :8080 -users admin:secret,guest:guest\n")
		fmt.Fprintf(os.Stderr, "  hotspot-sim -bind :9090 -templates ./my-theme -trial\n")
	}
	flag.Parse()

	cfg := mikrotikhotspot.DefaultConfig()
	cfg.BindAddress = *bind
	cfg.TemplateDir = *templateDir
	cfg.Hostname = *hostname
	cfg.Identity = *identity
	cfg.ServerName = *serverName
	cfg.ServerAddress = *hostname
	cfg.AllowTrial = *allowTrial

	sim := mikrotikhotspot.NewSimulator(cfg)

	for _, pair := range strings.Split(*users, ",") {
		pair = strings.TrimSpace(pair)
		if pair == "" {
			continue
		}
		parts := strings.SplitN(pair, ":", 2)
		if len(parts) != 2 {
			log.Printf("warning: skipping invalid user entry %q (expected user:password)", pair)
			continue
		}
		sim.AddUser(parts[0], parts[1])
		log.Printf("[hotspot] registered user: %s", parts[0])
	}

	log.Printf("[hotspot] MikroTik HotSpot Simulator")
	log.Printf("[hotspot] open http://%s in your browser", *hostname)
	if err := sim.ListenAndServe(); err != nil {
		log.Fatalf("server error: %v", err)
	}
}
