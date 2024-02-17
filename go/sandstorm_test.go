package main

import (
	"fmt"
	"net/http"
	"testing"
)

func logMe(s *string) string {
	if s == nil {
		return "nil"
	}
	return "\"" + *s + "\""
}

func TestSandstormPermissions(t *testing.T) {

	sWrong := "wrong"
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
		{
			ssPerm:            nil,
			localDev:          &sWrong,
			bookmarksExpected: false,
			downloadExpected:  false,
		},
		{
			ssPerm:            nil,
			localDev:          &sBlank,
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

		errMsgPart := fmt.Sprintf(`X-Sandstorm-Permissions: %s, X-Local-Development: %s`, logMe(tt.ssPerm), logMe(tt.localDev))

		if got, want := SandstormPermissions(req).Has(PermissionBookmarks), tt.bookmarksExpected; want != got {
			t.Errorf(`%s Bookmarks permission expected: %v got: %v`, errMsgPart, want, got)
		}

		if got, want := SandstormPermissions(req).Has(PermissionDownload), tt.downloadExpected; want != got {
			t.Errorf(`%s Download permission expected: %v got: %v`, errMsgPart, want, got)
		}
	}

}
