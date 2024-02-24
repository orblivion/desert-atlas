package main

import (
	"github.com/gorilla/mux"
	"log"
	"net/http"
	"os"
	"slices"
)

func main() {
	var s Server
	var err error

	isLocal := slices.Contains(os.Args[1:], "--local")

	one, _ := os.LookupEnv("SANDSTORM")

	if isLocal {
		if one == "1" {
			log.Fatalf("Server appears to be running within Sandstorm; run without --local ?")
		}
		s, err = initLocalServer()
		if err != nil {
			log.Fatalf("Error initializing local Server: %v", err)
		}
	} else {
		if one != "1" {
			log.Fatalf("Server appears to be running locally; run with --local ?")
		}
		s, err = initSandstormServer()
		if err != nil {
			log.Fatalf("Error initializing Server for sandstorm: %v", err)
		}
	}

	s.InitTutorial()

	r := mux.NewRouter()
	r.HandleFunc("/app-go/tutorial-mode", s.TutorialModePostHandler).Methods("POST")
	r.HandleFunc("/_internal/tutorial-mode", s.TutorialModeGetHandler).Methods("GET")

	log.Println("Serving at localhost:3858")
	log.Fatal((&http.Server{Handler: r, Addr: "localhost:3858"}).ListenAndServe())
}
