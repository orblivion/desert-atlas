package main

import (
	"reflect"
	"strings"
	"testing"
)

func sPtr(s string) *string {
	return &s
}

func TestInitBookmarksDB(t *testing.T) {
	// Don't init db here, call the init function below
	s := initTestServer()
	defer teardownTestServer(&s)

	var err error

	// Confirm lack of database
	if s.bookmarksDB != nil {
		t.Fatalf("Expected no bookmarks db to exist yet")
	}

	// Create the DB
	if err = s.initBookmarksDB(); err != nil {
		t.Fatal(err)
	}

	// Confirm success making a query (even if there is no data)
	rows, err := s.bookmarksDB.Query("SELECT * from bookmarks")
	if err != nil {
		t.Fatalf("Error querying bookmarks db: %s", err.Error())
	}
	defer rows.Close()

	// Confirm that the columns are as expected
	got, err := rows.Columns()
	if err != nil {
		t.Fatalf("Error getting bookmarks db columns: %s", err.Error())
	}

	if want := []string{"id", "version", "name", "lat", "lng"}; !reflect.DeepEqual(got, want) {
		t.Fatalf("Unexpected columns for bookmarks db. Got: %s", got)
	}
}

func TestInsertBookmark(t *testing.T) {
	s := initTestServer(testServerParams{useBookmarksDB: true})
	defer teardownTestServer(&s)

	none := []Bookmark{}
	err := s.bookmarksDB.Select(&none, "SELECT * from bookmarks")
	if err != nil {
		t.Fatalf("Error querying bookmarks: %s", err.Error())
	}
	if len(none) != 0 {
		t.Fatalf("Expected no bookmarks")
	}

	name := "my_name"
	lat := "12.34"
	lng := "-56.78"

	bookmark, err := s.insertBookmark(name, lat, lng)
	if err != nil {
		t.Fatalf("Error inserting bookmark: %s", err.Error())
	}

	if strings.Count(string(bookmark.ID), "-") != 4 {
		t.Fatalf("Didn't get a uuid. Got: %+v", bookmark.ID)
	}

	if want, got := 0, bookmark.Version; want != got {
		t.Fatalf("Didn't get expected name. Want: %+v Got: %+v", want, got)
	}

	if want, got := name, bookmark.Name; want != got {
		t.Fatalf("Didn't get expected name. Want: %+v Got: %+v", want, got)
	}

	if want, got := lat, bookmark.Lat; want != got {
		t.Fatalf("Didn't get expected lat. Want: %+v Got: %+v", want, got)
	}

	if want, got := lng, bookmark.Lng; want != got {
		t.Fatalf("Didn't get expected lng. Want: %+v Got: %+v", want, got)
	}

	dbBookmark := []Bookmark{}
	err = s.bookmarksDB.Select(&dbBookmark, "SELECT * from bookmarks")
	if err != nil {
		t.Fatalf("Error querying bookmarks: %s", err.Error())
	}
	if len(dbBookmark) != 1 {
		t.Fatalf("Expected one bookmark")
	}
	if !reflect.DeepEqual(bookmark, dbBookmark[0]) {
		t.Fatalf(
			"Expected generated and returned bookmark to be the same as what's in the db. returned: %+v db: %+v",
			bookmark,
			dbBookmark,
		)
	}
}

func TestInsertBookmarkErrors(t *testing.T) {
	s := initTestServer(testServerParams{useBookmarksDB: true})
	defer teardownTestServer(&s)

	tests := []struct {
		name        string
		lat         string
		lng         string
		errFragment *string
	}{
		// some allowed formats
		{"name", "23.456", "23.456", nil},
		{"name", ".456", ".456", nil},
		{"name", "23", "23", nil},
		{"name", "-23", "-23", nil},
		{"name", "-.1", "-.1", nil},
		{"name", "-90", "-180", nil},
		{"name", "90", "180", nil},

		// error with name
		{"", "23.456", "23.456", sPtr("missing name")},

		// error with lat
		{"name", "", "23.456", sPtr("empty string")},
		{"name", "23.456e10", "23.456", sPtr("unexpected characters")}, // don't want this usually allowed form at least for now
		{"name", "023.456", "23.456", sPtr("leading zero")},            // don't want this usually allowed form at least for now
		{"name", "-90.01", "23.456", sPtr("out of bounds")},
		{"name", "90.01", "23.456", sPtr("out of bounds")},

		// error with lng
		{"name", "23.456", "", sPtr("empty string")},
		{"name", "23.456", "23.456e10", sPtr("unexpected characters")}, // don't want this usually allowed form at least for now
		{"name", "23.456", "023.456", sPtr("leading zero")},            // don't want this usually allowed form at least for now
		{"name", "23.456", "-180.01", sPtr("out of bounds")},
		{"name", "23.456", "180.01", sPtr("out of bounds")},
	}

	for _, tt := range tests {
		_, err := s.insertBookmark(tt.name, tt.lat, tt.lng)
		if tt.errFragment == nil && err != nil {
			t.Errorf(`For: %v expected no error, got: %s`, tt, err.Error())
		}

		if tt.errFragment != nil && err == nil {
			t.Errorf(`For: %v got no error, expected %s`, tt, *tt.errFragment)
		}

		if err != nil && tt.errFragment != nil && !strings.Contains(err.Error(), *tt.errFragment) {
			t.Errorf(`For: %v expected error to contain: %s got: %s`, tt, *tt.errFragment, err.Error())
		}
	}
}
