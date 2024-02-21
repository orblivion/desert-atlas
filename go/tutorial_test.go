package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"reflect"
	"strings"
	"testing"
)

func TestGetTutorialType(t *testing.T) {
	tests := []struct {
		perms Permissions
		ttype TutorialType
	}{
		{Permissions{PermissionBookmarks, PermissionDownload}, TutorialTypeDownloader},
		{Permissions{PermissionBookmarks}, TutorialTypeBookmarker},
		{Permissions{PermissionDownload}, TutorialTypeDownloader},
		{Permissions{}, TutorialTypeViewer},
	}

	for _, tt := range tests {
		if got, want := GetTutorialType(tt.perms), tt.ttype; want != got {
			t.Errorf(`For: %v got: %s want: %s`, tt.perms, got, want)
		}
	}
}

func TestValidateTutorialMode(t *testing.T) {
	if !validateTutorialMode(TutorialModeIntro) {
		t.Errorf(`Expected TutorialModeIntro to be valid`)
	}
	if !validateTutorialMode(TutorialModeStarted) {
		t.Errorf(`Expected TutorialModeStarted to be valid`)
	}
	if !validateTutorialMode(TutorialModeDone) {
		t.Errorf(`Expected TutorialModeDone to be valid`)
	}
	if validateTutorialMode(TutorialMode("invalid")) {
		t.Errorf(`Expected "invalid" to be invalid`)
	}
}

func TestTutorialInit(t *testing.T) {
	s := initTestServer()
	defer teardownTestServer(&s)

	parts := strings.Split(s.tutorialFilePath(), "/")
	if parts[len(parts)-1] != "tutorial.json" {
		t.Fatal("tutorial path not as expected")
	}

	if _, err := os.Stat(s.tutorialFilePath()); err == nil || !os.IsNotExist(err) {
		t.Fatal("tutorial path shouldn't exist yet")
	}

	if s.InitTutorial() != nil {
		t.Fatalf("error initializing tutorial")
	}

	if content, err := os.ReadFile(s.tutorialFilePath()); string(content) != "{}" || err != nil {
		t.Fatalf("tutorial file should be initialized to {}. content: %s err: %v", string(content), err)
	}

	testData := "{1:2}"
	// write other data
	if err := os.WriteFile(s.tutorialFilePath(), []byte(testData), 0600); err != nil {
		t.Fatalf("error writing test data %s", err.Error())
	}
	if s.InitTutorial() != nil {
		t.Fatalf("error initializing tutorial (second time)")
	}
	content, err := os.ReadFile(s.tutorialFilePath())
	if err != nil {
		t.Fatalf("error reading test data %s", err.Error())
	}
	if string(content) != testData {
		t.Fatal("tutorial file initialization shouldn't overwrite existing data")
	}
}

func TestGetTutorialModeHandler(t *testing.T) {
	s := initTestServer()
	defer teardownTestServer(&s)

	if s.InitTutorial() != nil {
		t.Fatalf("error initializing tutorial")
	}

	testUserId := "test-user-id"
	testSUserId := SandstormUserId(testUserId)

	tests := []struct {
		hasUserId             bool
		hasBookmarkPermission bool
		hasValidMode          bool
		statusCode            int
		want                  TutorialFile
	}{
		// with invalid mode, return 400 regardless of user id and permission
		{hasUserId: true, hasBookmarkPermission: true, hasValidMode: false, statusCode: http.StatusBadRequest, want: TutorialFile{}},
		{hasUserId: true, hasBookmarkPermission: false, hasValidMode: false, statusCode: http.StatusBadRequest, want: TutorialFile{}},
		{hasUserId: false, hasBookmarkPermission: true, hasValidMode: false, statusCode: http.StatusBadRequest, want: TutorialFile{}},
		{hasUserId: false, hasBookmarkPermission: false, hasValidMode: false, statusCode: http.StatusBadRequest, want: TutorialFile{}},

		// with no user id and valid mode, regardless of permission, return 200 but no entry created
		{hasUserId: false, hasBookmarkPermission: true, hasValidMode: true, statusCode: http.StatusOK, want: TutorialFile{}},
		{hasUserId: false, hasBookmarkPermission: false, hasValidMode: true, statusCode: http.StatusOK, want: TutorialFile{}},

		// with user id and valid mode, permission determines type of entry created
		{hasUserId: true, hasBookmarkPermission: false, hasValidMode: true, statusCode: http.StatusOK, want: TutorialFile{
			testSUserId: {
				Mode: TutorialModeStarted,
				Type: TutorialTypeViewer,
			},
		}},
		{hasUserId: true, hasBookmarkPermission: true, hasValidMode: true, statusCode: http.StatusOK, want: TutorialFile{
			testSUserId: {
				Mode: TutorialModeStarted,
				Type: TutorialTypeBookmarker,
			},
		}},
	}

	for _, tt := range tests {
		if os.WriteFile(s.tutorialFilePath(), []byte("{}"), 0600) != nil {
			t.Fatal("error resetting tutorial file")
		}

		var mode TutorialMode
		if tt.hasValidMode {
			mode = TutorialModeStarted
		} else {
			mode = TutorialMode("invalid")
		}
		requestBody := []byte(fmt.Sprintf(`{"tutorial-mode": "%s"}`, mode))
		req := httptest.NewRequest(http.MethodPost, "/app-go/tutorial-mode", bytes.NewBuffer(requestBody))
		if tt.hasUserId {
			req.Header.Set("X-Sandstorm-User-Id", testUserId)
		}
		if tt.hasBookmarkPermission {
			req.Header.Set("X-Sandstorm-Permissions", "bookmarks")
		}
		w := httptest.NewRecorder()
		s.TutorialModeHandler(w, req)

		var got TutorialFile
		file, _ := os.Open(s.tutorialFilePath())
		json.NewDecoder(file).Decode(&got)

		if tt.statusCode != w.Code {
			t.Errorf("for: %+v status code want: %+v got: %+v", tt, tt.statusCode, w.Code)
		}
		if !reflect.DeepEqual(tt.want, got) {
			t.Errorf("for: %+v tutorial file entry want: %+v got: %+v", tt, tt.want, got)
		}
	}
}
