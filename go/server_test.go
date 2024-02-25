package main

import (
	"fmt"
	"log"
	"os"
	"strings"
	"testing"
	"time"
)
type testServerParams struct {
	skipSubDirs bool
}

func initTestServer(paramsSlice ...testServerParams) Server {
	if len(paramsSlice) > 1 {
		log.Fatal("Don't put more than one testServerParams struct")
	}
	params := testServerParams{}
	if len(paramsSlice) == 1 {
		params = paramsSlice[0]
	}

	dir, err := os.MkdirTemp("", "tutorial-test")
	if err != nil {
		log.Fatal(err)
	}
	s := Server{baseDir: dir}

	if !params.skipSubDirs {
		if err := s.makeSubDirs(); err != nil {
			log.Fatal(err)
		}
	}
	return s
}

func teardownTestServer(s *Server) {
	// Do a final sanity check to make sure we're not accidentally deleting
	// something important
	if strings.HasPrefix(s.baseDir, "/tmp") && strings.Contains(s.baseDir, "tutorial-test") {
		os.RemoveAll(s.baseDir)
	} else {
		fmt.Println("Won't delete unexpected test baseDir: " + s.baseDir)
	}
}

func TestMakeSubDirs(t *testing.T) {
	// skipSubDirs so we can test the dir creation
	s := initTestServer(testServerParams{skipSubDirs: true})
	defer teardownTestServer(&s)

	if _, err := os.Stat(s.userDataPath()); err == nil || !os.IsNotExist(err) {
		t.Fatalf("user sub path shouldn't exist yet: %s", err.Error())
	}

	if err := s.makeSubDirs(); err != nil {
		t.Fatal("expected no error making subdirs")
	}

	if _, err := os.Stat(s.userDataPath()); err != nil {
		t.Fatal("user sub path should exist now")
	}
}

// More carefully test the plumbing of the dir creation func
func TestMakeDirExist(t *testing.T) {
	// want a unique path that hasn't been created yet
	path := fmt.Sprintf("/tmp/test-make-dir-exist-%d", time.Now().UnixNano())

	if _, err := os.Stat(path); err == nil || !os.IsNotExist(err) {
		t.Fatalf("dir shouldn't exist yet: %s", err.Error())
	}

	if err := makeDirExist(path); err != nil {
		t.Fatal("expected no error making dir")
	}

	if _, err := os.Stat(path); err != nil {
		t.Fatal("dir should exist now")
	}

	if err := makeDirExist(path); err != nil {
		t.Fatal("expected no error trying to make dir after it already exists")
	}

	if _, err := os.Stat(path); err != nil {
		t.Fatal("dir should still exist")
	}
}
