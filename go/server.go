package main

import (
	"fmt"
	"os"
	"path/filepath"
)

func (s *Server) userDataPath() string {
	return filepath.Join(s.baseDir, "data")
}

// Server for running plain and locally
func initLocalServer() (s Server, err error) {
	// Can't mess with /var if not in sandstorm so we put it somewhere else.
	// For now, not randomizing it so that it syncs with the python server.
	// And, this will probably be so rarely used that I don't care to randomize it anyway.
	// If anything maybe it should be a param that the user can pass in so they
	// can save it in their home dir in between runs.
	const localBase = "/tmp/desert-atlas-fe66b63c13a042734a5aee2341fa1240"

	if err = makeDirExist(localBase); err != nil {
		return
	}

	s = Server{localBase}

	if err = s.makeSubDirs(); err != nil {
		return
	}

	return
}

// Create dir if not exists yet
func makeDirExist(path string) error {
	_, err := os.Stat(path)

	// No error means it exists, so nothing to initialize
	if err == nil {
		return nil
	}

	if !os.IsNotExist(err) {
		// Some error other than os.IsNotExist means all bets are off, don't proceed
		return fmt.Errorf("Unknown error checking for dir: %s", path)
	}

	// os.IsNotExist error means it doesn't exist yet, initialize it
	return os.Mkdir(path, 0750)
}

// Server for running inside Sandstorm
func initSandstormServer() (s Server, err error) {
	s = Server{"/var"}
	err = s.makeSubDirs()

	return
}

func (s *Server) makeSubDirs() error {
	return makeDirExist(s.userDataPath())
}

type Server struct {
	baseDir string
}
