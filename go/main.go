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

	if isLocal {
		s, err = initLocalServer()
		if err != nil {
			log.Fatalf("Error initializing local Server: %v", err)
		}
	} else {
		s, err = initSandstormServer()
		if err != nil {
			log.Fatalf("Error initializing Server for sandstorm: %v", err)
		}
	}

	s.InitTutorial()

	r := mux.NewRouter()
	r.HandleFunc("/app-go/tutorial-mode", s.TutorialModeHandler).Methods("POST")

	log.Println("Serving at localhost:3858")
	log.Fatal((&http.Server{Handler: r, Addr: "localhost:3858"}).ListenAndServe())
}
