package main

import (
	"fmt"
	"net/http"
	"testing"
)

// Confirms they're both or neither nil. If neither,
// compares the *values* of the strings.
func cmpSidPtrs(a *SandstormUserId, b *SandstormUserId) bool {
	if a == nil && b == nil {
		return true
	}
	return *a == *b
}

func logSidPtr(s *SandstormUserId) string {
	return logStrPtr((*string)(s))
}

func logStrPtr(s *string) string {
	if s == nil {
		return "nil"
	}
	return "\"" + *s + "\""
}

func TestIsLocalDev(t *testing.T) {
	sWrong := "wrong"
	sTrue := "true"
	sBlank := ""

	req, _ := http.NewRequest("GET", "", nil)
	req.Header.Set("X-Local-Development", sTrue)
	if !IsLocalDev(req) {
		t.Errorf(`X-Local-Development = "%s" expected to return true`, sTrue)
	}

	wrongTests := [](*string){
		nil, &sWrong, &sBlank,
	}

	for _, val := range wrongTests {
		req, _ := http.NewRequest("GET", "", nil)
		if val != nil {
			req.Header.Set("X-Local-Development", *val)
		}
		if IsLocalDev(req) {
			t.Errorf(`X-Local-Development = %s expected to return false`, logStrPtr(val))
		}
	}
}

func TestGetSandstormUserId(t *testing.T) {
	sTest := "test-id"
	sidTest := SandstormUserId(sTest)
	sBlank := ""

	req, _ := http.NewRequest("GET", "", nil)
	req.Header.Set("X-Sandstorm-User-Id", sTest)
	if got, want := GetSandstormUserId(req), &sidTest; !cmpSidPtrs(got, want) {
		t.Errorf(`X-Sandstorm-User-Id = %s expected to return %s`, sTest, sidTest)
	}

	req, _ = http.NewRequest("GET", "", nil)
	if GetSandstormUserId(req) != nil {
		t.Errorf(`X-Sandstorm-User-Id = nil expected to return nil`)
	}

	req, _ = http.NewRequest("GET", "", nil)
	req.Header.Set("X-Sandstorm-User-Id", sBlank)
	if GetSandstormUserId(req) != nil {
		t.Errorf(`X-Sandstorm-User-Id = \"%s\" expected to return nil`, sBlank)
	}
}

func TestSandstormPermissions(t *testing.T) {
	sTrue := "true"
	sBookmarks := "bookmarks"
	sDownload := "download"
	sDownloadBookmarks := "download,bookmarks"
	sBookmarksDownload := "bookmarks,download"
	sBlank := ""

	tests := []struct {
		ssPerm            *string
		localDev          *string
		bookmarksExpected bool
		downloadExpected  bool
	}{
		// local dev is false, sandstorm not set
		{
			ssPerm:            nil,
			localDev:          nil,
			bookmarksExpected: false,
			downloadExpected:  false,
		},

		// local dev is true, sandstorm maybe set to something
		{
			ssPerm:            nil,
			localDev:          &sTrue,
			bookmarksExpected: true,
			downloadExpected:  true,
		},
		{
			ssPerm:            &sBlank,
			localDev:          &sTrue,
			bookmarksExpected: true,
			downloadExpected:  true,
		},
		{
			ssPerm:            &sBookmarks,
			localDev:          &sTrue,
			bookmarksExpected: true,
			downloadExpected:  true,
		},
		{
			ssPerm:            &sBookmarks,
			localDev:          &sTrue,
			bookmarksExpected: true,
			downloadExpected:  true,
		},

		// local dev is false, sandstorm set to something
		{
			ssPerm:            &sBookmarks,
			localDev:          nil,
			bookmarksExpected: true,
			downloadExpected:  false,
		},
		{
			ssPerm:            &sDownload,
			localDev:          nil,
			bookmarksExpected: false,
			downloadExpected:  true,
		},
		{
			ssPerm:            &sDownloadBookmarks,
			localDev:          nil,
			bookmarksExpected: true,
			downloadExpected:  true,
		},
		{
			ssPerm:            &sBookmarksDownload,
			localDev:          nil,
			bookmarksExpected: true,
			downloadExpected:  true,
		},
	}

	for _, tt := range tests {
		req, _ := http.NewRequest("GET", "", nil)
		if tt.ssPerm != nil {
			req.Header.Set("X-Sandstorm-Permissions", *tt.ssPerm)
		}
		if tt.localDev != nil {
			req.Header.Set("X-Local-Development", *tt.localDev)
		}

		errMsgPart := fmt.Sprintf(`X-Sandstorm-Permissions: %s, X-Local-Development: %s`, logStrPtr(tt.ssPerm), logStrPtr(tt.localDev))

		if got, want := SandstormPermissions(req).Has(PermissionBookmarks), tt.bookmarksExpected; want != got {
			t.Errorf(`%s Bookmarks permission expected: %v got: %v`, errMsgPart, want, got)
		}

		if got, want := SandstormPermissions(req).Has(PermissionDownload), tt.downloadExpected; want != got {
			t.Errorf(`%s Download permission expected: %v got: %v`, errMsgPart, want, got)
		}
	}

}
