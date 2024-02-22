package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
)

// The purpose of this is to reset the user's tutorial mode to intro if the
// permissions change, since there's a different set of instructions
type TutorialType string

const TutorialTypeDownloader = TutorialType("TUTORIAL_TYPE_DOWNLOADER")
const TutorialTypeBookmarker = TutorialType("TUTORIAL_TYPE_BOOKMARKER")
const TutorialTypeViewer = TutorialType("TUTORIAL_TYPE_VIEWER")

type TutorialMode string

const TutorialModeIntro = TutorialMode("TUTORIAL_INTRO")
const TutorialModeStarted = TutorialMode("TUTORIAL_STARTED")
const TutorialModeDone = TutorialMode("TUTORIAL_DONE")

type TutorialStatus struct {
	Mode TutorialMode `json:"mode"`
	Type TutorialType `json:"type"`
}

type TutorialFile map[SandstormUserId]TutorialStatus

type TutorialUpdate struct {
	Mode TutorialMode `json:"tutorial-mode"`
}

func (s *Server) tutorialFilePath() string {
	return filepath.Join(s.userDataPath(), "tutorial.json")
}

func (s *Server) tutorialCreateTempFile() (*os.File, error) {
	// Create the temp file in the same dir to make sure it's in the same partition.
	// Previously I'd created it under /tmp but there was a problem doing os.Rename after.
	return os.CreateTemp(s.userDataPath(), "tutorial.*.json.tmp")
}

func (s *Server) InitTutorial() error {
	_, err := os.Stat(s.tutorialFilePath())

	// No error means it exists, so nothing to initialize
	if err == nil {
		return nil
	}

	// os.IsNotExist error means it doesn't exist yet, initialize it
	if os.IsNotExist(err) {
		return os.WriteFile(s.tutorialFilePath(), []byte("{}"), 0640)
	}

	// Some other error means all bets are off, don't proceed
	return fmt.Errorf("Unknown error accessing tutorial file")
}

func GetTutorialType(pp Permissions) TutorialType {
	switch {
	case pp.Has(PermissionDownload):
		return TutorialTypeDownloader
	case pp.Has(PermissionBookmarks):
		return TutorialTypeBookmarker
	default:
		return TutorialTypeViewer
	}
}

func validateTutorialMode(m TutorialMode) bool {
	switch m {
	case TutorialModeIntro:
		return true
	case TutorialModeStarted:
		return true
	case TutorialModeDone:
		return true
	default:
		return false
	}
}

func (s *Server) TutorialModeHandler(w http.ResponseWriter, r *http.Request) {
	var update TutorialUpdate
	err := json.NewDecoder(r.Body).Decode(&update)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	if !validateTutorialMode(update.Mode) {
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	// TODO - this gets a bit scary race-condition-wise,
	// but tutorial is not super important.
	// probably move this to sqlite3 tho.
	var tf TutorialFile
	rFile, err := os.Open(s.tutorialFilePath())
	if err != nil {
		fmt.Printf("Error opening tutorial json file: %s\n", err.Error())
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	if err = json.NewDecoder(rFile).Decode(&tf); err != nil {
		fmt.Printf("Error decoding json: %s\n", err.Error())
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	if userId := GetSandstormUserId(r); userId != nil {
		tf[*userId] = TutorialStatus{
			Mode: TutorialMode(update.Mode),
			Type: GetTutorialType(SandstormPermissions(r)),
		}

		// Write result to temp file
		wFile, err := s.tutorialCreateTempFile()
		if err != nil {
			fmt.Printf("Error creating temp file: %s\n", err.Error())
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		if err = json.NewEncoder(wFile).Encode(&tf); err != nil {
			fmt.Printf("Error encoding json: %s\n", err.Error())
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		wFile.Close()

		// Rename temp file to our real file
		if err = os.Rename(wFile.Name(), s.tutorialFilePath()); err != nil {
			fmt.Printf("Error renaming file: %s\n", err.Error())
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
	}
}
