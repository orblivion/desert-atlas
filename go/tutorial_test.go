package main

import (
	"testing"
)

func TestGetTutorialType(t *testing.T) {

	tests := []struct {
		perms Permissions
		ttype TutorialType
	}{
		{Permissions{"bookmark", "download"}, TutorialTypeDownloader},
		{Permissions{"bookmark"}, TutorialTypeBookmarker},
		{Permissions{"download"}, TutorialTypeDownloader},
		{Permissions{}, TutorialTypeViewer},
	}

	for _, tt := range tests {
		if got, want := GetTutorialType(tt.perms), tt.ttype; want != got {
			t.Errorf(`For: %v got: %s want: %s`, tt.perms, got, want)
		}
	}
}
